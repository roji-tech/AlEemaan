"use client";

import React from "react";
import type { PortalStudentRecord } from "./PortalLoginCard";

interface AssignmentItem {
  id: string;
  title: string;
  description: string | null;
  subjectName: string;
  dueDate: string | null;
  totalPoints: number;
  submission: {
    status: string;
    score: number | null;
    feedback: string | null;
  } | null;
}

interface MaterialItem {
  id: string;
  title: string;
  description: string | null;
  subjectName: string;
  content: string | null;
  attachments: unknown;
  createdAt: string;
}

interface PortalLmsTabProps {
  lms: {
    assignments: AssignmentItem[];
    materials: MaterialItem[];
  };
  student: PortalStudentRecord;
}

export function PortalLmsTab({ lms }: PortalLmsTabProps) {
  const { assignments, materials } = lms;

  return (
    <div className="space-y-6">
      {/* Homework & Assignments */}
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-sm">
        <h3 className="text-base font-bold text-fg mb-4 flex items-center justify-between">
          <span>Assignments & Coursework</span>
          <span className="text-xs font-normal text-fg-muted">
            {assignments.length} Available
          </span>
        </h3>

        {assignments.length === 0 ? (
          <p className="text-xs text-fg-muted py-6 text-center">
            No coursework or homework assignments published for this class yet.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {assignments.map((a) => {
              const submission = a.submission;
              return (
                <div key={a.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-surface-2 text-fg border border-line">
                          {a.subjectName}
                        </span>
                        <h4 className="text-sm font-bold text-fg">{a.title}</h4>
                      </div>
                      {a.description && (
                        <p className="text-xs text-fg-2 mt-1 leading-relaxed">
                          {a.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-center">
                      <div className="text-right">
                        <span className="text-[11px] text-fg-muted block">
                          Due:{" "}
                          {a.dueDate
                            ? new Date(a.dueDate).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })
                            : "No deadline"}
                        </span>
                        <span className="text-xs font-semibold text-fg">
                          {a.totalPoints} pts
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          submission?.status === "GRADED"
                            ? "bg-ok-bg text-ok-fg"
                            : submission?.status === "SUBMITTED"
                            ? "bg-info-bg text-info-fg"
                            : "bg-surface-2 text-fg-muted border border-line"
                        }`}
                      >
                        {submission?.status === "GRADED"
                          ? `${submission.score}/${a.totalPoints}`
                          : submission?.status || "PENDING"}
                      </span>
                    </div>
                  </div>

                  {submission?.feedback && (
                    <div className="mt-2.5 p-2.5 rounded-lg bg-surface-2 border border-line text-xs text-fg-2">
                      <strong className="text-fg">Teacher Feedback:</strong>{" "}
                      {submission.feedback}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Learning Materials & Notes */}
      <div className="bg-surface border border-line rounded-2xl p-5 sm:p-6 shadow-sm">
        <h3 className="text-base font-bold text-fg mb-4 flex items-center justify-between">
          <span>Course Learning Materials & Notes</span>
          <span className="text-xs font-normal text-fg-muted">
            {materials.length} Resource{materials.length === 1 ? "" : "s"}
          </span>
        </h3>

        {materials.length === 0 ? (
          <p className="text-xs text-fg-muted py-6 text-center">
            No course materials or lesson notes uploaded yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {materials.map((m) => (
              <div
                key={m.id}
                className="p-4 rounded-xl border border-line bg-surface-2 flex flex-col justify-between"
              >
                <div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-surface-2 text-fg border border-line inline-block mb-2">
                    {m.subjectName}
                  </span>
                  <h4 className="text-sm font-bold text-fg">{m.title}</h4>
                  {m.description && (
                    <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                      {m.description}
                    </p>
                  )}
                  {m.content && (
                    <p className="text-xs text-fg-2 mt-2 line-clamp-3 bg-surface p-2.5 rounded-lg border border-line">
                      {m.content}
                    </p>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-line text-[11px] text-fg-muted flex items-center justify-between">
                  <span>
                    Uploaded{" "}
                    {new Date(m.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="font-semibold text-brand-fg">Read Lesson</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
