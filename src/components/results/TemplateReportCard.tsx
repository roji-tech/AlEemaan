import type { ReactNode } from "react";
import { SiteImage } from "@/components/site/SiteImage";
import { TRAIT_SCALE } from "@/lib/results/report-traits-rules";
import type { Card } from "@/components/results/ReportCard";

// The school's four printed report cards (task 0116): pre-school, basic, junior secondary and senior secondary. One component draws all four from the card's data, so the subjects, the trait
// groups, the grade legend and the dates come from the class's template and the pupil's results, never from a list written here. It is drawn as PAPER (white, dark text) in both themes so
// the colours are the printed ones: a green header band taken from the logo, light tinted table heads and trait bands. Print-safe: colours are kept when printing (print-color-adjust), the
// text on the band is white on a dark green and every figure is black on white or a light tint, so a black-and-white print stays legible; compact type so a card fits one A4 page where it can.

export const TEMPLATE_LAYOUTS = ["PRESCHOOL", "BASIC", "JUNIOR", "SENIOR"] as const;
export type TemplateLayout = (typeof TEMPLATE_LAYOUTS)[number];
export const isTemplateLayout = (code: string | undefined): code is TemplateLayout =>
  !!code && (TEMPLATE_LAYOUTS as readonly string[]).includes(code);

const EXACT = "[print-color-adjust:exact] [-webkit-print-color-adjust:exact]";
const BAND = `bg-[#1a6b5a] text-white ${EXACT}`;
const HEAD = `bg-[#dcefe9] text-black ${EXACT}`;
const TINT = `bg-[#eef7f4] text-black ${EXACT}`;
const CELL = "border border-[#1a6b5a]/60 px-1.5 py-1 align-middle print:px-1 print:py-0.5";

const fmt = (n: number) => String(Math.round(n * 100) / 100);
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const longDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }) : "—";
const dash = (n: number | null | undefined) => (n === null || n === undefined ? "—" : String(n));

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5 border-b border-[#1a6b5a]/40 py-0.5">
      <dt className="shrink-0 text-[10px] font-bold tracking-wide uppercase">{label}</dt>
      <dd className="min-w-0 font-semibold break-words">{children}</dd>
    </div>
  );
}

function SignLine({ label, note }: { label: string; note: string }) {
  return (
    <div className="mt-2">
      <div className="h-6 border-b border-dashed border-black" />
      <p className="mt-0.5 flex justify-between text-[10px]">
        <span>{label}</span>
        <span>{note}</span>
      </p>
    </div>
  );
}

