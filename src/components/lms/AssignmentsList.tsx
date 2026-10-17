"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { AssignmentModal } from "./AssignmentModal";
import { SpeedGraderModal } from "./SpeedGraderModal";
import { StudentSubmissionModal } from "./StudentSubmissionModal";

interface AssignmentItem {
  id: string;
  branchId: string;
  title: string;
  description: string | null;
  subject: { id: string; name: string; code?: string };
  classGroup: { id: string; name: string } | null;
  dueDate: string | null;
  totalPoints: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  allowLate: boolean;
  submissionsCount?: number;
  createdAt: string;
}

interface AssignmentsListProps {
  branchId: string;
  subjects: { id: string; name: string }[];
  classGroups: { id: string; name: string }[];
  userRole?: string;
}

export function AssignmentsList({
  branchId,
  subjects,
  classGroups,
  userRole = "ADMIN",
}: AssignmentsListProps) {
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedForGrading, setSelectedForGrading] = useState<AssignmentItem | null>(null);
  const [selectedForSubmission, setSelectedForSubmission] = useState<AssignmentItem | null>(null);

  const subjectFilterId = useId();
  const statusFilterId = useId();
  const searchFilterId = useId();

  const fetchAssignments = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branchId });
      if (subjectFilter) params.set("subjectId", subjectFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/v1/lms/assignments?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load assignments");
      }
      const data = await res.json();
      setAssignments(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading assignments");
    } finally {
      setLoading(false);
    }
  }, [branchId, subjectFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch assignments when filters change
    void fetchAssignments();
  }, [fetchAssignments]);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete assignment "${title}"?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/lms/assignments/${id}?branchId=${branchId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to delete assignment");
      }
      void fetchAssignments();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete assignment");
    }
  };

  const filteredAssignments = assignments.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      item.subject.name.toLowerCase().includes(query) ||
      (item.classGroup && item.classGroup.name.toLowerCase().includes(query))
    );
  });

  const getStatusBadge = (status: AssignmentItem["status"]) => {
    const styles = {
      DRAFT: "bg-muted text-foreground border-border",
      PUBLISHED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      CLOSED: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      ARCHIVED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.DRAFT}`}
      >
        {status}
      </span>
    );
  };

  const canManage = ["ADMIN", "DIRECTOR", "PRINCIPAL", "VICE_PRINCIPAL", "TEACHER"].includes(
    userRole
  );

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Coursework Assignments</h2>
          <p className="text-sm text-muted-foreground">
            Manage student assignments, grading rubrics, deadlines, and submissions.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
          >
            + Create Assignment
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-card border border-border rounded-xl">
        <div>
          <label htmlFor={searchFilterId} className="block text-xs font-medium text-foreground mb-1">
            Search
          </label>
          <input
            id={searchFilterId}
            type="text"
            placeholder="Search by title or class..."
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

        <div>
          <label htmlFor={statusFilterId} className="block text-xs font-medium text-foreground mb-1">
            Status
          </label>
          <select
            id={statusFilterId}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="CLOSED">Closed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Error / Loading / Content State */}
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
          Loading coursework assignments...
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-border rounded-xl">
          <p className="text-sm font-medium text-foreground">No assignments found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {canManage
              ? "Create your first assignment using the button above."
              : "No coursework has been assigned for this branch yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssignments.map((assignment) => (
            <div
              key={assignment.id}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow transition-shadow"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {assignment.subject.name}
                  </span>
                  {getStatusBadge(assignment.status)}
                </div>

                <div>
                  <h3 className="font-semibold text-foreground text-base line-clamp-1">
                    {assignment.title}
                  </h3>
                  {assignment.classGroup && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Class: {assignment.classGroup.name}
                    </p>
                  )}
                </div>

                {assignment.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {assignment.description}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Max Points:</span>
                    <span className="font-medium text-foreground">{assignment.totalPoints} pts</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Due Date:</span>
                    <span className="font-medium text-foreground">
                      {assignment.dueDate
                        ? new Date(assignment.dueDate).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "No deadline"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedForSubmission(assignment)}
                  className="text-xs font-medium text-primary hover:underline focus:outline-none"
                >
                  Submit
                </button>

                <div className="flex items-center gap-2">
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedForGrading(assignment)}
                        className="inline-flex items-center px-2.5 py-1 rounded bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                      >
                        Speed Grader
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(assignment.id, assignment.title)}
                        className="p-1 rounded text-destructive hover:bg-destructive/10 text-xs font-medium focus:outline-none"
                        aria-label={`Delete assignment ${assignment.title}`}
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

      {/* Creation Modal */}
      {isCreateOpen && (
        <AssignmentModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            setIsCreateOpen(false);
            void fetchAssignments();
          }}
          branchId={branchId}
          subjects={subjects}
          classGroups={classGroups}
        />
      )}

      {/* Speed Grader Modal */}
      {selectedForGrading && (
        <SpeedGraderModal
          isOpen={Boolean(selectedForGrading)}
          onClose={() => setSelectedForGrading(null)}
          onSuccess={() => void fetchAssignments()}
          branchId={branchId}
          assignmentId={selectedForGrading.id}
          assignmentTitle={selectedForGrading.title}
          totalPoints={selectedForGrading.totalPoints}
        />
      )}

      {/* Student Submission Modal */}
      {selectedForSubmission && (
        <StudentSubmissionModal
          isOpen={Boolean(selectedForSubmission)}
          onClose={() => setSelectedForSubmission(null)}
          onSuccess={() => {
            setSelectedForSubmission(null);
            void fetchAssignments();
          }}
          branchId={branchId}
          assignmentId={selectedForSubmission.id}
          assignmentTitle={selectedForSubmission.title}
        />
      )}
    </div>
  );
}
