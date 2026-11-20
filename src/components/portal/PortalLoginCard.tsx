"use client";

import React, { useState } from "react";
import { InstallApp } from "@/components/pwa/InstallApp";
import Link from "next/link";

export interface PortalStudentRecord {
  id: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  gender: string;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  branch: { id: string; name: string };
  /// What applies today (task 0045): shown as a notice, never with the reason.
  standing?: "ACTIVE" | "SUSPENDED" | "EXPELLED";
  standingUntil?: string | null;
  enrollments?: Array<{
    className: string;
    arm: string | null;
    session: { label: string };
  }>;
}

/// Who this card signs in (task 0113, task 0094 D1/D2): decided by the address, never chosen on the form. `ANY` is a deployment with the portals off (one address for everyone).
export type FamilyDoor = "PUPIL" | "GUARDIAN" | "ANY";

/// `ANY` is a deployment with the portals switched off: one address for everyone, where the old single form stays as it was (its heading, field name and button), so what people (and the tests)
/// know does not move; the student. and parent. addresses get the new wording.
const COPY: Record<
  FamilyDoor,
  { title: string; subtitle: string; secret: string; placeholder: string; hint: string; admissionLabel: string; button: string }
> = {
  PUPIL: {
    admissionLabel: "Admission number",
    button: "Sign in",
    title: "Pupil sign-in",
    subtitle: "Results, coursework and practice",
    secret: "Access code",
    placeholder: "e.g. ABCD-EFGH",
    hint: "The pupil code on the slip from the school. While your school allows it, your date of birth works too (like 2014-03-21).",
  },
  GUARDIAN: {
    admissionLabel: "Admission number",
    button: "Sign in",
    title: "Parent sign-in",
    subtitle: "Your children's results, fees and progress",
    secret: "Guardian access code",
    placeholder: "e.g. ABCD-EFGH",
    hint: "The guardian code on the slip from the school. While your school allows it, the phone number or e-mail address the school has for you works too (the whole number).",
  },
  ANY: {
    admissionLabel: "Student Admission Number",
    button: "Access Student Portal",
    title: "AlEemaan Portal",
    subtitle: "Results, fees, coursework and progress",
    secret: "Access code, date of birth or guardian phone",
    placeholder: "e.g. ABCD-EFGH, 2014-03-21 or 08012345678",
    hint: "The code on the slip from the school; or, while your school allows it, the pupil's date of birth or the guardian's whole phone number.",
  },
};

interface PortalLoginCardProps {
  onSuccess: (data: { student: PortalStudentRecord; siblingStudents: PortalStudentRecord[] }) => void;
  door?: FamilyDoor;
  /// Shown under the form on the parent. and student. sign-in pages: the e-mail and password sign-in for an account the school invited (task 0094 D1).
  onUseEmail?: () => void;
  /// On the student. and parent. addresses: the page's own heading and line (the same ones every sign-in page of that portal has), and the portal's name for the marker the page carries.
  heading?: { title: string; line: string; portal: string };
  /// A line under the heading from the host alone (task 0091): the school has not opened this portal.
  notice?: string | null;
}

export function PortalLoginCard({ onSuccess, door = "ANY", onUseEmail, heading, notice = null }: PortalLoginCardProps) {
  const copy = COPY[door];
  const [admissionNo, setAdmissionNo] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/portal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admissionNo: admissionNo.trim(), secret: secret.trim() }),
      });

      const json = await res.json();
      if (!res.ok || !json.data) {
        setError(json.error?.message || "Authentication failed. Please verify your details.");
      } else {
        onSuccess(json.data);
      }
    } catch {
      setError("Network or server connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-surface border border-line rounded-2xl p-6 sm:p-8 shadow-card-v text-fg">
      <div className="text-center mb-6">
        <Link
          href="/"
          aria-label="AlEemaan School website"
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-strong text-white mb-3 shadow-xs transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
            />
          </svg>
        </Link>
        {heading && (
          <span
            data-portal={heading.portal}
            className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold tracking-wide text-brand-fg uppercase"
          >
            {heading.portal}
          </span>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-fg">{heading?.title ?? copy.title}</h1>
        <p className="text-sm text-fg-muted mt-1">{heading ? `${heading.line} ${copy.subtitle}.` : copy.subtitle}</p>
      </div>
      {notice && (
        <p role="status" className="mb-4 rounded-xl border border-info-line bg-info-bg px-3.5 py-3 text-sm text-info-fg">
          {notice}
        </p>
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-5 p-3 rounded-xl bg-danger-bg border border-danger-line text-danger-text text-sm flex items-start gap-2.5"
        >
          <svg className="w-5 h-5 shrink-0 text-danger-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="admissionNo" className="block text-xs font-semibold text-fg-2 uppercase tracking-wider mb-1.5">
            {copy.admissionLabel}
          </label>
          <input
            id="admissionNo"
            type="text"
            required
            autoComplete="username"
            value={admissionNo}
            onChange={(e) => setAdmissionNo(e.target.value)}
            placeholder="e.g. 2025/0001"
            className="w-full px-3.5 py-2.5 rounded-xl bg-field border border-line text-fg placeholder:text-fg-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
        </div>

        <div>
          <label htmlFor="secret" className="block text-xs font-semibold text-fg-2 uppercase tracking-wider mb-1.5">
            {copy.secret}
          </label>
          <input
            id="secret"
            type="text"
            required
            autoComplete="current-password"
            autoCapitalize="characters"
            spellCheck={false}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={copy.placeholder}
            aria-describedby="secret-hint"
            className="w-full px-3.5 py-2.5 rounded-xl bg-field border border-line text-fg placeholder:text-fg-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
          />
          <p id="secret-hint" className="text-xs text-fg-muted mt-1.5">
            {copy.hint}
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-3 px-4 rounded-xl bg-brand-strong hover:bg-brand-strong-hover active:scale-[0.99] text-white font-medium text-sm transition-all duration-150 shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-brand"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Verifying...
            </>
          ) : (
            copy.button
          )}
        </button>
      </form>
      {onUseEmail && (
        <p className="mt-4 text-center text-sm">
          <button
            type="button"
            onClick={onUseEmail}
            className="min-h-11 rounded-md px-2 font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            I have an account with an e-mail address
          </button>
        </p>
      )}
      <InstallApp className="mt-4 w-full text-center" />
    </div>
  );
}
