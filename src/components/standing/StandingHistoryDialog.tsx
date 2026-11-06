"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { getJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { EVENT_TEXT, STANDING_TEXT, prettyDay, type StandingValue } from "./model";

type Entry = {
  id: string;
  action: string;
  scope: "BRANCH" | "SCHOOL";
  reason: string;
  startsOn: string;
  endsOn: string | null;
  decidedBy: string;
  at: string;
};
type Loaded = { standing: StandingValue; until: string | null; events: Entry[] };

/// Every change of one person's standing, newest first: what, when, who decided and why. Read only; the history cannot be edited (the database refuses it).
export function StandingHistoryDialog({ endpoint, name, onClose }: { endpoint: string | null; name: string; onClose: () => void }) {
  return (
    <Dialog open={endpoint !== null} onClose={onClose} title={`History of ${name}`}>
      {endpoint && <Body key={endpoint} endpoint={endpoint} onClose={onClose} />}
    </Dialog>
  );
}

function Body({ endpoint, onClose }: { endpoint: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getJson(endpoint, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(say(reply, "The history couldn't be loaded."));
      setLoaded(reply.data as unknown as Loaded);
    });
    return () => controller.abort();
  }, [endpoint]);

  return (
    <div className="space-y-4">
      {failed && <Alert variant="error">{failed}</Alert>}
      {!failed && !loaded && <p className="text-sm text-fg-muted">Loading…</p>}
      {loaded && (
        <>
          <p className="text-sm text-fg-2">
            Now: <span className="font-semibold text-fg">{STANDING_TEXT[loaded.standing]}</span>
            {loaded.standing === "SUSPENDED" && loaded.until ? ` until ${prettyDay(loaded.until)}` : ""}
          </p>
          {loaded.events.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-fg-muted">
              Nothing has been recorded for this person.
            </p>
          ) : (
            <ol className="max-h-80 space-y-3 overflow-y-auto">
              {loaded.events.map((event) => (
                <li key={event.id} className="rounded-xl border border-line p-3 text-sm">
                  <p className="font-semibold text-fg">
                    {EVENT_TEXT[event.action] ?? event.action}
                    {event.action === "SUSPENDED" && event.endsOn ? ` until ${prettyDay(event.endsOn)}` : ""}
                    {event.scope === "SCHOOL" ? " · everywhere in the school" : ""}
                  </p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-fg-2">{event.reason}</p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {prettyDay(event.startsOn)} · {event.decidedBy}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onClose} data-initial-focus>
          Close
        </Button>
      </div>
    </div>
  );
}
