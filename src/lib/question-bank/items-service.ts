import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseItem, type StoredItem } from "@/lib/question-bank/item-input";
import { writeBankAudit } from "@/lib/question-bank/audit";
import { getEffectiveBankSettings } from "@/lib/question-bank/settings-service";
import { loadViewer } from "@/lib/question-bank/viewer";
import { mayAuthorIn, mayDecide, mayEditAsSubmitter, maySubmit, staffMaySee, type BankViewer } from "@/lib/question-bank/rules";
import { NOT_FOUND, ITEM_SELECT, factsOf, fail, lockItem, refreshOverlap, snapshotOf, viewOf, type Fail, type ItemRow, type ItemView, type Tx } from "@/lib/question-bank/items-common";
import { prepareOfferBackPayload } from "@/lib/question-bank/assessments";

// Writing, submitting, reading and listing question bank items (task 0032 slice 2.1). Authority is `rules.ts`, asked with a viewer read INSIDE the transaction that changes
// anything, so a person deactivated a moment ago changes nothing. Every change is one transaction: the item, its class tags, a version snapshot (append-only) and an audit row.
// An item the person may not see is "Not found", the same answer as one that does not exist.

const ACCESS_OFF = "The question bank is switched off for your role in this branch.";

/// The `bank.access.*` switches: a school-wide or branch "off" closes the bank for that group. An administrator of the branch is held to `admins`, other staff to `staff`.
async function bankOpenFor(viewer: BankViewer, branchId: string | null): Promise<boolean> {
  if (viewer.isSuperAdmin) return true;
  const settings = await getEffectiveBankSettings(branchId);
  const administers = viewer.memberships.some((m) => m.role === "ADMIN" && (branchId === null || m.branchId === branchId));
  return administers ? settings["bank.access.admins"] : settings["bank.access.staff"];
}

function dataOf(item: StoredItem) {
  return {
    type: item.type,
    prompt: item.prompt,
    explanation: item.explanation,
    points: item.points,
    difficulty: item.difficulty,
    topic: item.topic,
    options: item.options as unknown as Prisma.InputJsonValue,
    correctAnswer: item.correctAnswer as Prisma.InputJsonValue,
    subjectLabel: item.subjectLabel,
    subjectKey: item.subjectKey,
  };
}

async function replaceTags(tx: Tx, itemId: string, tags: StoredItem["classTags"]) {
  await tx.questionBankClassTag.deleteMany({ where: { itemId } });
  if (tags.length > 0) await tx.questionBankClassTag.createMany({ data: tags.map((tag) => ({ itemId, label: tag.label, labelKey: tag.labelKey })) });
}

async function reread(tx: Tx, id: string): Promise<ItemRow> {
  return tx.questionBankItem.findUniqueOrThrow({ where: { id }, select: ITEM_SELECT });
}

export type ItemResult = { ok: true; item: ItemView } | Fail;
type Problems = { ok: false; status: 400; code: "VALIDATION"; message: string; details: { path: string; message: string }[] };
const invalid = (problems: { path: string; message: string }[]): Problems => ({
  ok: false,
  status: 400,
  code: "VALIDATION",
  message: problems[0]?.message ?? "That question cannot be saved.",
  details: problems,
});

/// A new question, saved as a DRAFT that only its writer sees. `branchId` is the branch it is written for.
export async function createItem(input: { userId: string; branchId: string; body: unknown }): Promise<ItemResult | Problems> {
  const parsed = parseItem(input.body);
  if (!parsed.ok) return invalid(parsed.problems);
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(input.userId, tx);
    if (!mayAuthorIn(viewer, input.branchId)) return fail(403, "FORBIDDEN", "You cannot write questions for this branch.");
    if (!(await bankOpenFor(viewer, input.branchId))) return fail(403, "BANK_OFF", ACCESS_OFF);

    const created = await tx.questionBankItem.create({
      data: { ...dataOf(parsed.item), branchId: input.branchId, bank: "ASSESSMENT", status: "DRAFT", submittedById: input.userId },
      select: { id: true },
    });
    await replaceTags(tx, created.id, parsed.item.classTags);
    const row = await reread(tx, created.id);
    await tx.questionBankItemVersion.create({ data: { itemId: row.id, version: 1, snapshot: snapshotOf(row), actorUserId: input.userId } });
    await writeBankAudit(tx, {
      branchId: row.branchId,
      itemId: row.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: "ITEM_CREATED",
      newValue: { version: 1, status: "DRAFT", type: row.type },
    });
    return { ok: true, item: await viewOf(tx, viewer, row) } as const;
  });
}

