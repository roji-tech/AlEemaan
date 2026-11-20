import { prisma } from "@/lib/db";
import { mayAdminister, type AdminScope } from "@/lib/auth/branch-access";
import { createInvitationIn, saveDraftIn } from "@/lib/invitations/service";
import { roleForCategory } from "@/lib/academics/staff";
import { accountFitsRecord } from "@/lib/academics/staff-accounts";

// Inviting staff to sign in from their records (task 0114, task 0101 D6): one or many records of one branch, each invited at the e-mail address on its record, with the role its kind gives
// (Teaching -> Teaching staff, Non-teaching -> Non-teaching staff; an administrator is only ever invited by hand). Nobody copies an address from one page to another.
//   - The invitation carries the record, so accepting it links the new account to the record (lib/invitations/service.ts).
//   - An address that is already an active member of the branch with the matching role, and not yet the account of another record, is linked at once instead of being invited.
//   - Every record is its own invitation and its own transaction: one that cannot be invited never stops the others, and the answer says which and why.
//   - The rules of an ordinary invitation all apply (`createInvitationIn`): only to a branch the caller administers, one open link per address and branch, a deactivated person is reactivated
//     instead. A record with a link still waiting is left alone (Pending invitations can send it again).

export const STAFF_INVITE_MAX = 200;

export type StaffInviteOutcome =
  | {
      staffId: string;
      name: string;
      result: "invited";
      email: string;
      token: string;
      branchName: string;
      role: "TEACHING_STAFF" | "NON_TEACHING_STAFF";
    }
  | { staffId: string; name: string; result: "linked"; email: string }
  /// Saved as a DRAFT invitation (task 0101 D2): nothing sent; it is sent from Users > Pending invitations.
  | { staffId: string; name: string; result: "drafted"; email: string }
  | { staffId: string; name: string; result: "skipped"; why: string };

const WHY = {
  NOT_FOUND: "Not a staff record of this branch.",
  ARCHIVED: "Archived: restore the record first.",
  DRAFT: "Draft: complete the record first.",
  NOT_ACTIVE: "Suspended or terminated.",
  HAS_ACCOUNT: "Already has a sign-in.",
  NO_EMAIL: "No e-mail address on the record: add one with Edit.",
  SAME_EMAIL: "Another selected record has the same e-mail address.",
  ALREADY_INVITED: "Already invited; the link is still waiting (Users › Pending invitations can send it again).",
  ALREADY_MEMBER: "That address already signs in here with another role, or for another staff record.",
  DEACTIVATED_MEMBER: "That address belonged to someone who was deactivated: reactivate them on the Users page.",
} as const;

export async function inviteStaffRecords(
  actorUserId: string,
  scope: AdminScope,
  branchId: string,
  staffIds: readonly string[],
  /// `draft` (task 0101 D2): save each invitation as a draft instead of sending it. Linking an existing member is not a sending, so it still happens.
  options: { draft?: boolean } = {},
): Promise<{ ok: false; reason: "OUT_OF_SCOPE" } | { ok: true; outcomes: StaffInviteOutcome[] }> {
  if (!mayAdminister(scope, branchId)) return { ok: false, reason: "OUT_OF_SCOPE" };
  const ids = [...new Set(staffIds)];
  const records = await prisma.staffRecord.findMany({
    where: { id: { in: ids }, branchId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      category: true,
      userId: true,
      archivedAt: true,
      standing: true,
      isDraft: true,
    },
  });
  const byId = new Map(records.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const outcomes: StaffInviteOutcome[] = [];

  for (const id of ids) {
    const record = byId.get(id);
    if (!record) {
      outcomes.push({ staffId: id, name: "", result: "skipped", why: WHY.NOT_FOUND });
      continue;
    }
    const name = `${record.firstName} ${record.lastName}`;
    const skip = (why: string) => outcomes.push({ staffId: id, name, result: "skipped", why });
    const email = record.email?.trim().toLowerCase() ?? "";
    if (record.archivedAt) skip(WHY.ARCHIVED);
    else if (record.isDraft) skip(WHY.DRAFT);
    else if (record.standing !== "ACTIVE") skip(WHY.NOT_ACTIVE);
    else if (record.userId) skip(WHY.HAS_ACCOUNT);
    else if (!email) skip(WHY.NO_EMAIL);
    else if (seen.has(email)) skip(WHY.SAME_EMAIL);
    else {
      seen.add(email);
      const role = roleForCategory(record.category) as "TEACHING_STAFF" | "NON_TEACHING_STAFF";
      outcomes.push(await inviteOne(actorUserId, scope, branchId, { id, name, email, role }, options.draft === true));
    }
  }
  return { ok: true, outcomes };
}

async function inviteOne(
  actorUserId: string,
  scope: AdminScope,
  branchId: string,
  record: { id: string; name: string; email: string; role: "TEACHING_STAFF" | "NON_TEACHING_STAFF" },
  draft = false,
): Promise<StaffInviteOutcome> {
  const { id, name, email, role } = record;
  return prisma.$transaction(async (tx): Promise<StaffInviteOutcome> => {
    // Already a member here with the matching role and not anyone's record yet: link now (the same checks as Manage > Link to a member, conditional on the record still having no account).
    const member = await tx.membership.findFirst({
      where: { branchId, deactivatedAt: null, user: { email } },
      select: { userId: true, role: true, staffRecords: { select: { id: true } } },
    });
    if (member) {
      if (!accountFitsRecord(member.role, role === "TEACHING_STAFF" ? "TEACHING" : "NON_TEACHING") || member.staffRecords.length > 0)
        return { staffId: id, name, result: "skipped", why: WHY.ALREADY_MEMBER };
      const linked = await tx.staffRecord.updateMany({
        where: { id, branchId, userId: null, archivedAt: null },
        data: { userId: member.userId },
      });
      if (linked.count !== 1) return { staffId: id, name, result: "skipped", why: WHY.HAS_ACCOUNT };
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "STAFF_ACCOUNT_LINKED",
          targetType: "StaffRecord",
          targetId: id,
          afterValue: { userId: member.userId, byEmail: true },
        },
      });
      return { staffId: id, name, result: "linked", email };
    }
    const waiting = await tx.invitation.count({
      where: { email, branchId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (waiting > 0) return { staffId: id, name, result: "skipped", why: WHY.ALREADY_INVITED };
    if (draft) {
      const saved = await saveDraftIn(tx, actorUserId, { email, role, branchId, staffRecordId: id }, scope);
      if (saved.ok) return { staffId: id, name, result: "drafted", email };
      return {
        staffId: id,
        name,
        result: "skipped",
        why:
          saved.reason === "ALREADY_MEMBER"
            ? WHY.ALREADY_MEMBER
            : saved.reason === "DEACTIVATED_MEMBER"
              ? WHY.DEACTIVATED_MEMBER
              : saved.reason === "OPEN_EXISTS"
                ? WHY.ALREADY_INVITED
                : WHY.NOT_FOUND,
      };
    }
    const made = await createInvitationIn(tx, actorUserId, { email, role, branchId, staffRecordId: id }, scope);
    if (!made.ok) {
      const why =
        made.reason === "ALREADY_MEMBER"
          ? WHY.ALREADY_MEMBER
          : made.reason === "DEACTIVATED_MEMBER"
            ? WHY.DEACTIVATED_MEMBER
            : WHY.NOT_FOUND;
      return { staffId: id, name, result: "skipped", why };
    }
    return { staffId: id, name, result: "invited", email, token: made.token, branchName: made.invitation.branchName, role };
  });
}
