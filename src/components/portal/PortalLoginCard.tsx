"use client";

import React, { useState } from "react";

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
  enrollments?: Array<{
    className: string;
    arm: string | null;
    session: { label: string };
  }>;
}

interface PortalLoginCardProps {
  onSuccess: (data: { student: PortalStudentRecord; siblingStudents: PortalStudentRecord[] }) => void;
  initialToken?: string;
}

export function PortalLoginCard({ onSuccess, initialToken }: PortalLoginCardProps) {
  const [tab, setTab] = useState<"credentials" | "token">(initialToken ? "token" : "credentials");
  const [admissionNo, setAdmissionNo] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState(initialToken || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload = tab === "token" ? { token: token.trim() } : { admissionNo: admissionNo.trim(), secret: secret.trim() };

      const res = await fetch("/api/v1/portal/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-strong text-brand-contrast mb-3 shadow-xs">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">AlEemaan Portal</h1>
        <p className="text-sm text-fg-muted mt-1">Parent & Student Self-Service Access</p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-surface-2 p-1 border border-line mb-6" role="tablist" aria-label="Login Options">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "credentials"}
          onClick={() => {
            setTab("credentials");
            setError(null);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
            tab === "credentials" ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
          }`}
        >
          Admission Number
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "token"}
          onClick={() => {
            setTab("token");
            setError(null);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
            tab === "token" ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
          }`}
        >
          Access Token / Link
        </button>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-5 p-3 rounded-xl bg-danger-bg border border-danger-line text-danger-text text-sm flex items-start gap-2.5"
        >
          <svg className="w-5 h-5 flex-shrink-0 text-danger-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
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
        {tab === "credentials" ? (
          <>
            <div>
              <label htmlFor="admissionNo" className="block text-xs font-semibold text-fg-2 uppercase tracking-wider mb-1.5">
                Student Admission Number
              </label>
              <input
                id="admissionNo"
                type="text"
                required
                value={admissionNo}
                onChange={(e) => setAdmissionNo(e.target.value)}
                placeholder="e.g. 2025/0001"
                className="w-full px-3.5 py-2.5 rounded-xl bg-field border border-line text-fg placeholder:text-fg-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
              />
            </div>

            <div>
              <label htmlFor="secret" className="block text-xs font-semibold text-fg-2 uppercase tracking-wider mb-1.5">
                Date of Birth OR Guardian Phone
              </label>
              <input
                id="secret"
                type="text"
                required
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="e.g. 2012-05-18 or 08012345678"
                className="w-full px-3.5 py-2.5 rounded-xl bg-field border border-line text-fg placeholder:text-fg-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
              />
              <p className="text-xs text-fg-muted mt-1.5">Matches the pupil&apos;s date of birth or guardian mobile phone.</p>
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="tokenInput" className="block text-xs font-semibold text-fg-2 uppercase tracking-wider mb-1.5">
              Guardian Magic Access Token
            </label>
            <input
              id="tokenInput"
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste token or link received via SMS/Email"
              className="w-full px-3.5 py-2.5 rounded-xl bg-field border border-line text-fg placeholder:text-fg-muted/60 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
            />
            <p className="text-xs text-fg-muted mt-1.5">Check your SMS or WhatsApp message for your secure magic link.</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 py-3 px-4 rounded-xl bg-brand-strong hover:bg-brand-strong-hover active:scale-[0.99] text-brand-contrast font-medium text-sm transition-all duration-150 shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-brand"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-brand-contrast" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Verifying...
            </>
          ) : (
            "Access Student Portal"
          )}
        </button>
      </form>
    </div>
  );
}
