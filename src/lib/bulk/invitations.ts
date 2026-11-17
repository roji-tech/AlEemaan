import "@/lib/zod-csp";
import { z } from "zod";
import { inviteEmail, inviteRole, ROLE_VALUES } from "@/lib/invitations/rules";
import { ROLE_LABELS } from "@/lib/roles";
import type { BulkColumn, BulkEntity } from "./types";

// The invitation kind of the bulk entry (task 0084), client-safe: one address and one role per row. The branch is chosen once for the whole file (it is not a column), so a file
// never decides what authority the person inviting has. The server half is `invitations-server.ts`.

export type InvitationRow = { email: string; role: z.infer<typeof inviteRole> };
type RoleValue = (typeof ROLE_VALUES)[number];

const letters = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");
const WORDS: Record<string, RoleValue> = {
  admin: "ADMIN",
  administrator: "ADMIN",
  teaching: "TEACHING_STAFF",
  teachingstaff: "TEACHING_STAFF",
  teacher: "TEACHING_STAFF",
  nonteaching: "NON_TEACHING_STAFF",
  nonteachingstaff: "NON_TEACHING_STAFF",
  support: "NON_TEACHING_STAFF",
  supportstaff: "NON_TEACHING_STAFF",
  student: "STUDENT",
  pupil: "STUDENT",
  parent: "PARENT",
  guardian: "PARENT",
};
/// Any capitals, spaces, hyphens or underscores: "Teaching staff", "teacher", "NON_TEACHING_STAFF", "pupil", "guardian". Anything else is left as it is, so the rule refuses it.
const toRole = (v: unknown): unknown => (typeof v === "string" ? (WORDS[letters(v)] ?? v) : v);

export const invitationRowSchema: z.ZodType<InvitationRow> = z.object({
  email: inviteEmail,
  role: z.preprocess(toRole, inviteRole),
});

const columns = (allowed: readonly RoleValue[]): BulkColumn[] => [
  { key: "email", label: "Email", aliases: ["emailaddress", "mail"], required: true, help: "The address the invitation link is sent to" },
  {
    key: "role",
    label: "Role",
    aliases: ["type", "position"],
    required: true,
    help: "Teaching staff, Non-teaching staff, Student or Parent (Administrator for a superadmin)",
    options: allowed.map((value) => ({ value, label: ROLE_LABELS[value] })),
  },
];

/// The kind for a caller who may give only some roles: the dropdowns offer those, while the rules still know every role (a branch administrator who types "Administrator" in a file is
/// told by the server why not, rather than "choose a role").
export const invitationEntityFor = (allowed: readonly RoleValue[]): BulkEntity<InvitationRow> => ({
  id: "invitations",
  label: "invitations",
  columns: columns(allowed),
  rowSchema: invitationRowSchema,
  uniqueKeys: ["email"],
  maxRows: 200,
});
export const invitationEntity = invitationEntityFor(ROLE_VALUES);
