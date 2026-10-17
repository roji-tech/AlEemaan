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
  const [materialType, setMaterialType] = useState<"DOCUMENT" | "VIDEO_LINK" | "PRESENTATION" | "NOTES" | "OTHER">("DOCUMENT");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [published, setPublished] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const subjectFieldId = useId();
  const classGroupFieldId = useId();
  const materialTypeId = useId();
  const urlId = useId();
  const contentId = useId();
  const descriptionId = useId();
  const publishedId = useId();

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
          materialType,
          url: url ? url : null,
          content: content || null,
          description: description || null,
          published,
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
          <div role="alert" className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor={titleId} className="block text-sm font-medium text-foreground">
            Material Title <span className="text-destructive">*</span>
          </label>
          <input
            id={titleId}
            type="text"
            required
            placeholder="e.g. Chapter 4: Arabic Grammar Notes"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={subjectFieldId} className="block text-sm font-medium text-foreground">
              Subject <span className="text-destructive">*</span>
            </label>
            <select
              id={subjectFieldId}
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={classGroupFieldId} className="block text-sm font-medium text-foreground">
              Target Class (Optional)
            </label>
            <select
              id={classGroupFieldId}
              value={classGroupId}
              onChange={(e) => setClassGroupId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
          <label htmlFor={materialTypeId} className="block text-sm font-medium text-foreground">
            Type of Resource
          </label>
          <select
            id={materialTypeId}
            value={materialType}
            onChange={(e) => setMaterialType(e.target.value as "DOCUMENT" | "VIDEO_LINK" | "PRESENTATION" | "NOTES" | "OTHER")}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="DOCUMENT">Document / PDF</option>
            <option value="VIDEO_LINK">Video Link / Recording</option>
            <option value="PRESENTATION">Slide Deck / Presentation</option>
            <option value="NOTES">Reading Notes</option>
            <option value="OTHER">Other Resource</option>
          </select>
        </div>

        <div>
          <label htmlFor={urlId} className="block text-sm font-medium text-foreground">
            Resource Link or Document URL
          </label>
          <input
            id={urlId}
            type="url"
            placeholder="https://example.com/materials/reading.pdf"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor={descriptionId} className="block text-sm font-medium text-foreground">
            Short Summary / Description
          </label>
          <textarea
            id={descriptionId}
            rows={2}
            placeholder="Brief overview of what students will learn from this resource."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor={contentId} className="block text-sm font-medium text-foreground">
            Inline Content / Notes (Markdown supported)
          </label>
          <textarea
            id={contentId}
            rows={4}
            placeholder="Detailed notes, study guide, or key concepts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id={publishedId}
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
          />
          <label htmlFor={publishedId} className="text-sm font-medium text-foreground">
            Publish immediately (visible to students)
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? "Publishing..." : "Publish Material"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
