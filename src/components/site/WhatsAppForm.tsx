"use client";

import { useState, type ReactNode } from "react";

// A form that writes a WhatsApp message to the school (task 0080). The old site's forms said "submitted" and sent nothing anywhere; this one is honest: pressing the button opens WhatsApp with the answers in the message
// to the school's number, and the person sends it. No server, no storage. `fields` are the questions; `intro` is the first line of the message.
export type FormField =
  | { name: string; label: string; type: "text" | "tel" | "email" | "date" | "textarea"; required?: boolean; value?: string }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; required?: boolean; value?: string };

const CONTROL =
  "w-full rounded-lg border border-[#ccc] bg-white px-3 py-2.5 text-[#333] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2a7f4f]";

export function WhatsAppForm({
  phone,
  intro,
  fields,
  submitLabel,
  note,
  children,
}: {
  phone: string;
  intro: string;
  fields: FormField[];
  submitLabel: string;
  note?: ReactNode;
  children?: ReactNode;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const missing = fields.filter((f) => f.required && !String(form.get(f.name) ?? "").trim());
        if (missing.length) {
          setProblem(`Please fill in: ${missing.map((f) => f.label.replace(/ \*$/, "")).join(", ")}.`);
          return;
        }
        setProblem(null);
        const lines = fields.map((f) => {
          const raw = String(form.get(f.name) ?? "").trim();
          const shown = f.type === "select" ? (f.options.find((o) => o.value === raw)?.label ?? raw) : raw;
          return shown ? `${f.label.replace(/ \*$/, "")}: ${shown}` : null;
        });
        const text = [intro, "", ...lines.filter(Boolean)].join("\n");
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      }}
      noValidate
      className="space-y-5"
    >
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={`f-${f.name}`} className="mb-1.5 block font-medium">
            {f.label}
          </label>
          {f.type === "textarea" ? (
            <textarea id={`f-${f.name}`} name={f.name} rows={3} className={CONTROL} />
          ) : f.type === "select" ? (
            <select id={`f-${f.name}`} name={f.name} defaultValue={f.value ?? ""} className={CONTROL}>
              <option value="">Select</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input id={`f-${f.name}`} name={f.name} type={f.type} defaultValue={f.value} className={CONTROL} />
          )}
        </div>
      ))}
      {children}
      {problem && (
        <p role="alert" className="rounded-lg bg-[#fdecea] px-4 py-3 text-[#b3261e]">
          {problem}
        </p>
      )}
      <button
        type="submit"
        className="w-full rounded-full bg-[#2a7f4f] px-6 py-3.5 font-semibold text-white transition-colors hover:bg-[#006400] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a7f4f]"
      >
        {submitLabel}
      </button>
      {note && <p className="text-sm text-[#666]">{note}</p>}
    </form>
  );
}
