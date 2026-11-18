import type { MenuAction } from "@/components/ui/ActionsMenu";
import { KIND_TEXT, kindsFor, type StandingCan } from "@/components/standing/model";
import type { StandingAsk } from "@/components/standing/StandingDialog";
import type { Member } from "./model";

/// What can be done to one person, for the Actions button on their item (a list that opens and closes): change them, then end or pause their access, then the superadmin switch, then
/// their history. A person who is signed in as you, or whom you may not touch (a branch administrator and an administrator), has none (an empty list, so the item draws no button).
/// The accessible names are the ones the separate buttons had ("Deactivate Tola Teacher"), so a screen reader hears the same words. The list goes to `<Item menu={{ name, actions }}>`.
export function memberActions({
  member,
  name,
  self,
  locked,
  can,
  isSuperAdmin,
  busy,
  onEdit,
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
  busy: boolean;
  onEdit: (member: Member) => void;
  onDeactivate: (member: Member) => void;
  onStanding: (member: Member, kind: StandingAsk["kind"]) => void;
  onSuperAdmin: (member: Member) => void;
  onReactivate: (member: Member) => void;
  onHistory: (member: Member) => void;
}): MenuAction[] {
  if (self || locked) return [];
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
  return actions;
}
