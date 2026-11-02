"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { PageHeader } from "@/components/shell/PageHeader";
import { FormOverview } from "@/components/forms/FormOverview";
import { FormQuestions } from "@/components/forms/FormQuestions";
import { PracticeResults } from "@/components/forms/PracticeResults";
import { QuestionnaireResults } from "@/components/forms/QuestionnaireResults";
import { SectionTabs } from "@/components/forms/SectionTabs";
import { StatusBadge } from "@/components/forms/StatusBadge";
import { useClassGroups } from "@/components/forms/useClassGroups";
import { KIND_NOUN, type FormDetail, type FormKindKey, type ListedForm } from "@/components/forms/model";

// One form's page (Task 0041, slice F2a): the overview, the questions, the results. Presentation only: everything comes from the forms APIs, which decide who may see or change it.

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "questions", label: "Questions" },
  { id: "results", label: "Results" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function FormPage({
  formId,
  branchId,
  kind,
  initialTitle,
}: {
  formId: string;
  branchId: string;
  kind: FormKindKey;
  initialTitle: string;
}) {
  const classGroups = useClassGroups(branchId);
  const [detail, setDetail] = useState<FormDetail | null>(null);
  const [summary, setSummary] = useState<ListedForm | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [active, setActive] = useState<SectionId>("overview");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const q = `branchId=${encodeURIComponent(branchId)}`;
      const [one, list] = await Promise.all([
        getJson(`/api/v1/forms/${encodeURIComponent(formId)}?${q}`, signal),
        getJson(`/api/v1/forms?${q}&kind=${kind}&status=ALL`, signal),
      ]);
      if (signal?.aborted) return;
      if (!one.ok) {
        setFailed(one.status === 404 ? "We could not find that form." : say(one, "The form couldn't be loaded."));
        return;
      }
      setFailed(null);
      setDetail(one.data?.form as FormDetail);
      setSummary(((list.ok ? (list.data?.forms ?? []) : []) as ListedForm[]).find((f) => f.id === formId) ?? null);
    },
    [formId, branchId, kind],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the form when the page opens
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // a paper-work form has only its overview until its roll call and marking arrive (slice F2b)
  const sections = kind === "PAPER_WORK" ? SECTIONS.filter((s) => s.id === "overview") : SECTIONS;

  return (
    <div className="space-y-6">
      <Link href="/forms" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-fg hover:underline">
        <span aria-hidden="true">←</span>
        Back to Forms
      </Link>
      <PageHeader
        title={detail?.title ?? initialTitle}
        description={`${KIND_NOUN[kind][0]!.toUpperCase()}${KIND_NOUN[kind].slice(1)}`}
        actions={detail ? <StatusBadge status={detail.status} /> : undefined}
      />
      {failed && <Alert variant="error">{failed}</Alert>}
      {detail === null && !failed && <p className="text-sm text-fg-muted">Loading…</p>}
      {detail && (
        <SectionTabs label="Form sections" idPrefix="fp" sections={sections} active={active} onChange={setActive}>
          {active === "overview" && (
            <FormOverview
              kind={kind}
              branchId={branchId}
              detail={detail}
              summary={summary}
              classGroups={classGroups}
              onChanged={() => void load()}
            />
          )}
          {active === "questions" && <FormQuestions kind={kind} questions={detail.questions} />}
          {active === "results" && kind === "PRACTICE_SET" && <PracticeResults formId={formId} branchId={branchId} />}
          {active === "results" && kind === "QUESTIONNAIRE" && <QuestionnaireResults formId={formId} branchId={branchId} />}
        </SectionTabs>
      )}
    </div>
  );
}
