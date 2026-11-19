import Link from "next/link";

// On the Students page of a branch that was made for a program (task 0043, 8.6), what the maintainer asked about (2026-11-19, task 0110): the pupils and staff of the school's other
// branches are not registered here again. They join the program from their own branch and keep their class, records and admission number there; this card says so and goes to the
// program's People tab, where "Add people" finds them (a super admin: in every branch that takes part in programs). Display only: the program's API decides who may add whom.

export type OwnProgram = {
  id: string;
  name: string;
  /// People in the program now through another branch; null when this viewer may not see the program's people of other branches.
  fromOtherBranches: number | null;
  /// May add people of other branches (a super admin).
  mayAdd: boolean;
};

const LINK =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function OwnProgramCard({ branchName, program }: { branchName: string; program: OwnProgram }) {
  const people = `/programs/${encodeURIComponent(program.id)}?tab=people`;
  return (
    <section aria-labelledby="own-program-heading" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 id="own-program-heading" className="text-base font-semibold text-fg">
        {branchName} is the branch of the program {program.name}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        Pupils and staff of the school&apos;s other branches are not registered here again. They join the program from their own branch, a
        whole class at a time if you like, and keep their class, records and admission number there.
        {program.fromOtherBranches !== null &&
          ` ${program.fromOtherBranches === 1 ? "1 person" : `${program.fromOtherBranches} people`} from other branches ${program.fromOtherBranches === 1 ? "is" : "are"} in the program now.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {program.mayAdd && (
          <Link href={`${people}&add=1`} className={`${LINK} bg-brand-strong text-white hover:bg-brand-strong-hover`}>
            Add people from other branches
          </Link>
        )}
        <Link href={people} className={`${LINK} border border-line-strong bg-surface text-fg hover:bg-surface-2`}>
          See the program&apos;s people
        </Link>
      </div>
    </section>
  );
}
