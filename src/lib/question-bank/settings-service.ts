import { Prisma, SettingScope, SettingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeBankAudit } from "@/lib/question-bank/audit";
import {
  BANK_DEFAULTS,
  BANK_SETTING_KEYS,
  BANK_SETTING_META,
  completeBankSettings,
  effectiveBankSettings,
  isNarrowing,
  parseBankSetting,
  settingProblems,
  type BankSettingKey,
  type BankSettingValues,
} from "@/lib/question-bank/settings";

// The database side of the question bank's switches: SettingValue rows (scope GLOBAL = the school-wide value, scope BRANCH = a branch's own), read through the pure
// resolver in settings.ts and changed through `changeBankSettings`, which validates, enforces "a branch may only narrow" and writes one audit row per change in the
// same transaction. The routes (settings/route.ts) only decide WHO may call; every rule about WHAT is here.

type Raw = Record<string, unknown>;
type Client = Prisma.TransactionClient | typeof prisma;

const isBankKey = (key: string): key is BankSettingKey => (BANK_SETTING_KEYS as readonly string[]).includes(key);

/// The stored raw values: the school-wide rows, and (when a branch is named) that branch's. A key stored twice school-wide (the nullable branch column cannot stop a
/// race) resolves to the most recently updated.
export async function readBankRows(client: Client, branchId: string | null): Promise<{ global: Raw; branch: Raw }> {
  const rows = await client.settingValue.findMany({
    where: {
      key: { startsWith: "bank." },
      status: SettingStatus.APPROVED,
      OR: branchId ? [{ scope: SettingScope.GLOBAL }, { scope: SettingScope.BRANCH, branchId }] : [{ scope: SettingScope.GLOBAL }],
    },
    orderBy: { updatedAt: "asc" },
    select: { scope: true, key: true, value: true },
  });
  const global: Raw = Object.create(null) as Raw;
  const branch: Raw = Object.create(null) as Raw;
  for (const row of rows) (row.scope === SettingScope.GLOBAL ? global : branch)[row.key] = row.value;
  return { global, branch };
}

/// The settings that apply to a branch (or the school-wide ones when `branchId` is null).
export async function getEffectiveBankSettings(branchId: string | null): Promise<BankSettingValues> {
  const { global, branch } = await readBankRows(prisma, branchId);
  return effectiveBankSettings(global, branch);
}

export type BankSettingRow = {
  key: BankSettingKey;
  label: string;
  help: string;
  kind: "flag" | "whole" | "presets" | "images";
  min: number | null;
  max: number | null;
  unit: string | null;
  stricter: string;
  /// The built-in start value.
  default: BankSettingValues[BankSettingKey];
  /// The school-wide value (the default when none is stored).
  school: BankSettingValues[BankSettingKey];
  /// This branch's own value, or null when it has none (or it is not valid).
  override: BankSettingValues[BankSettingKey] | null;
  /// What actually applies, after narrowing and after the numbers are made to agree.
  effective: BankSettingValues[BankSettingKey];
};

/// What the settings screen shows: for each key the default, the school's value, the branch's override and the effective value.
export async function bankSettingsView(branchId: string | null): Promise<BankSettingRow[]> {
  const { global, branch } = await readBankRows(prisma, branchId);
  const school = completeBankSettings(global);
  const effective = effectiveBankSettings(global, branch);
  return BANK_SETTING_KEYS.map((key) => {
    const meta = BANK_SETTING_META[key];
    const mine = branchId ? parseBankSetting(key, Object.hasOwn(branch, key) ? branch[key] : undefined) : { ok: false as const };
    return {
      key,
      label: meta.label,
      help: meta.help,
      kind: meta.kind,
      min: meta.min ?? null,
      max: meta.max ?? null,
      unit: meta.unit ?? null,
      stricter: meta.stricter,
      default: BANK_DEFAULTS[key],
      school: school[key],
      override: mine.ok ? (mine.value as BankSettingValues[BankSettingKey]) : null,
      effective: effective[key],
    };
  });
}

export type ChangeInput = {
  actorUserId: string;
  /// Whether the caller is a superadmin: only a superadmin changes the school-wide values (checked here as well as in the route).
  isSuperAdmin: boolean;
  scope: "GLOBAL" | "BRANCH";
  branchId: string | null;
  /// key -> the new value, or null to clear (a branch's override goes away; a school-wide value goes back to the default).
  changes: Raw;
  reason?: string | null;
};

export type ChangeResult =
  | { ok: true; changed: BankSettingKey[]; settings: BankSettingRow[] }
  | {
      ok: false;
      status: 400 | 403 | 404;
      code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND";
      message: string;
      details: { path: string; message: string }[];
    };