/// Edits a question. Its writer may edit it while it is a DRAFT, PENDING or REJECTED (a PENDING one stays pending with a new version, and is checked for overlap again); a
/// reviewer in scope may correct an APPROVED one (a new version and a review row). Everyone else: "Not found" if they cannot see it, otherwise 403.
export async function updateItem(input: { userId: string; id: string; body: unknown }): Promise<ItemResult | Problems> {
  const parsed = parseItem(input.body);
  if (!parsed.ok) return invalid(parsed.problems);
  return prisma.$transaction(async (tx) => {
    const before = await lockItem(tx, input.id);
    if (!before) return NOT_FOUND;
    const viewer = await loadViewer(input.userId, tx);
    const facts = factsOf(before);
    if (!staffMaySee(viewer, facts, new Date())) return NOT_FOUND;

    const asWriter = mayEditAsSubmitter(viewer, facts);
    const asReviewer = !asWriter && mayDecide(viewer, facts, "edit").ok;
    if (!asWriter && !asReviewer) return fail(403, "FORBIDDEN", "You cannot edit this question.");
    if (!(await bankOpenFor(viewer, before.branchId))) return fail(403, "BANK_OFF", ACCESS_OFF);

    const version = before.version + 1;
    await tx.questionBankItem.update({ where: { id: before.id }, data: { ...dataOf(parsed.item), version } });
    await replaceTags(tx, before.id, parsed.item.classTags);
    const after = await reread(tx, before.id);
    await tx.questionBankItemVersion.create({ data: { itemId: after.id, version, snapshot: snapshotOf(after), actorUserId: input.userId } });
    if (asReviewer) await tx.questionBankReview.create({ data: { itemId: after.id, version, reviewerId: input.userId, outcome: "EDITED" } });
    if (after.status === "PENDING") await refreshOverlap(tx, after);
    await writeBankAudit(tx, {
      branchId: after.branchId,
      itemId: after.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: asReviewer ? "ITEM_EDITED_BY_REVIEWER" : "ITEM_EDITED",
      oldValue: { version: before.version },
      newValue: { version, status: after.status },
    });
    return { ok: true, item: await viewOf(tx, viewer, after) } as const;
  });
}

/// Sends a DRAFT or REJECTED question for review. It is checked, silently, for overlap with the bank and with published quizzes: the writer is never told the result.
export async function submitItem(input: { userId: string; id: string }): Promise<ItemResult> {
  return prisma.$transaction(async (tx) => {
    const before = await lockItem(tx, input.id);
    if (!before) return NOT_FOUND;
    const viewer = await loadViewer(input.userId, tx);
    const facts = factsOf(before);
    if (!staffMaySee(viewer, facts, new Date())) return NOT_FOUND;
    if (!maySubmit(viewer, facts)) {
      return before.submittedById === input.userId
        ? fail(409, "WRONG_STATE", "Only a draft or a rejected question can be sent for review.")
        : fail(403, "FORBIDDEN", "You cannot send this question for review.");
    }
    if (!(await bankOpenFor(viewer, before.branchId))) return fail(403, "BANK_OFF", ACCESS_OFF);

    await tx.questionBankItem.update({ where: { id: before.id }, data: { status: "PENDING" } });
    const after = await reread(tx, before.id);
    await refreshOverlap(tx, after);
    await writeBankAudit(tx, {
      branchId: after.branchId,
      itemId: after.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: "ITEM_SUBMITTED",
      oldValue: { status: before.status },
      newValue: { status: "PENDING", version: after.version },
    });
    return { ok: true, item: await viewOf(tx, viewer, after) } as const;
  });
}

/// One question, if the person may see it. Includes the history of decisions on it.
export async function getItem(input: { userId: string; id: string }): Promise<({ ok: true; item: ItemView; history: HistoryEntry[] }) | Fail> {
  const viewer = await loadViewer(input.userId);
  const row = await prisma.questionBankItem.findUnique({ where: { id: input.id }, select: ITEM_SELECT });
  if (!row || !staffMaySee(viewer, factsOf(row), new Date())) return NOT_FOUND;
  const item = await viewOf(prisma, viewer, row);
  const reviews = await prisma.questionBankReview.findMany({
    where: { itemId: row.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, version: true, outcome: true, reason: true, createdAt: true, reviewer: { select: { name: true } } },
  });
  return {
    ok: true,
    item,
    history: reviews.map((review) => ({ id: review.id, version: review.version, outcome: review.outcome, reason: review.reason, at: review.createdAt, by: review.reviewer.name })),
  };
}
export type HistoryEntry = { id: string; version: number; outcome: string; reason: string | null; at: Date; by: string | null };

export const LIST_MAX = 50;
export type ListQuery = {
  branchId?: string;
  status?: ItemRow["status"];
  q?: string;
  subjectKey?: string;
  classTagKey?: string;
  mine?: boolean;
  cursor?: string;
  limit?: number;
};

