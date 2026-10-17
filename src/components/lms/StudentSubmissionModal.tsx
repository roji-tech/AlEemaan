"use client";

import { useState, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";

export interface StudentSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  branchId: string;
  assignmentId: string;
  assignmentTitle: string;
}

export function StudentSubmissionModal({
  isOpen,
  onClose,
  onSuccess,
  branchId,
  assignmentId,
  assignmentTitle,
}: StudentSubmissionModalProps) {
  const [content, setContent] = useState("");
  const [attachmentTitle, setAttachmentTitle] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentId = useId();
  const attachTitleId = useId();
  const attachUrlId = useId();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const attachments = attachmentTitle && attachmentUrl ? [{ title: attachmentTitle, url: attachmentUrl }] : [];

      const res = await fetch(`/api/v1/lms/assignments/${assignmentId}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          content,
          attachments,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to submit assignment");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title={`Submit Work: ${assignmentTitle}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-md border border-line bg-surface-muted p-3 text-sm text-fg-muted">
            {error}
          </div>
        )}

        <div>
          <label htmlFor={contentId} className="block text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Written Solutions / Response
          </label>
          <textarea
            id={contentId}
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your answers, notes, or explanations here..."
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div className="rounded-lg border border-line bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Add Document Attachment (Optional)</p>
          <div className="mt-2 space-y-2">
            <div>
              <label htmlFor={attachTitleId} className="block text-xs text-fg-muted">
                Document Label
              </label>
              <input
                id={attachTitleId}
                type="text"
                value={attachmentTitle}
                onChange={(e) => setAttachmentTitle(e.target.value)}
                placeholder="e.g. My_Homework_Scan.pdf"
                className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label htmlFor={attachUrlId} className="block text-xs text-fg-muted">
                URL / Link
              </label>
              <input
                id={attachUrlId}
                type="url"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-1.5 text-xs text-fg focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Submit Assignment"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
