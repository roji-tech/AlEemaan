"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { QuizModal } from "./QuizModal";
import { QuizAttemptModal } from "./QuizAttemptModal";

interface Question {
  id: string;
  prompt: string;
  questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  options: { id: string; text: string }[];
  points: number;
}

interface QuizItem {
  id: string;
  branchId: string;
  title: string;
  instructions: string | null;
  timeLimitMinutes: number | null;
  passingScore: number | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  subject: { id: string; name: string };
  classGroup: { id: string; name: string } | null;
  questions: Question[];
  createdAt: string;
}

interface QuizConsoleProps {
  branchId: string;
  subjects: { id: string; name: string }[];
  classGroups: { id: string; name: string }[];
  userRole?: string;
}

export function QuizConsole({ branchId, subjects, classGroups, userRole = "ADMIN" }: QuizConsoleProps) {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedForAttempt, setSelectedForAttempt] = useState<QuizItem | null>(null);

  const subjectFilterId = useId();
  const searchFilterId = useId();

  const fetchQuizzes = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ branchId });
      if (subjectFilter) params.set("subjectId", subjectFilter);

      const res = await fetch(`/api/v1/lms/quizzes?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load quizzes");
      const data = await res.json();
      setQuizzes(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading quizzes");
    } finally {
      setLoading(false);
    }
  }, [branchId, subjectFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load quizzes when branch/filters change
    void fetchQuizzes();
  }, [fetchQuizzes]);

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete quiz "${title}"?`)) return;
    try {
      const res = await fetch(`/api/v1/lms/quizzes/${id}?branchId=${branchId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to delete quiz");
      }
      void fetchQuizzes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete quiz");
    }
  };

  const filteredQuizzes = quizzes.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(query) ||
      item.subject.name.toLowerCase().includes(query) ||
      (item.instructions && item.instructions.toLowerCase().includes(query))
    );
  });

  const canManage = ["ADMIN", "DIRECTOR", "PRINCIPAL", "VICE_PRINCIPAL", "TEACHER"].includes(userRole);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Quizzes & Online Assessments</h2>
          <p className="text-sm text-muted-foreground">Create auto-evaluated tests, objective quizzes, and check knowledge retention.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
          >
            + Create Quiz
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
            placeholder="Search quizzes by title or subject..."
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
        <div role="alert" className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">Loading assessments...</div>
      ) : filteredQuizzes.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-border rounded-xl">
          <p className="text-sm font-medium text-foreground">No quizzes created</p>
          <p className="text-xs text-muted-foreground mt-1">
            {canManage ? "Create your first interactive quiz using the button above." : "No quizzes are available for this branch yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredQuizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow transition-shadow"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">{quiz.subject.name}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                      quiz.status === "PUBLISHED"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {quiz.status}
                  </span>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground text-base line-clamp-1">{quiz.title}</h3>
                  {quiz.classGroup && <p className="text-xs text-muted-foreground mt-0.5">Class: {quiz.classGroup.name}</p>}
                </div>

                {quiz.instructions && <p className="text-xs text-muted-foreground line-clamp-2">{quiz.instructions}</p>}

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/60 text-xs">
                  <div>
                    <span className="text-muted-foreground block">Questions</span>
                    <span className="font-medium text-foreground">{quiz.questions?.length ?? 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Time</span>
                    <span className="font-medium text-foreground">{quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes}m` : "Untimed"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Pass Rate</span>
                    <span className="font-medium text-foreground">{quiz.passingScore ? `${quiz.passingScore}%` : "None"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedForAttempt(quiz)}
                  className="inline-flex items-center px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium shadow hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
                >
                  Take Quiz
                </button>

                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDelete(quiz.id, quiz.title)}
                    className="p-1 rounded text-destructive hover:bg-destructive/10 text-xs font-medium focus:outline-none"
                    aria-label={`Delete quiz ${quiz.title}`}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      {isCreateOpen && (
        <QuizModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            setIsCreateOpen(false);
            void fetchQuizzes();
          }}
          branchId={branchId}
          subjects={subjects}
          classGroups={classGroups}
        />
      )}

      {/* Attempt Modal */}
      {selectedForAttempt && (
        <QuizAttemptModal
          isOpen={Boolean(selectedForAttempt)}
          onClose={() => setSelectedForAttempt(null)}
          quizId={selectedForAttempt.id}
          quizTitle={selectedForAttempt.title}
          timeLimitMinutes={selectedForAttempt.timeLimitMinutes}
          passingScore={selectedForAttempt.passingScore}
          questions={selectedForAttempt.questions || []}
          onComplete={() => {
            void fetchQuizzes();
          }}
        />
      )}
    </div>
  );
}