/// A page of questions the person may see, newest first. The database narrows by what the person could possibly see (their branches, no other person's drafts); EVERY row is
/// then put through `staffMaySee` before it is returned, so the rule that decides is the one in `rules.ts`, not a copy of it in a query.
export async function listItems(input: { userId: string; query: ListQuery }): Promise<{ items: ItemView[]; nextCursor: string | null }> {
  const viewer = await loadViewer(input.userId);
  const { query } = input;
  const limit = Math.min(Math.max(query.limit ?? 20, 1), LIST_MAX);
  const staffBranches = viewer.memberships.map((m) => m.branchId);

  const and: Prisma.QuestionBankItemWhereInput[] = [];
  if (!viewer.isSuperAdmin) {
    and.push({ OR: [{ branchId: null }, { branchId: { in: staffBranches } }] });
    and.push({ OR: [{ submittedById: viewer.userId }, { status: { not: "DRAFT" } }] });
  }
  if (query.branchId) and.push({ OR: [{ branchId: query.branchId }, { branchId: null }] });
  if (query.status) and.push({ status: query.status });
  if (query.mine) and.push({ submittedById: viewer.userId });
  if (query.subjectKey) and.push({ subjectKey: query.subjectKey });
  if (query.classTagKey) and.push({ classTags: { some: { labelKey: query.classTagKey } } });
  if (query.q) and.push({ prompt: { contains: query.q.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } }); // % and _ are text here, not wildcards
  if (query.cursor) {
    const [at, id] = query.cursor.split("|");
    const when = new Date(at ?? "");
    if (id && !Number.isNaN(when.getTime())) and.push({ OR: [{ createdAt: { lt: when } }, { createdAt: when, id: { lt: id } }] });
  }

  const now = new Date();
  const visible: ItemRow[] = [];
  let scanned = 0;
  let exhausted = false;
  let last: ItemRow | null = null;
  // Rows the rule refuses are skipped, so more than a page may be read: bounded, so a person who can see little of a large bank costs a few queries and not a scan.
  while (visible.length <= limit && scanned < 400 && !exhausted) {
    const batch: ItemRow[] = await prisma.questionBankItem.findMany({
      where: { AND: last ? [...and, { OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: last.id } }] }] : and },
      select: ITEM_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    scanned += batch.length;
    exhausted = batch.length < 100;
    for (const row of batch) {
      last = row;
      if (staffMaySee(viewer, factsOf(row), now)) visible.push(row);
      if (visible.length > limit) break;
    }
  }
  const page = visible.slice(0, limit);
  const more = visible.length > limit;
  const items = await Promise.all(page.map((row) => viewOf(prisma, viewer, row)));
  const tail = page[page.length - 1];
  return { items, nextCursor: more && tail ? `${tail.createdAt.toISOString()}|${tail.id}` : null };
}

export interface OfferBackParams {
  userId: string;
  branchId: string;
  quizId: string;
  quizQuestionId: string;
  subjectLabel?: string;
  topic?: string;
  difficulty?: number;
}

/// Offers a quiz/assessment question back to the Question Bank as a new item.
/// (Design Section 8.3: A copy that differs from its source can be offered as a new bank item, never an overwrite).
export async function offerBackItem(input: OfferBackParams): Promise<ItemResult | Problems> {
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(input.userId, tx);
    if (!mayAuthorIn(viewer, input.branchId)) return fail(403, "FORBIDDEN", "You cannot write questions for this branch.");
    if (!(await bankOpenFor(viewer, input.branchId))) return fail(403, "BANK_OFF", ACCESS_OFF);

    // Verify quiz question exists in this branch
    const question = await tx.quizQuestion.findFirst({
      where: { id: input.quizQuestionId, quizId: input.quizId, branchId: input.branchId },
      include: { quiz: true },
    });
    if (!question) {
      return NOT_FOUND;
    }

    const payload = prepareOfferBackPayload(
      {
        prompt: question.prompt,
        questionType: question.questionType,
        options: question.options,
        correctAnswer: question.correctAnswer,
        points: question.points,
      },
      {
        subjectLabel: input.subjectLabel,
        topic: input.topic,
        difficulty: input.difficulty,
      },
    );

    const parsed = parseItem(payload);
    if (!parsed.ok) return invalid(parsed.problems);

    // Creates as a brand-new PENDING item (never overwrites)
    const created = await tx.questionBankItem.create({
      data: {
        ...dataOf(parsed.item),
        branchId: input.branchId,
        bank: "ASSESSMENT",
        status: "PENDING",
        submittedById: input.userId,
      },
      select: { id: true },
    });
    await replaceTags(tx, created.id, parsed.item.classTags);
    const row = await reread(tx, created.id);
    await tx.questionBankItemVersion.create({
      data: { itemId: row.id, version: 1, snapshot: snapshotOf(row), actorUserId: input.userId },
    });
    await refreshOverlap(tx, row);
    await writeBankAudit(tx, {
      branchId: row.branchId,
      itemId: row.id,
      actorUserId: input.userId,
      entity: "ITEM",
      action: "ITEM_OFFERED_BACK",
      newValue: {
        version: 1,
        status: "PENDING",
        type: row.type,
        fromQuizId: input.quizId,
        fromQuizQuestionId: input.quizQuestionId,
      },
    });
    return { ok: true, item: await viewOf(tx, viewer, row) } as const;
  });
}

