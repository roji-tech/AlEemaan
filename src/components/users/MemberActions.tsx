"use client";

import { ActionsMenu, type MenuAction } from "@/components/ui/ActionsMenu";
import { KIND_TEXT, kindsFor, type StandingCan } from "@/components/standing/model";
import type { StandingAsk } from "@/components/standing/StandingDialog";
import type { Member } from "./model";

/// What can be done to one person, behind one Actions button (a list that opens and closes): change them, add them to another branch, then end or pause their access, then the superadmin switch, then their
/// history. A person who is signed in as you, or whom you may not touch (a branch administrator and an administrator), has none, and no button is drawn. The accessible names are the
/// ones the separate buttons had ("Deactivate Tola Teacher"), so a screen reader hears the same words.
export function MemberActions({
  member,
  name,
  self,
  locked,
  can,
  isSuperAdmin,
  canAddBranch,
  busy,
  onEdit,
  onAddBranch,
  onDeactivate,
  onStanding,
  onSuperAdmin,
  onReactivate,
  onHistory,
}: {
  member: Member;
  name: string;
  self: boolean;
  locked: boolean;
  /// What this caller may do about standing in the person's branch.
  can: StandingCan;
  isSuperAdmin: boolean;
  /// The caller can invite to more than one branch: with a single branch to offer there is nowhere else to add anyone (display only: the API decides).
  canAddBranch: boolean;
  busy: boolean;
  onEdit: (member: Member) => void;
  onAddBranch: (member: Member) => void;
  onDeactivate: (member: Member) => void;
  onStanding: (member: Member, kind: StandingAsk["kind"]) => void;
  onSuperAdmin: (member: Member) => void;
  onReactivate: (member: Member) => void;
  onHistory: (member: Member) => void;
}) {
  if (self || locked) return null;
  const actions: MenuAction[] = [];
  const standing = (kind: StandingAsk["kind"]): MenuAction => ({
    id: kind,
    label: KIND_TEXT[kind],
    ariaLabel: `${KIND_TEXT[kind]} ${name}`,
    onSelect: () => onStanding(member, kind),
  });
  if (member.status === "active") {
    actions.push({
      id: "edit",
      label: "Edit role or branch",
      ariaLabel: `Change role or branch for ${name}`,
      onSelect: () => onEdit(member),
    });
    if (canAddBranch) {
      actions.push({
        id: "add-branch",
        label: "Add to another branch",
        ariaLabel: `Add ${name} to another branch`,
        onSelect: () => onAddBranch(member),
      });
    }
    actions.push({ id: "deactivate", label: "Deactivate", ariaLabel: `Deactivate ${name}`, onSelect: () => onDeactivate(member) });
    for (const kind of kindsFor("staff", member.standing, can)) actions.push(standing(kind));
    if (isSuperAdmin) {
      actions.push({
        id: "superadmin",
        label: member.isSuperAdmin ? "Remove superadmin" : "Make superadmin",
        ariaLabel: `${member.isSuperAdmin ? "Remove superadmin from" : "Make superadmin"} ${name}`,
        onSelect: () => onSuperAdmin(member),
      });
    }
  } else if (member.standing === "ACTIVE") {
    actions.push({
      id: "reactivate",
      label: "Reactivate",
      ariaLabel: `Reactivate ${name}`,
      disabled: busy,
      onSelect: () => onReactivate(member),
    });
  } else {
    // Suspended or terminated: it ends with the action that records why, not with a plain reactivation.
    for (const kind of kindsFor("staff", member.standing === "SUSPENDED" ? "SUSPENDED" : "TERMINATED", can)) actions.push(standing(kind));
  }
  actions.push({ id: "history", label: "History", ariaLabel: `Standing history of ${name}`, onSelect: () => onHistory(member) });
  return <ActionsMenu name={name} actions={actions} />;
}
