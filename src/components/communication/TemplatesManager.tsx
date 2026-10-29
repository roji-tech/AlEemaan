"use client";

import { useState, useEffect, useCallback } from "react";
import { NotificationChannel } from "@prisma/client";
import { SpinnerIcon } from "@/components/ui/icons";

export interface TemplatesManagerProps {
  branchId: string;
}

interface TemplateItem {
  id: string;
  code: string;
  name: string;
  channel: NotificationChannel;
  subjectTemplate: string | null;
  bodyTemplate: string;
  variables: string[];
  isSystem: boolean;
  createdAt: string;
}

export function TemplatesManager({ branchId }: TemplatesManagerProps) {
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterChannel, setFilterChannel] = useState<string>("ALL");
  const [previewTemplate, setPreviewTemplate] = useState<TemplateItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);

  // Form fields for create/edit
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [channel, setChannel] = useState<NotificationChannel>(NotificationChannel.SMS);
  const [subjectTemplate, setSubjectTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [variablesInput, setVariablesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ branchId });
      if (filterChannel !== "ALL") params.set("channel", filterChannel);

      const res = await fetch(`/api/v1/communication/templates?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setTemplates(json.data || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, [branchId, filterChannel]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch initial data on mount/filter change
    void fetchTemplates();
  }, [fetchTemplates]);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setName("");
    setCode("");
    setChannel(NotificationChannel.SMS);
    setSubjectTemplate("");
    setBodyTemplate("");
    setVariablesInput("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: TemplateItem) => {
    setEditingTemplate(t);
    setName(t.name);
    setCode(t.code);
    setChannel(t.channel);
    setSubjectTemplate(t.subjectTemplate || "");
    setBodyTemplate(t.bodyTemplate);
    setVariablesInput(t.variables.join(", "));
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const variables = variablesInput
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    try {
      if (editingTemplate) {
        const res = await fetch(`/api/v1/communication/templates/${editingTemplate.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId,
            name,
            subjectTemplate: subjectTemplate.trim() || null,
            bodyTemplate,
            variables,
          }),
        });

        if (!res.ok) {
          const json = await res.json();
          setFormError(json.error?.message || "Failed to update template");
          return;
        }
      } else {
        const res = await fetch("/api/v1/communication/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branchId,
            code: code.trim().toUpperCase(),
            name,
            channel,
            subjectTemplate: subjectTemplate.trim() || null,
            bodyTemplate,
            variables,
          }),
        });

        if (!res.ok) {
          const json = await res.json();
          setFormError(json.error?.message || "Failed to create template");
          return;
        }
      }

      setIsModalOpen(false);
      void fetchTemplates();
    } catch {
      setFormError("An unexpected error occurred while saving template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      const res = await fetch(`/api/v1/communication/templates/${id}?branchId=${branchId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        void fetchTemplates();
      }
    } catch {
      // fallback
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-line p-4 rounded-xl">
        <div className="flex items-center gap-2">
          <label htmlFor="tpl-channel-filter" className="text-sm font-semibold text-fg">
            Channel:
          </label>
          <select
            id="tpl-channel-filter"
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value)}
            className="rounded-lg border border-line-strong bg-field px-3 py-1.5 text-sm font-medium focus:border-brand-fg focus:outline-none"
          >
            <option value="ALL">All Channels</option>
            <option value="SMS">SMS</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="IN_APP">In-App</option>
          </select>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-strong text-white hover:bg-brand-strong-hover transition-colors shadow-sm"
        >
          + New Template
        </button>
      </div>

      {/* Grid of Templates */}
      {loading ? (
        <div className="p-12 text-center text-sm text-fg-muted flex items-center justify-center gap-2">
          <SpinnerIcon className="animate-spin h-5 w-5" />
          Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center text-sm text-fg-muted bg-surface border border-line rounded-xl">
          No templates found for this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-surface border border-line rounded-xl p-5 flex flex-col justify-between hover:border-brand-fg transition-colors shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold text-fg-muted">{t.code}</span>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-surface-2 text-fg">{t.channel}</span>
                </div>
                <h3 className="font-semibold text-fg text-sm line-clamp-1">{t.name}</h3>
                {t.subjectTemplate && (
                  <p className="text-xs text-fg-muted line-clamp-1">
                    <span className="font-medium">Subject:</span> {t.subjectTemplate}
                  </p>
                )}
                <p className="text-xs text-fg-muted font-mono bg-surface-2 p-2.5 rounded-lg line-clamp-3">{t.bodyTemplate}</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-line mt-4 text-xs font-medium">
                <span className="text-fg-muted">{t.isSystem ? "System" : "Custom"}</span>
                <div className="space-x-3">
                  <button type="button" onClick={() => setPreviewTemplate(t)} className="text-brand-fg hover:underline">
                    Preview
                  </button>
                  {!t.isSystem && (
                    <>
                      <button type="button" onClick={() => handleOpenEdit(t)} className="text-fg-muted hover:text-fg">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(t.id)}
                        className="text-danger-fg hover:underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-surface border border-line rounded-xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-semibold text-fg">{previewTemplate.name}</h3>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="text-fg-muted hover:text-fg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="text-xs text-fg-muted flex gap-4">
                <span>
                  Code: <strong className="text-fg">{previewTemplate.code}</strong>
                </span>
                <span>
                  Channel: <strong className="text-fg">{previewTemplate.channel}</strong>
                </span>
              </div>
              {previewTemplate.subjectTemplate && (
                <div>
                  <span className="text-xs font-semibold text-fg-muted">Subject Template:</span>
                  <p className="font-medium text-fg">{previewTemplate.subjectTemplate}</p>
                </div>
              )}
              <div>
                <span className="text-xs font-semibold text-fg-muted">Body Template:</span>
                <p className="mt-1 p-3 bg-surface-2 rounded-lg font-mono text-xs text-fg whitespace-pre-wrap">
                  {previewTemplate.bodyTemplate}
                </p>
              </div>
              {previewTemplate.variables.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-fg-muted">Expected Variables:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {previewTemplate.variables.map((v) => (
                      <span key={v} className="text-xs px-2 py-0.5 rounded bg-surface-2 text-fg font-mono">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-surface-2 text-fg hover:bg-line"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg bg-surface border border-line rounded-xl shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-semibold text-fg">{editingTemplate ? "Edit Template" : "New Custom Template"}</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-fg-muted hover:text-fg text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="p-3 bg-danger-bg border border-danger-line rounded-lg text-xs text-danger-fg"
              >
                {formError}
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div>
                <label htmlFor="tpl-name" className="block text-xs font-semibold text-fg mb-1">
                  Template Name
                </label>
                <input
                  id="tpl-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Admission Acceptance Notification"
                  className="w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-sm text-fg focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              {!editingTemplate && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tpl-code" className="block text-xs font-semibold text-fg mb-1">
                      Template Code (UPPERCASE)
                    </label>
                    <input
                      id="tpl-code"
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="e.g. ADMISSION_ACCEPT"
                      className="w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-sm text-fg font-mono focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label htmlFor="tpl-channel" className="block text-xs font-semibold text-fg mb-1">
                      Channel
                    </label>
                    <select
                      id="tpl-channel"
                      value={channel}
                      onChange={(e) => setChannel(e.target.value as NotificationChannel)}
                      className="w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-sm text-fg focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="SMS">SMS</option>
                      <option value="EMAIL">Email</option>
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="IN_APP">In-App</option>
                    </select>
                  </div>
                </div>
              )}

              {(channel === NotificationChannel.EMAIL || channel === NotificationChannel.IN_APP) && (
                <div>
                  <label htmlFor="tpl-subject" className="block text-xs font-semibold text-fg mb-1">
                    Subject Template
                  </label>
                  <input
                    id="tpl-subject"
                    type="text"
                    value={subjectTemplate}
                    onChange={(e) => setSubjectTemplate(e.target.value)}
                    placeholder="e.g. Welcome {{student_name}} to {{school_name}}"
                    className="w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-sm text-fg focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              )}

              <div>
                <label htmlFor="tpl-body" className="block text-xs font-semibold text-fg mb-1">
                  Body Template
                </label>
                <textarea
                  id="tpl-body"
                  rows={4}
                  required
                  value={bodyTemplate}
                  onChange={(e) => setBodyTemplate(e.target.value)}
                  placeholder="Dear Guardian, {{student_name}} has been enrolled in {{class_arm}}."
                  className="w-full rounded-lg border border-line-strong bg-field p-3 text-sm text-fg font-mono focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div>
                <label htmlFor="tpl-vars" className="block text-xs font-semibold text-fg mb-1">
                  Expected Variables (comma-separated)
                </label>
                <input
                  id="tpl-vars"
                  type="text"
                  value={variablesInput}
                  onChange={(e) => setVariablesInput(e.target.value)}
                  placeholder="student_name, class_arm, school_name"
                  className="w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-sm text-fg focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-fg-muted hover:text-fg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim() || !bodyTemplate.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-brand-strong text-white hover:bg-brand-strong-hover disabled:opacity-50"
              >
                {saving && <SpinnerIcon className="animate-spin h-4 w-4" />}
                {editingTemplate ? "Save Changes" : "Create Template"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
