"use client";

import { useState } from "react";
import { NotificationChannel } from "@prisma/client";
import { SpinnerIcon } from "@/components/ui/icons";

export interface BroadcastComposerProps {
  branchId: string;
  onSuccess?: () => void;
}

export function BroadcastComposer({ branchId, onSuccess }: BroadcastComposerProps) {
  const [channel, setChannel] = useState<NotificationChannel>(NotificationChannel.SMS);
  const [targetAudience, setTargetAudience] = useState<string>("ALL_PARENTS");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const availableVariables = [
    { label: "Student Name", token: "{{student_name}}" },
    { label: "Class Arm", token: "{{class_arm}}" },
    { label: "School Name", token: "{{school_name}}" },
    { label: "Date", token: "{{date}}" },
    { label: "Due Date", token: "{{due_date}}" },
  ];

  const insertVariable = (token: string) => {
    setBody((prev) => `${prev} ${token} `);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/v1/communication/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          channel,
          targetAudience,
          subject: subject.trim() || undefined,
          body: body.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: json.error?.message || "Failed to dispatch broadcast campaign",
        });
        return;
      }

      setFeedback({
        type: "success",
        message: `Broadcast successfully dispatched to ${json.data?.count || 0} recipient(s)!`,
      });
      setSubject("");
      setBody("");
      onSuccess?.();
    } catch {
      setFeedback({
        type: "error",
        message: "An unexpected error occurred while sending broadcast",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSend} className="space-y-6 max-w-4xl bg-card border border-border p-6 rounded-xl shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Compose Broadcast</h2>
          <p className="text-sm text-muted-foreground">
            Send instant multi-channel broadcast notifications to parents, staff, or students.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`p-4 rounded-lg text-sm font-medium ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
              : "bg-red-50 text-red-900 border border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Channel Selection */}
        <div>
          <label htmlFor="broadcast-channel" className="block text-sm font-semibold text-foreground mb-1">
            Notification Channel
          </label>
          <div id="broadcast-channel" className="flex flex-wrap gap-2">
            {[
              { id: NotificationChannel.SMS, label: "SMS" },
              { id: NotificationChannel.EMAIL, label: "Email" },
              { id: NotificationChannel.WHATSAPP, label: "WhatsApp" },
              { id: NotificationChannel.IN_APP, label: "In-App" },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannel(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  channel === c.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-input hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target Audience */}
        <div>
          <label htmlFor="broadcast-target" className="block text-sm font-semibold text-foreground mb-1">
            Target Audience
          </label>
          <select
            id="broadcast-target"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="ALL_PARENTS">All Guardians / Parents</option>
            <option value="STAFF">Teaching & Non-Teaching Staff</option>
            <option value="STUDENTS">Students (with login accounts)</option>
          </select>
        </div>
      </div>

      {/* Subject (for Email or In-App) */}
      {(channel === NotificationChannel.EMAIL || channel === NotificationChannel.IN_APP) && (
        <div>
          <label htmlFor="broadcast-subject" className="block text-sm font-semibold text-foreground mb-1">
            Email / Message Subject
          </label>
          <input
            id="broadcast-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. End of Term Resumption Notice"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {/* Message Body */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="broadcast-body" className="block text-sm font-semibold text-foreground">
            Message Content
          </label>
          <span className="text-xs text-muted-foreground">{body.length} characters</span>
        </div>
        <textarea
          id="broadcast-body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type your broadcast announcement message here..."
          required
          className="w-full rounded-lg border border-input bg-background p-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y"
        />
      </div>

      {/* Dynamic Placeholder Insertion Chips */}
      <div>
        <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Insert Personalization Tags</span>
        <div className="flex flex-wrap gap-1.5">
          {availableVariables.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => insertVariable(v.token)}
              className="text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 font-mono transition-colors"
            >
              + {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Preview Box */}
      {body && (
        <div className="bg-muted/40 border border-border p-4 rounded-lg">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Live Preview ({channel})</h3>
          {subject && <p className="font-semibold text-sm text-foreground mb-1">{subject}</p>}
          <p className="text-sm text-foreground whitespace-pre-wrap">{body}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={() => {
            setSubject("");
            setBody("");
          }}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={loading || !body.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading && <SpinnerIcon className="animate-spin h-4 w-4" />}
          Send Broadcast
        </button>
      </div>
    </form>
  );
}
