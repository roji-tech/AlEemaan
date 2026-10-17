"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { MaterialModal } from "./MaterialModal";

interface MaterialItem {
  id: string;
  branchId: string;
  title: string;
  description: string | null;
  materialType: "DOCUMENT" | "VIDEO_LINK" | "PRESENTATION" | "NOTES" | "OTHER";
  url: string | null;
  content: string | null;
  published: boolean;
  subject: { id: string; name: string };
  classGroup: { id: string; name: string } | null;
  createdAt: string;
}

interface MaterialsListProps {
  branchId: string;
  subjects: { id: string; name: string }[];
  classGroups: { id: string; name: string }[];
  userRole?: string;
}

export function MaterialsList({
  branchId,
  subjects,
  classGroups,
  userRole = "ADMIN",
}: MaterialsListProps) {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const subjectFilterId = useId();
  const searchFilterId = useId();

  const fetchMaterials = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branchId });
      if (subjectFilter) params.set("subjectId", subjectFilter);

      const res = await fetch(`/api/v1/lms/materials?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load materials");
      const data = await res.json();
      setMaterials(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading materials");
    } finally {
      setLoading(false);
    }
  }, [branchId, subjectFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load materials when branch/filters change
    void fetchMaterials();
  }, [fetchMaterials]);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      const res = await fetch(`/api/v1/lms/materials/${id}?branchId=${branchId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to delete material");
      }
      void fetchMaterials();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete material");
    }
  };

  const filteredMaterials = materials.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      item.subject.name.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query))
    );
  });

  const canManage = ["ADMIN", "DIRECTOR", "PRINCIPAL", "VICE_PRINCIPAL", "TEACHER"].includes(
    userRole
  );

  const typeLabels = {
    DOCUMENT: "Document",
    VIDEO_LINK: "Video Link",
    PRESENTATION: "Presentation",
    NOTES: "Reading Notes",
    OTHER: "Resource",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Study Materials & Guides
          </h2>
          <p className="text-sm text-muted-foreground">
            Centralized repository of lecture notes, reading materials, slides, and syllabus documents.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
          >
            + Add Material
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-card border border-border rounded-xl">
        <div>
          <label htmlFor={searchFilterId} className="block text-xs font-medium text-foreground mb-1">
            Search
          </label>
          <input
            id={searchFilterId}
            type="text"
            placeholder="Search materials by title or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor={subjectFilterId} className="block text-xs font-medium text-foreground mb-1">
            Subject
          </label>
          <select
            id={subjectFilterId}
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
          Loading learning resources...
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-border rounded-xl">
          <p className="text-sm font-medium text-foreground">No study materials available</p>
          <p className="text-xs text-muted-foreground mt-1">
            {canManage
              ? "Upload notes or add resources using the button above."
              : "No study materials have been published for this branch yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMaterials.map((mat) => (
            <div
              key={mat.id}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow transition-shadow"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {mat.subject.name}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                    {typeLabels[mat.materialType] || mat.materialType}
                  </span>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground text-base line-clamp-1">{mat.title}</h3>
                  {mat.classGroup && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Class: {mat.classGroup.name}
                    </p>
                  )}
                </div>

                {mat.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{mat.description}</p>
                )}

                {mat.content && (
                  <div className="p-2.5 rounded bg-muted/40 text-xs text-foreground font-mono line-clamp-3">
                    {mat.content}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                {mat.url ? (
                  <a
                    href={mat.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Open Resource ↗
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">In-app resource</span>
                )}

                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDelete(mat.id, mat.title)}
                    className="p-1 rounded text-destructive hover:bg-destructive/10 text-xs font-medium focus:outline-none"
                    aria-label={`Delete material ${mat.title}`}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <MaterialModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            void fetchMaterials();
          }}
          branchId={branchId}
          subjects={subjects}
          classGroups={classGroups}
        />
      )}
    </div>
  );
}