const refuse = (
  status: 400 | 403 | 404,
  code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND",
  message: string,
  details: { path: string; message: string }[] = [],
) => ({ ok: false, status, code, message, details }) satisfies ChangeResult;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function changeBankSettings(input: ChangeInput): Promise<ChangeResult> {
  if (input.scope === "GLOBAL" && !input.isSuperAdmin)
    return refuse(403, "FORBIDDEN", "Only a school-wide administrator can change the school-wide settings.");
  if (input.scope === "GLOBAL" && input.branchId) return refuse(400, "VALIDATION", "A school-wide change does not name a branch.");
  if (input.scope === "BRANCH" && !input.branchId) return refuse(400, "VALIDATION", "A branch change needs the branch.");

  const keys = Object.keys(input.changes);
  if (keys.length === 0) return refuse(400, "VALIDATION", "Nothing to change.");
  const unknown = keys.filter((key) => !isBankKey(key));
  if (unknown.length > 0)
    return refuse(
      400,
      "VALIDATION",
      "Some of those are not question bank settings.",
      unknown.slice(0, 20).map((key) => ({ path: `changes.${key.slice(0, 80)}`, message: "Unknown question bank setting." })),
    );

  // Each new value on its own: right type, within bounds. null means "clear".
  const parsed: Partial<Record<BankSettingKey, unknown>> = {};
  const invalid: { path: string; message: string }[] = [];
  for (const key of keys as BankSettingKey[]) {
    const value = input.changes[key];
    if (value === null) {
      parsed[key] = null;
      continue;
    }
    const result = parseBankSetting(key, value);
    if (result.ok) parsed[key] = result.value;
    else invalid.push({ path: `changes.${key}`, message: result.message });
  }
  if (invalid.length > 0) return refuse(400, "VALIDATION", "Some of the values are not valid.", invalid);

  return prisma
    .$transaction(async (tx): Promise<ChangeResult> => {
      // One change at a time: the stored values this validates against (and the old values the audit records) cannot move underneath it.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('question-bank:settings'::text))`;

      if (input.scope === "BRANCH") {
        const branch = await tx.branch.findUnique({ where: { id: input.branchId! }, select: { id: true } });
        if (!branch) return refuse(404, "NOT_FOUND", "Not found");
      }

      const { global, branch } = await readBankRows(tx, input.branchId);
      const school = completeBankSettings(global);
      const target: Raw = input.scope === "GLOBAL" ? global : branch;

      // A branch may only make a value stricter than the school's. Clearing an override is always allowed.
      if (input.scope === "BRANCH") {
        const widening: { path: string; message: string }[] = [];
        for (const key of keys as BankSettingKey[]) {
          const value = parsed[key];
          if (value === null) continue;
          if (!isNarrowing(key, school[key] as never, value as never))
            widening.push({
              path: `changes.${key}`,
              message: `A branch can only make this stricter than the school's setting. ${BANK_SETTING_META[key].stricter}`,
            });
        }
        if (widening.length > 0) return refuse(400, "VALIDATION", "A branch can only narrow a setting, not widen it.", widening);
      }

      // The school-wide numbers must agree with each other once the change is applied (default set size within the maximum, and so on), so the administrator fixes
      // them together. A branch is not asked to: it may narrow one number alone, and the resolver then makes the dependent ones fit (a set can never exceed the maximum).
      if (input.scope === "GLOBAL") {
        const after: Raw = Object.assign(Object.create(null) as Raw, target);
        for (const key of keys as BankSettingKey[]) {
          if (parsed[key] === null) delete after[key];
          else after[key] = parsed[key];
        }
        const problems = settingProblems(completeBankSettings(after));
        if (problems.length > 0)
          return refuse(
            400,
            "VALIDATION",
            problems[0],
            problems.map((message) => ({ path: "changes", message })),
          );
      }

      const scope = input.scope === "GLOBAL" ? SettingScope.GLOBAL : SettingScope.BRANCH;
      const branchId = input.scope === "GLOBAL" ? null : input.branchId;
      const changed: BankSettingKey[] = [];
      for (const key of keys as BankSettingKey[]) {
        const before = Object.hasOwn(target, key) ? target[key] : undefined;
        const next = parsed[key];
        if (next === null ? before === undefined : same(before, next)) continue; // nothing actually changes
        const existing = await tx.settingValue.findFirst({ where: { scope, branchId, key }, select: { id: true } });
        if (next === null) {
          await tx.settingValue.deleteMany({ where: { scope, branchId, key } });
        } else if (existing) {
          await tx.settingValue.update({
            where: { id: existing.id },
            data: { value: next as Prisma.InputJsonValue, status: SettingStatus.APPROVED },
          });
        } else {
          await tx.settingValue.create({
            data: { scope, branchId, key, value: next as Prisma.InputJsonValue, status: SettingStatus.APPROVED },
          });
        }
        await writeBankAudit(tx, {
          branchId,
          actorUserId: input.actorUserId,
          entity: "SETTING",
          action: next === null ? "CLEARED" : before === undefined ? "SET" : "CHANGED",
          ref: key,
          oldValue: before === undefined ? null : (before as Prisma.InputJsonValue),
          newValue: next === null ? null : (next as Prisma.InputJsonValue),
          reason: input.reason ?? null,
        });
        changed.push(key);
      }
      return { ok: true, changed, settings: [] };
    })
    .then(async (result) =>
      result.ok ? { ...result, settings: await bankSettingsView(input.scope === "GLOBAL" ? null : input.branchId) } : result,
    );
}
