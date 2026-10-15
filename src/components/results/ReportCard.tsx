import type { ReactNode } from "react";

// The report card as the school hands it out (Slice P2d): school header, student block, the subjects table, summary tiles, remarks, the grading legend and each
// published subject's verification link. Pure presentation of what `GET students/[id]/report-card` returns; it prints cleanly (the shell is hidden by print styles).

export type Card = {
  school: { name: string; principal: string | null; motto: string | null; address: string | null; phone: string | null };
  branch: { id: string; name: string };
  student: { id: string; name: string; admissionNo: string; gender: string };
  class: { group: string; arm: string } | null;
  period: { id: string; label: string; session: string };
  subjects: {
    subjectId: string;
    name: string;
    caTotal: number;
    exam: number;
    total: number;
    max: number;
    percent: number;
    gradeLetter: string;
    gradeRemark: string;
    status: string;
    verificationToken: string | null;
  }[];
  summary: {
    subjectCount: number;
    totalScore: number;
    totalMax: number;
    average: number | null;
    position: number | null;
    classSize: number | null;
  };
  remarks: { teacher: string | null; principal: string | null };
  legend: { min: number; max: number; letter: string; remark: string }[];
  allPublished: boolean;
  preview: boolean;
};

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-3 text-center print:border-black">
      <p className="text-xs tracking-wide text-fg-2 uppercase print:text-black">{label}</p>
      <p className="mt-1 text-lg font-bold text-fg print:text-black">{children}</p>
    </div>
  );
}

export function ReportCard({ card, origin }: { card: Card; origin: string }) {
  const s = card.summary;
  return (
    <article
      aria-label={`Report card for ${card.student.name}`}
      className="rounded-2xl border border-line bg-surface p-5 text-fg print:border-0 print:bg-white print:p-0 print:text-black"
    >
      <header className="border-b border-line pb-3 text-center print:border-black">
        <h2 className="text-xl font-bold tracking-tight">{card.school.name}</h2>
        {card.school.motto && <p className="text-sm text-fg-muted print:text-black">{card.school.motto}</p>}
        <p className="text-sm text-fg-2 print:text-black">
          {[card.branch.name, card.school.address, card.school.phone].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-2 font-semibold">
          Report card — {card.period.label}, {card.period.session}
        </p>
      </header>

      {card.preview && !card.allPublished && (
        <p
          role="note"
          className="mt-3 rounded-lg border border-line-strong bg-surface-2 p-2 text-center text-sm font-semibold print:hidden"
        >
          Preview: some of these results are not published yet, so this is not the card parents will see.
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-fg-muted print:text-black">Name</dt>
          <dd className="font-semibold">{card.student.name}</dd>
        </div>
        <div>
          <dt className="text-fg-muted print:text-black">Admission no.</dt>
          <dd className="font-semibold">{card.student.admissionNo}</dd>
        </div>
        <div>
          <dt className="text-fg-muted print:text-black">Class</dt>
          <dd className="font-semibold">{card.class ? `${card.class.group} ${card.class.arm}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-fg-muted print:text-black">Gender</dt>
          <dd className="font-semibold">{card.student.gender === "FEMALE" ? "Female" : "Male"}</dd>
        </div>
      </dl>

      {card.subjects.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-fg-muted">
          No published results for this term yet.
        </p>
      ) : (
        <div
          role="region"
          aria-label="Subjects"
          tabIndex={0}
          className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <table className="w-full min-w-[30rem] text-left text-sm">
            <caption className="sr-only">Subjects, marks and grades</caption>
            <thead>
              <tr className="text-xs tracking-wide text-fg-2 uppercase print:text-black">
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Subject
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  CA
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Exam
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Total
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  %
                </th>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Grade
                </th>
                <th scope="col" className="py-1 font-semibold">
                  Remark
                </th>
              </tr>
            </thead>
            <tbody>
              {card.subjects.map((x) => (
                <tr key={x.subjectId} className="border-t border-line print:border-black">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                    {x.name}
                  </th>
                  <td className="py-1.5 pr-3 tabular-nums">{fmt(x.caTotal)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{fmt(x.exam)}</td>
                  <td className="py-1.5 pr-3 font-semibold tabular-nums">{fmt(x.total)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{fmt(x.percent)}</td>
                  <td className="py-1.5 pr-3 font-bold">{x.gradeLetter}</td>
                  <td className="py-1.5">{x.gradeRemark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s.subjectCount > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Total">
            {fmt(s.totalScore)} / {fmt(s.totalMax)}
          </Tile>
          <Tile label="Average">{s.average === null ? "—" : `${fmt(s.average)}%`}</Tile>
          <Tile label="Position">{s.position === null ? "—" : ordinal(s.position)}</Tile>
          <Tile label="In class">{s.classSize ?? "—"}</Tile>
        </div>
      )}

      <section aria-label="Remarks" className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line p-3 print:border-black">
          <h3 className="text-xs font-semibold tracking-wide text-fg-2 uppercase print:text-black">Teacher&apos;s remark</h3>
          <p className="mt-1 min-h-10 text-sm">{card.remarks.teacher ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-line p-3 print:border-black">
          <h3 className="text-xs font-semibold tracking-wide text-fg-2 uppercase print:text-black">
            Principal&apos;s remark{card.school.principal ? ` (${card.school.principal})` : ""}
          </h3>
          <p className="mt-1 min-h-10 text-sm">{card.remarks.principal ?? "—"}</p>
        </div>
      </section>

      {card.legend.length > 0 && (
        <p className="mt-4 text-xs text-fg-muted print:text-black">
          <span className="font-semibold">Grading:</span>{" "}
          {card.legend.map((l) => `${l.letter} ${fmt(l.min)}–${fmt(l.max)} ${l.remark}`).join(" · ")}
        </p>
      )}

      {card.subjects.some((x) => x.verificationToken) && (
        <section
          aria-label="Verification"
          className="mt-4 border-t border-line pt-3 text-xs text-fg-muted print:border-black print:text-black"
        >
          <h3 className="font-semibold">Verify these results</h3>
          <ul className="mt-1 space-y-0.5 break-all">
            {card.subjects
              .filter((x) => x.verificationToken)
              .map((x) => (
                <li key={x.subjectId}>
                  {x.name}: {origin}/verify/{x.verificationToken}
                </li>
              ))}
          </ul>
        </section>
      )}
    </article>
  );
}
