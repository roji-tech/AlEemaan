"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TONE, type Tone } from "@/components/ui/tone";
import { CATEGORY_TEXT, GENDER_TEXT, STANDING_TEXT, displayName, type StaffLike } from "@/components/academics/staff-model";

// Everything about one staff record, opened by pressing the name in the staff list (task 0111, the maintainer: "make the name clickable on the list then it displays a popup of their
// full information"). Read only; Edit and Manage are offered from here for someone who may use them. Presentation only: the API decided what came in the list.

export type StaffDetail = StaffLike & {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  /// A short display role label (e.g. "Head of Science", "Form Tutor"). Optional.
  role: string | null;
  phone: string | null;
  email: string | null;
  archived: boolean;
  standingUntil: string | null;
  assignmentCount: number;
  account: { state: "none" } | { state: "linked"; name: string | null; email: string | null; deactivated: boolean };
  /// What a draft still needs (task 0101 D1), by the server's rule; empty for a record that is not a draft.
  missing?: string[];
};

/// A small coloured label (the kind, "NYSC corps member").
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[tone].chip}`}>
      {children}
    </span>
  );
}

const KIND_TONE: Record<StaffLike["category"], Tone> = { TEACHING: "info", NON_TEACHING: "brand" };
export const kindPill = (category: StaffLike["category"]) => <Pill tone={KIND_TONE[category]}>{CATEGORY_TEXT[category]}</Pill>;
export const corpsPill = () => <Pill tone="ok">NYSC corps member</Pill>;
/// "Draft" (task 0101 D1): a record saved unfinished, left out of invitations, assignments and everything that counts people until it is completed.
export const draftPill = () => <Pill tone="warn">Draft</Pill>;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold tracking-wide text-fg-muted uppercase sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 text-sm wrap-break-word text-fg">{children}</dd>
    </div>
  );
}

const notGiven = <span className="text-fg-muted">Not given</span>;

export function StaffDetailsDialog({
  person,
  onClose,
  onEdit,
  onManage,
  manageLabel = "Manage",
}: {
  person: StaffDetail | null;
  onClose: () => void;
  /// Offered only to someone who may edit, and not for an archived record.
  onEdit?: () => void;
  onManage: () => void;
  /// "View" for someone who may only read the record.
  manageLabel?: string;
}) {
  const name = person ? displayName(person) : "";
  return (
    <Dialog open={person !== null} onClose={onClose} title={name || "Staff"}>
      {person && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {kindPill(person.category)}
            {person.corpsMember && corpsPill()}
            {person.isDraft && draftPill()}
            {person.standing !== "ACTIVE" && (
              <Pill tone={person.standing === "SUSPENDED" ? "warn" : "danger"}>
                {STANDING_TEXT[person.standing]}
                {person.standing === "SUSPENDED" && person.standingUntil ? ` until ${person.standingUntil}` : ""}
              </Pill>
            )}
            {person.archived && <Pill tone="neutral">Archived</Pill>}
          </div>
          {person.isDraft && (
            <p className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-fg-2">
              This record is a draft
              {person.missing && person.missing.length > 0 ? `. Missing: ${person.missing.join(", ")}` : ", and has everything it needs"}.
              It is left out of invitations, subject assignments and class teacher choices until it is completed.
            </p>
          )}
          <dl className="divide-y divide-line">
            <Row label="Title">{person.title ?? notGiven}</Row>
            <Row label="First name">{person.firstName}</Row>
            <Row label="Last name">{person.lastName}</Row>
            <Row label="Gender">{person.gender ? GENDER_TEXT[person.gender] : notGiven}</Row>
            <Row label="Kind of staff">{CATEGORY_TEXT[person.category]}</Row>
            {person.category === "NON_TEACHING" && <Row label="Job title">{person.designation ?? notGiven}</Row>}
            <Row label="Role">{person.role ?? notGiven}</Row>
            <Row label="Qualification">{person.qualification ?? notGiven}</Row>
            <Row label="NYSC corps member">{person.corpsMember ? "Yes" : "No"}</Row>
            <Row label="Phone">
              {person.phone ? (
                <a href={`tel:${person.phone.replace(/[^0-9+]/g, "")}`} className="text-brand-fg hover:underline">
                  {person.phone}
                </a>
              ) : (
                notGiven
              )}
            </Row>
            <Row label="Email">
              {person.email ? (
                <a href={`mailto:${person.email}`} className="break-all text-brand-fg hover:underline">
                  {person.email}
                </a>
              ) : (
                notGiven
              )}
            </Row>
            <Row label="Sign-in">
              {person.account.state === "linked"
                ? `Can sign in${person.account.email ? ` as ${person.account.email}` : ""}${person.account.deactivated ? " (deactivated)" : ""}`
                : "No sign-in"}
            </Row>
            <Row label="Assignments">
              {person.assignmentCount === 0
                ? "None yet"
                : `${person.assignmentCount} subject ${person.assignmentCount === 1 ? "class" : "classes"}`}
            </Row>
          </dl>
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            {onEdit && (
              <Button variant="secondary" onClick={onEdit}>
                Edit
              </Button>
            )}
            <Button onClick={onManage}>{manageLabel}</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
