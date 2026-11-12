"use client";

import { useState, useId, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { attachmentLinks } from "@/lib/lms/attachments";

export type MaterialType = "DOCUMENT" | "VIDEO_LINK" | "PRESENTATION" | "NOTES" | "OTHER";

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  DOCUMENT: "Document / PDF",
  VIDEO_LINK: "Video Link / Recording",
  PRESENTATION: "Slide Deck / Presentation",
  NOTES: "Reading Notes",
  OTHER: "Other Resource",
};

/// A material being edited (task 0066). The list mounts the dialog fresh for each open, so the fields start from these values.
export interface MaterialToEdit {
  id: string;
  title: string;
  subject: { id: string };
  classGroup: { id: string } | null;
  description: string | null;
  content: string | null;
  attachments: unknown;
  materialType: MaterialType;
  status: "DRAFT" | "PUBLISHED";
}

export interface MaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  branchId: string;
  subjects: { id: string; name: string }[];
  classGroups: { id: string; name: string }[];
  material?: MaterialToEdit | null;
}

export function MaterialModal({ isOpen, onClose, onSuccess, branchId, subjects, classGroups, material = null }: MaterialModalProps) {
  // the dialog shows the first web link; any further links (a material made through the API can hold several) are kept as they are
  const existingLinks = attachmentLinks(material?.attachments);
  const [title, setTitle] = useState(material?.title ?? "");
  const [subjectId, setSubjectId] = useState(material?.subject.id ?? subjects[0]?.id ?? "");
  const [classGroupId, setClassGroupId] = useState(material?.classGroup?.id ?? "");
  const [materialType, setMaterialType] = useState<MaterialType>(material?.materialType ?? "DOCUMENT");
  const [url, setUrl] = useState(existingLinks[0]?.url ?? "");
  const [content, setContent] = useState(material?.content ?? "");
  const [description, setDescription] = useState(material?.description ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const typeId = useId();
  const subjectFieldId = useId();
  const classGroupFieldId = useId();
  const urlId = useId();
  const contentId = useId();
  const descriptionId = useId();

  const editing = material !== null;
  const isDraft = material === null || material.status === "DRAFT";

  /// `status` is what the row becomes: a new material is published or kept as a draft; an edit keeps the status unless a draft is published.
  const save = async (status: "DRAFT" | "PUBLISHED" | null) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(material ? `/api/v1/lms/materials/${material.id}` : "/api/v1/lms/materials", {
        method: material ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          title,
          subjectId: subjectId || subjects[0]?.id,
          classGroupId: classGroupId || null,
          materialType,
          // the API keeps a link as an attachment, named after the material
          attachments: [...(url.trim() ? [{ title, url: url.trim() }] : []), ...existingLinks.slice(1)],
          content: content || null,
          description: description || null,
          ...(status ? { status } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || (editing ? "Failed to save the material" : "Failed to create learning material"));
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving material");
    } finally {
      setLoading(false);
    }
  };

  // Enter in a field does the primary action: publish a new one or a draft, save the changes of one already out
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save(isDraft ? "PUBLISHED" : null);
  };

  return (
    <Dialog open={isOpen} onClose={onClose} title={editing ? "Edit Learning Material" : "Add Learning Material"}>
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
          <label htmlFor={typeId} className="block text-sm font-medium text-fg">
            Type of Resource
          </label>
          <select
            id={typeId}
            value={materialType}
            onChange={(e) => setMaterialType(e.target.value as MaterialType)}
            className="mt-1 block w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-fg shadow-sm focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((key) => (
              <option key={key} value={key}>
                {MATERIAL_TYPE_LABELS[key]}
              </option>
            ))}
          </select>
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
          {isDraft && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void save("DRAFT")}
              className="rounded-lg border border-line-strong bg-field px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
            >
              {editing ? "Save Draft" : "Save as Draft"}
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white shadow hover:bg-brand-strong-hover focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
          >
            {isDraft ? (loading ? "Publishing..." : "Publish Material") : loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