export function TemplateReportCard({ card, origin }: { card: Card; origin: string }) {
  const code = card.layout?.code as TemplateLayout;
  const primary = code === "PRESCHOOL" || code === "BASIC";
  const secondary = !primary;
  const s = card.summary;
  const terms = card.subjects[0]?.termScores ?? [];
  const earlier = terms.slice(1); // the current term is the first
  const sumOf = (pick: (x: Card["subjects"][number]) => number) => card.subjects.reduce((n, x) => n + pick(x), 0);
  const att = card.attendance;
  const scaleLine = TRAIT_SCALE.map((t) => `${t.rating} ${t.label}`).join(" · ");
  const hasAnnual = card.subjects.some((x) => x.annual !== null && x.annual !== undefined);

  return (
    <article
      aria-label={`Report card for ${card.student.name}`}
      data-report-template={code}
      className="mx-auto max-w-[210mm] rounded-xl border border-[#1a6b5a]/50 bg-white p-4 text-[12px] leading-snug text-black print:max-w-none print:rounded-none print:border-0 print:p-0 print:text-[9.5px] print:leading-tight"
    >
      <header className={`flex items-center gap-4 rounded-lg px-4 py-3 print:rounded-none print:px-3 print:py-2 ${BAND}`}>
        <div className="shrink-0 rounded-lg bg-white p-1.5">
          <SiteImage src="/school-site/aleeman-logo.png" alt="" width={72} height={49} className="h-12 w-auto print:h-10" loading="eager" />
        </div>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="text-xl font-extrabold tracking-wide uppercase print:text-base">{card.school.name}</h2>
          {card.school.address && <p className="text-[11px] print:text-[9px]">{card.school.address}</p>}
          {card.school.motto && <p className="text-[11px] italic print:text-[9px]">&ldquo;{card.school.motto}&rdquo;</p>}
          <p className="mt-1 text-sm font-bold tracking-widest uppercase print:text-[11px]">Report card</p>
          <p className="text-[11px] font-semibold uppercase print:text-[9px]">
            {card.period.label} · Session {card.period.session}
          </p>
        </div>
      </header>

      {card.preview && !card.allPublished && (
        <p role="note" className="mt-2 rounded border border-black p-1.5 text-center text-xs font-semibold print:hidden">
          Preview: some of these results are not published yet, so this is not the card parents will see.
        </p>
      )}

      <dl className="mt-2 grid grid-cols-2 gap-x-4 sm:grid-cols-3 print:grid-cols-3">
        <Field label="Name">{card.student.name}</Field>
        <Field label="Date of birth">{longDate(card.student.dateOfBirth)}</Field>
        <Field label="Sex">{card.student.gender === "FEMALE" ? "Female" : "Male"}</Field>
        <Field label="Class">{card.class ? `${card.class.group} ${card.class.arm}` : "—"}</Field>
        <Field label="No in class">{dash(s.classSize)}</Field>
        <Field label="Position in class">{s.position === null ? "—" : ordinal(s.position)}</Field>
        <Field label="No of times absent">{dash(att?.timesAbsent.value)}</Field>
      </dl>

      <section aria-label="Attendance" className="mt-2">
        <table className="w-full border-collapse text-center">
          <caption className="sr-only">Attendance</caption>
          <thead>
            <tr className={HEAD}>
              <th scope="col" className={CELL}>
                Times school opened
              </th>
              <th scope="col" className={CELL}>
                Times present
              </th>
              {primary && (
                <>
                  <th scope="col" className={CELL}>
                    This term starts on
                  </th>
                  <th scope="col" className={CELL}>
                    Next term starts on
                  </th>
                  <th scope="col" className={CELL}>
                    School closed on
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`${CELL} font-semibold`}>{dash(att?.timesOpen.value)}</td>
              <td className={`${CELL} font-semibold`}>{dash(att?.timesPresent.value)}</td>
              {primary && (
                <>
                  <td className={CELL}>{longDate(card.dates?.termStarts)}</td>
                  <td className={CELL}>{longDate(card.dates?.nextTermStarts)}</td>
                  <td className={CELL}>{longDate(card.dates?.schoolClosed)}</td>
                </>
              )}
            </tr>
          </tbody>
        </table>
      </section>

      {card.subjects.length === 0 ? (
        <p className="mt-3 rounded border border-dashed border-black p-3 text-center">No published results for this term yet.</p>
      ) : (
        <div
          role="region"
          aria-label="Subjects"
          tabIndex={0}
          className="mt-2 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a6b5a]"
        >
          <table className="w-full min-w-[640px] border-collapse text-center print:min-w-0">
            <caption className="sr-only">Subjects, marks and grades</caption>
            <thead>
              <tr className={HEAD}>
                <th scope="col" className={`${CELL} text-left`}>
                  Subject
                </th>
                <th scope="col" className={CELL}>
                  Mark obtainable
                </th>
                <th scope="col" className={CELL}>
                  Continuous assess. score
                </th>
                <th scope="col" className={CELL}>
                  Exam score
                </th>
                <th scope="col" className={CELL}>
                  Total ({card.period.label} score)
                </th>
                {earlier.map((t) => (
                  <th key={t.ordinal} scope="col" className={CELL}>
                    {t.label} score
                  </th>
                ))}
                {hasAnnual && earlier.length > 0 && (
                  <>
                    <th scope="col" className={CELL}>
                      Annual score
                    </th>
                    <th scope="col" className={CELL}>
                      Annual average in %
                    </th>
                  </>
                )}
                <th scope="col" className={CELL}>
                  Position
                </th>
                {secondary && (
                  <th scope="col" className={CELL}>
                    Grade
                  </th>
                )}
                <th scope="col" className={CELL}>
                  Teacher&apos;s remark
                </th>
                <th scope="col" className={CELL}>
                  Signature
                </th>
              </tr>
            </thead>
            <tbody>
              {card.subjects.map((x) => (
                <tr key={x.subjectId}>
                  <th scope="row" className={`${CELL} text-left font-semibold`}>
                    {x.name}
                  </th>
                  <td className={CELL}>{fmt(x.max)}</td>
                  <td className={CELL}>{fmt(x.caTotal)}</td>
                  <td className={CELL}>{fmt(x.exam)}</td>
                  <td className={`${CELL} font-bold`}>{fmt(x.total)}</td>
                  {earlier.map((t) => {
                    const v = x.termScores?.find((y) => y.ordinal === t.ordinal)?.total;
                    return (
                      <td key={t.ordinal} className={CELL}>
                        {v === null || v === undefined ? "—" : fmt(v)}
                      </td>
                    );
                  })}
                  {hasAnnual && earlier.length > 0 && (
                    <>
                      <td className={CELL}>{x.annual === null || x.annual === undefined ? "—" : fmt(x.annual)}</td>
                      <td className={CELL}>{x.annualAverage === null || x.annualAverage === undefined ? "—" : fmt(x.annualAverage)}</td>
                    </>
                  )}
                  <td className={CELL}>{x.position === null || x.position === undefined ? "—" : ordinal(x.position)}</td>
                  {secondary && <td className={`${CELL} font-bold`}>{x.gradeLetter}</td>}
                  <td className={CELL}>{x.gradeRemark}</td>
                  <td className={`${CELL} min-w-12`} />
                </tr>
              ))}
              <tr className={`${TINT} font-bold`}>
                <th scope="row" className={`${CELL} text-left`}>
                  TOTAL
                </th>
                <td className={CELL}>{fmt(sumOf((x) => x.max))}</td>
                <td className={CELL}>{fmt(sumOf((x) => x.caTotal))}</td>
                <td className={CELL}>{fmt(sumOf((x) => x.exam))}</td>
                <td className={CELL}>{fmt(s.totalScore)}</td>
                <td
                  className={CELL}
                  colSpan={Math.max(1, earlier.length + (hasAnnual && earlier.length > 0 ? 2 : 0) + 1 + (secondary ? 1 : 0) + 2)}
                />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className={`mt-1 rounded px-2 py-1 text-center font-bold uppercase ${HEAD}`}>
        Total average score in percentage: {s.average === null ? "—" : `${fmt(s.average)}%`}
      </p>

      <section
        aria-label={primary ? "Skills and domains" : "Character and practical skills"}
        className="mt-2 grid gap-2 sm:grid-cols-2 print:grid-cols-2"
      >
        {card.traits?.map((g) => (
          <div key={g.id}>
            <table className="w-full border-collapse">
              <caption className={`px-2 py-1 text-left font-bold tracking-wide uppercase ${BAND}`}>{g.title}</caption>
              <thead>
                <tr className={HEAD}>
                  <th scope="col" className={`${CELL} text-left`}>
                    Trait
                  </th>
                  <th scope="col" className={`${CELL} w-14 text-center`}>
                    Rating
                  </th>
                  {g.showSign && (
                    <th scope="col" className={`${CELL} w-14 text-center`}>
                      Sign
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {g.traits.map((t) => (
                  <tr key={t.id}>
                    <th scope="row" className={`${CELL} text-left font-medium`}>
                      {t.name}
                    </th>
                    <td className={`${CELL} text-center font-bold`}>{t.rating ?? "—"}</td>
                    {g.showSign && <td className={CELL} />}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
      {card.traits && card.traits.length > 0 && (
        <p className={`mt-1 rounded px-2 py-1 ${TINT}`}>
          <span className="font-bold">Scale:</span> {scaleLine}
        </p>
      )}

      {secondary && card.legend.length > 0 && (
        <p className="mt-2">
          <span className="font-bold">Grading:</span>{" "}
          {card.legend.map((l) => `${l.letter} (${fmt(l.min)}–${fmt(l.max)}) ${l.remark}`).join(" · ")}
        </p>
      )}

      <section aria-label="Comments" className="mt-2 grid gap-2 sm:grid-cols-2 print:grid-cols-2">
        <div className="rounded border border-[#1a6b5a]/60 p-2">
          <h3 className="font-bold uppercase">{primary ? "Class teacher's comment" : "Class teacher's report"}</h3>
          <p className="min-h-8 whitespace-pre-line">{card.remarks.teacher ?? ""}</p>
          <SignLine label="Signature" note="Date" />
        </div>
        <div className="rounded border border-[#1a6b5a]/60 p-2">
          <h3 className="font-bold uppercase">
            {primary ? "Headmaster / head mistress comment" : "Principal's report"}
            {card.school.principal ? ` (${card.school.principal})` : ""}
          </h3>
          <p className="min-h-8 whitespace-pre-line">{card.remarks.principal ?? ""}</p>
          <SignLine label="Signature" note="Date" />
        </div>
        {primary && (
          <div className="rounded border border-[#1a6b5a]/60 p-2 sm:col-span-2 print:col-span-2">
            <h3 className="font-bold uppercase">Parent&apos;s / guardian&apos;s comment</h3>
            <div className="h-8" />
            <SignLine label="Signature" note="Date" />
          </div>
        )}
      </section>

      {secondary && (
        <p className={`mt-2 rounded px-2 py-1 text-center font-bold uppercase ${HEAD}`}>
          Next term begins: {longDate(card.dates?.nextTermStarts)}
        </p>
      )}

      {card.subjects.some((x) => x.verificationToken) && (
        <section aria-label="Verification" className="mt-2 border-t border-black pt-1 text-[10px]">
          <h3 className="font-semibold">Verify these results</h3>
          <ul className="space-y-0.5 break-all">
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
