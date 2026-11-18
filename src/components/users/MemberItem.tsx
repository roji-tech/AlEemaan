"use client";

import { Item, ItemInitials } from "@/components/ui/Collection";
import { initialsOf } from "@/components/shell/nav";
import { StandingBadge } from "@/components/standing/StandingBadge";
import type { StandingCan } from "@/components/standing/model";
import type { StandingAsk } from "@/components/standing/StandingDialog";
import { ROLE_LABELS } from "@/lib/roles";
import { memberActions } from "./member-actions";
import { displayName, type Member } from "./model";

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-brand-fg">{children}</span>
  );
}

/// One person of the People list (the list/grid kit's `Item`, task 0089): initials, name (and "You"), email, the role and the branch as facts, the status as a badge, the role tags,
/// and one "Actions for <name>" list. It is a component, not a function the list calls, so the handlers it is given arrive as props and are only ever called by a click.
export function MemberItem({
  member,
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
  /// The person is the signed-in one: no actions on yourself.
  self: boolean;
  /// The caller may not touch this person (a branch administrator and an administrator or a superadmin).
  locked: boolean;
  /// What the caller may do about standing in the person's branch.
  can: StandingCan;
  isSuperAdmin: boolean;
  /// The caller can invite to more than one branch (the "Add to another branch" action, task 0092).
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
  const name = displayName(member);
  const tags = [
    member.isSuperAdmin && "Superadmin",
    member.canApproveResults && "Approves results",
    member.canViewFormResults && "Reads form results",
  ].filter((tag): tag is string => Boolean(tag));
  // A person who is suspended or terminated shows that instead of Active; the pill can be long ("Suspended until 12 Nov 2026"), so it sits under the name with the tags, not in the
  // narrow badge corner of a card.
  const standing = member.standing !== "ACTIVE" ? <StandingBadge standing={member.standing} until={member.standingUntil} /> : null;
  return (
    <Item
      leading={<ItemInitials text={initialsOf(member.name, member.email)} />}
      title={
        <>
          {name}
          {self && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted">You</span>}
        </>
      }
      subtitle={member.name?.trim() && member.email ? member.email : undefined}
      facts={[
        { label: "Role", value: ROLE_LABELS[member.role] },
        { label: "Branch", value: member.isSuperAdmin ? "All branches" : member.branchName },
      ]}
      badges={
        standing ? undefined : (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${member.status === "active" ? "bg-ok-bg text-ok-fg" : "bg-warn-bg text-warn-fg"}`}
          >
            {member.status === "active" ? "Active" : "Deactivated"}
          </span>
        )
      }
      menu={{
        name,
        actions: memberActions({
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
        }),
      }}
    >
      {(standing || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {standing}
          {tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
    </Item>
  );
}
