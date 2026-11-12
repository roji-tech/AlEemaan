"use client";

import { useState, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";

export interface MaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  branchId: string;
  subjects: { id: string; name: string }[];
  classGroups: { id: string; name: string }[];
}

export function MaterialModal({ isOpen, onClose, onSuccess, branchId, subjects, classGroups }: MaterialModalProps) {
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || "");
  const [classGroupId, setClassGroupId] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const subjectFieldId = useId();
  const classGroupFieldId = useId();
  const urlId = useId();
  const contentId = useId();
  const descriptionId = useId();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/lms/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          title,
          subjectId: subjectId || subjects[0]?.id,
          classGroupId: classGroupId || null,
          // the API keeps a link as an attachment, named after the material
          attachments: url.trim() ? [{ title, url: url.trim() }] : [],
          content: content || null,
          description: description || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to create learning material");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving material");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title="Add Learning Material">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="p-3 rounded-lg bg-danger-bg border border-danger-line text-danger-fg text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor={titleId} className="block text-sm font-medium text-fg">
            Material Title <span className="text-danger-fg">*</span>
          </label>
          <input
            id={titleId}
            type="text"
            required
            placeholder="e.g. Chapter 4: Arabic Grammar Notes"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={subjectFieldId} className="block text-sm font-medium text-fg">
              Subject <span className="text-danger-fg">*</span>
            </label>
            <select
              id={subjectFieldId}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={classGroupFieldId} className="block text-sm font-medium text-fg">
              Target Class (Optional)
            </label>
            <select
              id={classGroupFieldId}
              value={classGroupId}
              onChange={(e) => setClassGroupId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All Classes in Subject</option>
              {classGroups.map((cg) => (
                <option key={cg.id} value={cg.id}>
                  {cg.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={urlId} className="block text-sm font-medium text-fg">
            Resource Link or Document URL
          </label>
          <input
            id={urlId}
            type="url"
            placeholder="https://example.com/materials/reading.pdf"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor={descriptionId} className="block text-sm font-medium text-fg">
            Short Summary / Description
          </label>
          <textarea
            id={descriptionId}
            rows={2}
            placeholder="Brief overview of what students will learn from this resource."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor={contentId} className="block text-sm font-medium text-fg">
            Inline Content / Notes (Markdown supported)
          </label>
          <textarea
            id={contentId}
            rows={4}
            placeholder="Detailed notes, study guide, or key concepts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-xs font-mono text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-line-strong bg-field px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-strong-hover focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? "Publishing..." : "Publish Material"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
