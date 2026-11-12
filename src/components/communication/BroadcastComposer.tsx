"use client";

import { useState } from "react";
import { NotificationChannel } from "@prisma/client";
import { InfoTip } from "@/components/ui/InfoTip";
import { SpinnerIcon } from "@/components/ui/icons";
import { tagsFor } from "@/lib/communication/tags";

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

  // Only the tags the server fills for this audience (tags.ts, task 0055): a chip is never offered that a recipient would receive as the text "{{...}}".
  const availableVariables = tagsFor(targetAudience).map((tag) => ({ label: tag.label, token: `{{${tag.token}}}` }));
  // A pupil's login has no phone number on file, and nothing here shows an In-App message to anyone (Announcements do): so those are not offered.
  const phoneNotAvailable = targetAudience === "STUDENTS";

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

      // What happened, not only how many rows were made (task 0053): a message that failed, or could not be sent because the provider is not set up, is said so and its text is kept.
      const sent: number = json.data?.sent ?? json.data?.count ?? 0;
      const failed: number = json.data?.failed ?? 0;
      const reason: string | null = json.data?.firstError ?? null;
      if (failed > 0) {
        setFeedback({
          type: "error",
          message:
            (sent === 0 ? "The broadcast was not sent." : `Sent to ${sent}, failed for ${failed}.`) +
            (reason ? ` ${reason}` : "") +
            " Details are in Message Logs & Dispatches.",
        });
        // Stay here: the panel moves to the logs when the composer reports success, and this message (and the unsent text) would go with it.
        return;
      }
      setFeedback({
        type: "success",
        message: `Broadcast successfully dispatched to ${sent} recipient(s)!`,
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
    <form onSubmit={handleSend} className="space-y-6 max-w-4xl bg-surface border border-line p-6 rounded-xl shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
        <div>
          <h2 className="text-lg font-semibold text-fg">Compose Broadcast</h2>
          <p className="text-sm text-fg-muted">Send instant multi-channel broadcast notifications to parents, staff, or students.</p>
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`p-4 rounded-lg text-sm font-medium ${
            feedback.type === "success"
              ? "bg-ok-bg text-ok-fg border border-ok-line"
              : "bg-danger-bg text-danger-fg border border-danger-line"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Channel Selection */}
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <label htmlFor="broadcast-channel" className="block text-sm font-semibold text-fg">
              Notification Channel
            </label>
            <InfoTip tip="communication.channel" />
          </div>
          <div id="broadcast-channel" className="flex flex-wrap gap-2">
            {[
              { id: NotificationChannel.SMS, label: "SMS" },
              { id: NotificationChannel.EMAIL, label: "Email" },
              { id: NotificationChannel.WHATSAPP, label: "WhatsApp" },
            ].map((c) => {
              const unavailable = phoneNotAvailable && c.id !== NotificationChannel.EMAIL;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannel(c.id)}
                  aria-pressed={channel === c.id}
                  disabled={unavailable}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    channel === c.id
                      ? "bg-brand-strong text-white border-brand-fg"
                      : "bg-field text-fg-muted border-line-strong hover:bg-surface-2"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {phoneNotAvailable && (
            <p className="mt-1.5 text-xs text-fg-muted">Pupils have no phone number on file, so only Email is available for them.</p>
          )}
        </div>

        {/* Target Audience */}
        <div>
          <label htmlFor="broadcast-target" className="block text-sm font-semibold text-fg mb-1">
            Target Audience
          </label>
          <select
            id="broadcast-target"
            value={targetAudience}
            onChange={(e) => {
              setTargetAudience(e.target.value);
              // choosing pupils while a phone channel is selected moves to Email, the one channel that reaches them (the hint under the buttons says why)
              if (e.target.value === "STUDENTS" && channel !== NotificationChannel.EMAIL) setChannel(NotificationChannel.EMAIL);
            }}
            className="w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-sm text-fg focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="ALL_PARENTS">All Guardians / Parents</option>
            <option value="STAFF">Teaching & Non-Teaching Staff</option>
            <option value="STUDENTS">Students (with login accounts)</option>
          </select>
        </div>
      </div>

      {/* Subject (Email only: an SMS or a WhatsApp message has none) */}
      {channel === NotificationChannel.EMAIL && (
        <div>
          <label htmlFor="broadcast-subject" className="block text-sm font-semibold text-fg mb-1">
            Email / Message Subject
          </label>
          <input
            id="broadcast-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. End of Term Resumption Notice"
            className="w-full rounded-lg border border-line-strong bg-field px-3 py-2 text-sm text-fg focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {/* Message Body */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="broadcast-body" className="block text-sm font-semibold text-fg">
            Message Content
          </label>
          <span className="text-xs text-fg-muted">{body.length} characters</span>
        </div>
        <textarea
          id="broadcast-body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type your broadcast announcement message here..."
          required
          className="w-full rounded-lg border border-line-strong bg-field p-3 text-sm text-fg focus:border-brand-fg focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        />
      </div>

      {/* Dynamic Placeholder Insertion Chips */}
      <div>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wider">Insert Personalization Tags</span>
          <InfoTip tip="communication.tags" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {availableVariables.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => insertVariable(v.token)}
              className="text-xs px-2.5 py-1 rounded-md bg-surface-2 text-fg hover:bg-line font-mono transition-colors"
            >
              + {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Preview Box */}
      {body && (
        <div className="bg-surface-2 border border-line p-4 rounded-lg">
          <h3 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">Live Preview ({channel})</h3>
          {subject && <p className="font-semibold text-sm text-fg mb-1">{subject}</p>}
          <p className="text-sm text-fg whitespace-pre-wrap">{body}</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
        <button
          type="button"
          onClick={() => {
            setSubject("");
            setBody("");
          }}
          className="px-4 py-2 text-sm font-medium text-fg-muted hover:text-fg transition-colors"
        >
          Clear
        </button>
        <button
          type="submit"
          disabled={loading || !body.trim()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-strong text-white hover:bg-brand-strong-hover disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading && <SpinnerIcon className="animate-spin h-4 w-4" />}
          Send Broadcast
        </button>
      </div>
    </form>
  );
}
