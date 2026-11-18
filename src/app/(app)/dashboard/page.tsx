import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/auth/page-session";
import { adminScope, branchIdsFor, mayAdminister } from "@/lib/auth/branch-access";
import { ROLE_LABELS } from "@/lib/roles";
import { memberLabel } from "@/lib/branches/labels";
import { PageHeader } from "@/components/shell/PageHeader";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  BookOpenIcon,
  BuildingIcon,
  CalendarIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  MailIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
} from "@/components/ui/icons";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const TILE = "rounded-2xl border border-line bg-surface p-5 shadow-card";

const LINK_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const TILE_LINK = `${TILE} transition-shadow hover:shadow-md ${LINK_FOCUS}`;
type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/// A figure. With `href` the whole tile opens the page the figure counts (task 0093); the label and the value stay one run of text, as before.
function Stat({ label, value, icon: Icon, href }: { label: string; value: string | number; icon: IconType; href?: string }) {
  const body = (
    <>
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg-muted">{label}</p>
        <p className="truncate text-2xl font-bold tracking-tight text-fg">{value}</p>
      </div>
      {href && <ChevronRightIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-fg-muted" />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} prefetch={false} className={`${TILE_LINK} flex items-center gap-4`}>
          {body}
        </Link>
      ) : (
        <div className={`${TILE} flex items-center gap-4`}>{body}</div>
      )}
    </li>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Todo = { key: string; rank: number; branch: string; title: string; why: string; cta: string; href: string };

// The front door: after sign-in a person lands here. Every figure below is read from the database —
// nothing is placeholder. (Student records, staff, timetables etc. arrive with their phases and get
// their own tiles then.)
export default async function OverviewPage() {
  const { session, memberships, isAdmin, roleLabel } = await requirePageSession();
  const displayName = session.user.name?.trim() || session.user.email || "there";
  const firstName = displayName.split(/\s+/)[0];

  if (!isAdmin) {
    return (
      <div className="space-y-8">
        <PageHeader
          title={`Welcome, ${firstName}`}
          description={
            memberships.length > 0 ? "Here are the branches you belong to." : "You're signed in, but you aren't a member of any branch yet."
          }
        />
        {memberships.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
            Ask your school administrator to add you to a branch.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {memberships.map((m) => (
              <li key={m.branchId} className={`${TILE} flex items-start gap-4`}>
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg"
                >
                  <GraduationCapIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{m.branchName}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">{ROLE_LABELS[m.role]}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Everything below is scoped to the branches this person belongs to (a superadmin: all). The page used to count every branch for a branch administrator.
  const visible = await branchIdsFor(session.userId);
  const scope = await adminScope(session.userId);
  const inScope = visible === "all" ? {} : { branchId: { in: visible } };
  const [branches, peopleCount, pupilRows, classRows, subjectRows, activeSessions] = await Promise.all([
    prisma.branch.findMany({
      where: visible === "all" ? {} : { id: { in: visible } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, _count: { select: { memberships: { where: { deactivatedAt: null } } } } },
    }),
    prisma.user.count({ where: { memberships: { some: { deactivatedAt: null, ...inScope } } } }), // active people only
    prisma.studentRecord.groupBy({ by: ["branchId"], where: { archivedAt: null, ...inScope }, _count: { _all: true } }),
    prisma.classGroup.groupBy({ by: ["branchId"], where: { archivedAt: null, ...inScope }, _count: { _all: true } }),
    prisma.subject.groupBy({ by: ["branchId"], where: { archivedAt: null, ...inScope }, _count: { _all: true } }),
    prisma.academicSession.findMany({ where: { status: "ACTIVE", archivedAt: null, ...inScope }, select: { branchId: true, label: true } }),
  ]);
  const countOf = (rows: { branchId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.branchId, r._count._all]));
  const pupils = countOf(pupilRows);
  const classes = countOf(classRows);
  const subjects = countOf(subjectRows);
  const sessionOf = new Map(activeSessions.map((r) => [r.branchId, r.label]));
  const total = (m: Map<string, number>) => [...m.values()].reduce((n, v) => n + v, 0);
  const withSession = branches.filter((b) => sessionOf.has(b.id)).length;

  // What is missing, branch by branch, for the branches this person administers: no active session first (it is what stops pupils being placed in a class), then classes, subjects, pupils.
  const todos: Todo[] = branches
    .filter((b) => mayAdminister(scope, b.id))
    .flatMap((b): Todo[] => [
      ...(sessionOf.has(b.id)
        ? []
        : [
            {
              key: `${b.id}-session`,
              rank: 0,
              branch: b.name,
              title: "No active academic session",
              why: "Pupils can't be placed in a class until one is active.",
              cta: "Create a session",
              href: `/academics?tab=sessions&branch=${b.id}&new=1`,
            },
          ]),
      ...((classes.get(b.id) ?? 0) === 0
        ? [
            {
              key: `${b.id}-classes`,
              rank: 1,
              branch: b.name,
              title: "No classes yet",
              why: "Classes (with their arms) are where pupils are placed.",
              cta: "Add classes",
              href: `/academics?tab=classes&branch=${b.id}&new=1`,
            },
          ]
        : []),
      ...((subjects.get(b.id) ?? 0) === 0
        ? [
            {
              key: `${b.id}-subjects`,
              rank: 2,
              branch: b.name,
              title: "No subjects yet",
              why: "Subjects are what each class studies and is graded in.",
              cta: "Add subjects",
              href: `/academics?tab=subjects&branch=${b.id}`,
            },
          ]
        : []),
      ...((pupils.get(b.id) ?? 0) === 0
        ? [
            {
              key: `${b.id}-pupils`,
              rank: 3,
              branch: b.name,
              title: "No pupils yet",
              why: "Register pupils one by one, or load a whole file.",
              cta: "Add pupils",
              href: "/students",
            },
          ]
        : []),
    ])
    .sort((a, b) => a.rank - b.rank);
  const shownTodos = todos.slice(0, 6);

  const ACTIONS: { href: string; title: string; text: string; icon: IconType }[] = [
    {
      href: "/academics?tab=sessions&new=1",
      title: "New academic session",
      text: "Start a school year with its terms",
      icon: CalendarIcon,
    },
    { href: "/academics?tab=classes&new=1", title: "New class", text: "Add a class, then its arms", icon: GraduationCapIcon },
    { href: "/academics?tab=subjects", title: "New subject", text: "Add a subject to the branch", icon: BookOpenIcon },
    { href: "/students", title: "Add pupils", text: "One by one, or a whole file", icon: UserIcon },
    { href: "/users", title: "Invite people", text: "Staff, parents and administrators", icon: MailIcon },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title={`Welcome, ${firstName}`} description="Your school at a glance." />

      <section aria-label="Totals">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Branches" value={branches.length} icon={BuildingIcon} href="/branches" />
          <Stat label="People with a role" value={peopleCount} icon={UsersIcon} href="/users" />
          <Stat label="Pupils" value={total(pupils)} icon={UserIcon} href="/students" />
          <Stat label="Classes" value={total(classes)} icon={GraduationCapIcon} href="/academics" />
          <Stat label="Subjects" value={total(subjects)} icon={BookOpenIcon} href="/academics?tab=subjects" />
          <Stat
            label="Branches with an active session"
            value={`${withSession} of ${branches.length}`}
            icon={CalendarIcon}
            href="/academics?tab=sessions"
          />
          <Stat label="Your role" value={roleLabel} icon={ShieldCheckIcon} />
        </ul>
      </section>

      <section aria-labelledby="todo-heading">
        <div className="flex items-center gap-2">
          <h2 id="todo-heading" className="text-sm font-semibold tracking-wider text-fg-muted uppercase">
            To do
          </h2>
          <InfoTip tip="overview.todo" />
        </div>
        {todos.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-ok-line bg-ok-bg p-4 text-sm text-ok-fg">
            Everything is set up: each branch you administer has an active session, classes, subjects and pupils.
          </p>
        ) : (
          <>
            <ul className="mt-4 space-y-3">
              {shownTodos.map((t) => (
                <li key={t.key} className={`${TILE} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-fg">
                      {t.title} <span className="font-normal text-fg-muted">in {t.branch}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-fg-muted">{t.why}</p>
                  </div>
                  <Link
                    href={t.href}
                    prefetch={false}
                    className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors ${LINK_FOCUS} ${
                      t.rank === 0
                        ? "bg-brand-strong text-white hover:bg-brand-strong-hover"
                        : "border border-line-strong bg-surface text-fg hover:bg-surface-2"
                    }`}
                  >
                    {t.cta}
                  </Link>
                </li>
              ))}
            </ul>
            {todos.length > shownTodos.length && (
              <p className="mt-3 text-sm text-fg-muted">and {todos.length - shownTodos.length} more, once these are done.</p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="actions-heading">
        <div className="flex items-center gap-2">
          <h2 id="actions-heading" className="text-sm font-semibold tracking-wider text-fg-muted uppercase">
            Quick actions
          </h2>
          <InfoTip tip="overview.quickActions" />
        </div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((a) => (
            <li key={a.title}>
              <Link href={a.href} prefetch={false} className={`${TILE_LINK} flex items-center gap-4 p-4`}>
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg"
                >
                  <a.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-fg">{a.title}</span>
                  <span className="block text-sm text-fg-muted">{a.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="branches-heading">
        <div className="flex items-center justify-between gap-4">
          <h2 id="branches-heading" className="text-sm font-semibold tracking-wider text-fg-muted uppercase">
            Branches
          </h2>
          <Link
            href="/branches"
            className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Manage branches
          </Link>
        </div>

        {branches.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">No branches yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {branches.slice(0, 6).map((branch) => (
              <li key={branch.id}>
                <Link href={`/branches/${branch.id}`} prefetch={false} className={`${TILE_LINK} flex items-start gap-4`}>
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg"
                  >
                    <BuildingIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg">{branch.name}</span>
                    <span className="mt-0.5 block text-sm text-fg-muted">
                      {memberLabel(branch._count.memberships)} · {plural(pupils.get(branch.id) ?? 0, "pupil", "pupils")}
                    </span>
                    <span className={`mt-1 block text-sm font-semibold ${sessionOf.has(branch.id) ? "text-ok-fg" : "text-warn-fg"}`}>
                      {sessionOf.has(branch.id) ? `Session ${sessionOf.get(branch.id)}` : "No active session"}
                    </span>
                  </span>
                  <ChevronRightIcon aria-hidden="true" className="mt-3 h-5 w-5 shrink-0 text-fg-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
