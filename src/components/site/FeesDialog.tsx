"use client";

import { useRef, useState } from "react";
import { FEES, naira, type FeeBill, type FeeCategory } from "@/lib/school-site/fees";
import { SiteIcon } from "./icons";

// The fee schedules of the school website (task 0080): a dialog with the categories at the side, a bill chosen from the category, and the bill's table, notes and payment account. A native `<dialog>`, so the
// browser traps the focus, closes on Escape and returns the focus to the button that opened it. "Print" prints the dialog alone (the rest of the page is hidden in print by globals.css).

function BillView({ bill }: { bill: FeeBill }) {
  const notes = bill.notes?.length ? bill.notes : FEES.defaultNotes;
  const account = bill.account ?? FEES.defaultAccount;
  return (
    <div>
      <h3 className="text-xl font-bold text-[#006400]">{bill.title}</h3>
      {bill.subtitle && <p className="mb-4 text-sm text-[#666]">{bill.subtitle}</p>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[#2a7f4f] text-white">
              <th scope="col" className="p-3">
                Item
              </th>
              {bill.columns.map((c) => (
                <th key={c} scope="col" className="p-3 text-right">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bill.rows.map((r) => (
              <tr key={r.label} className="border-b border-black/10">
                <th scope="row" className="p-3 font-normal">
                  {r.label}
                </th>
                {r.values.map((v, i) => (
                  <td key={i} className="p-3 text-right">
                    {naira(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {bill.showTotal && bill.totals && (
            <tfoot>
              <tr className="bg-[#2a7f4f]/10 font-bold">
                <th scope="row" className="p-3 text-left">
                  Total
                </th>
                {bill.totals.map((v, i) => (
                  <td key={i} className="p-3 text-right">
                    {naira(v)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {bill.materials && bill.materials.items.length > 0 && (
        <div className="mt-6">
          <h4 className="mb-3 font-bold">{bill.materials.title ?? "Required Materials"}</h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {bill.materials.items.map((m) => (
              <li key={m.name} className="flex items-center gap-2 text-sm">
                <SiteIcon name="checkCircle" className="size-4 shrink-0 text-[#2a7f4f]" />
                <span>{m.name}</span>
                {m.qty && <em className="text-[#666]">{m.qty}</em>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 rounded-xl bg-[#f5f5f5] p-4">
        <h4 className="mb-2 font-bold">Notes</h4>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[#555]">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
      <div className="mt-6 rounded-xl border border-[#2a7f4f]/30 p-4">
        <h4 className="mb-2 font-bold">Payment Account</h4>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[#666]">Account Name</dt>
            <dd className="font-semibold">{account.name}</dd>
          </div>
          <div>
            <dt className="text-[#666]">Account Number</dt>
            <dd className="font-semibold">{account.number}</dd>
          </div>
          <div>
            <dt className="text-[#666]">Bank</dt>
            <dd className="font-semibold">{account.bank}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function FeesDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const [categoryId, setCategoryId] = useState(FEES.categories[0].id);
  const [billId, setBillId] = useState<string | null>(null);

  const category: FeeCategory = FEES.categories.find((c) => c.id === categoryId) ?? FEES.categories[0];
  const bill = category.bills.find((b) => b.id === billId) ?? category.bills[0];

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="inline-flex items-center gap-2 rounded-full bg-[#2a7f4f] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#006400] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f4f]"
      >
        <SiteIcon name="fileText" className="size-5" />
        View Full Fee Structure
      </button>
      <dialog
        ref={ref}
        data-fees-dialog
        aria-labelledby="fees-title"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
        className="m-auto max-h-[90vh] w-[min(1000px,95vw)] overflow-y-auto rounded-[15px] bg-white p-0 text-[#333] shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop:bg-black/50"
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/10 p-6">
          <div>
            <h2 id="fees-title" className="text-xl font-bold text-[#006400]">
              Fee Structure
            </h2>
            <p className="text-sm text-[#666]">
              {FEES.schoolName} · {FEES.session}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => ref.current?.close()}
            className="rounded p-1 text-[#666] hover:text-[#333] print:hidden"
          >
            <SiteIcon name="x" className="size-6" />
          </button>
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-[220px_1fr]">
          <div className="space-y-4 print:hidden">
            <div role="group" aria-label="Category" className="flex flex-col gap-2">
              {FEES.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.id === category.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    setBillId(null);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-left font-semibold transition-colors ${c.id === category.id ? "bg-[#2a7f4f] text-white" : "bg-[#f5f5f5] hover:bg-[#2a7f4f]/10"}`}
                >
                  <SiteIcon name={c.icon} className="size-5 shrink-0" />
                  {c.label}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Bill" className="flex flex-col gap-2">
              {category.bills.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={b.id === bill.id}
                  onClick={() => setBillId(b.id)}
                  className={`rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors ${b.id === bill.id ? "border-[#2a7f4f] bg-[#2a7f4f]/10 font-semibold" : "border-transparent bg-[#f5f5f5] hover:border-[#2a7f4f]/40"}`}
                >
                  {b.title}
                </button>
              ))}
            </div>
          </div>
          <div>
            <BillView bill={bill} />
            <button
              type="button"
              onClick={() => window.print()}
              className="mt-6 inline-flex items-center gap-2 rounded-full border-2 border-[#2a7f4f] px-5 py-2 font-semibold text-[#2a7f4f] hover:bg-[#2a7f4f] hover:text-white print:hidden"
            >
              Print / Save as PDF
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
