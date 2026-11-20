"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TONE } from "@/components/ui/tone";
import { getJson, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/academics/common";
import { ScaleDialog, type Band, type Scale } from "@/components/academics/GradingPanel";
import type { TemplatesData } from "@/components/results/template-types";
import { UNCONFIRMED_NOTICE } from "@/lib/results/scale-confirmation";

// Grade scales on Results > Templates (task 0116): who grades on each scale, "Confirm these bands" for a scale whose cut-offs were a guess, and edit / duplicate / new, through the SAME editor as
// Academics > Assessment and grading (`ScaleDialog`), not a second one. Presentation only: the grade-scale APIs decide who may and keep the versioning rule (edited in place until a result has
// used the scale; after that a change is a new version, and marks already entered keep the letters they were given).

const SCALES = "/api/v1/academics/grade-scales";
const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function GradeScalesSection({
  branchId,
  data,
  onChanged,
  onNotice,
}: {
  branchId: string;
  data: TemplatesData;
  onChanged: () => Promise<void>;
  onNotice: (variant: "success" | "error", text: string) => void;
}) {
  const [scales, setScales] = useState<Scale[] | null>(null);
  const [bandTemplate, setBandTemplate] = useState<Band[]>([]);
  const [dialog, setDialog] = useState<{ item: Scale | null; seed: Scale | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const reply = await getJson(`${SCALES}?branchId=${encodeURIComponent(branchId)}`);
    if (!reply.ok) return onNotice("error", say(reply, "Couldn't load the grade scales."));
    setScales(reply.data!.scales as Scale[]);
    setBandTemplate((reply.data!.template as Band[]) ?? []);
  }, [branchId, onNotice]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on a branch change is exactly what this effect is for
    void load();
  }, [load, data]);

  const usedBy = (scaleId: string) => data.coverage.filter((c) => c.scale?.id === scaleId).map((c) => c.name);

  async function confirm(id: string, name: string) {
    setBusy(id);
    const reply = await sendJson(`${SCALES}/${encodeURIComponent(id)}/confirm`, "POST");
    setBusy(null);
    onNotice(
      reply.ok ? "success" : "error",
      reply.ok ? `${name} confirmed. Results graded on it can be published.` : say(reply, "That didn't work."),
    );
    await Promise.all([load(), onChanged()]);
  }

  return (
    <section aria-labelledby="scales-heading" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="scales-heading" className="text-lg font-semibold tracking-tight text-fg">
            Grade scales
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-fg-muted">
            A class grades on the scale you set for it above, else its template&apos;s, else the branch&apos;s default. Marks already
            entered keep the letters they were given; changing a scale that marks have used makes a new version for the marks entered after
            it.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setDialog({ item: null, seed: null })}>
          New scale
        </Button>
      </div>
      {scales === null ? (
        <p className="text-sm text-fg-muted" aria-busy="true">
          Loading…
        </p>
      ) : (
        <ul aria-label="Grade scales" className="space-y-3">
          {scales.map((s) => {
            const classes = usedBy(s.id);
            return (
              <li key={s.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold break-words text-fg">
                      {s.name} <span className="text-sm font-normal text-fg-muted">· version {s.version}</span>
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {s.isDefault && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE.brand.chip}`}>Branch default</span>
                      )}
                      {s.locked && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE.neutral.chip}`}>Marks use it</span>
                      )}
                      {s.unconfirmed && (
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE.warn.chip}`}>Unconfirmed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setDialog({ item: s, seed: null })}
                      aria-label={`${s.locked ? "New version of" : "Edit bands of"} ${s.name}`}
                    >
                      {s.locked ? "New version" : "Edit bands"}
                    </Button>
                    <Button variant="secondary" onClick={() => setDialog({ item: null, seed: s })} aria-label={`Duplicate ${s.name}`}>
                      Duplicate
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-fg-2">{s.bands.map((b) => `${b.letter} ${fmt(b.min)}–${fmt(b.max)}`).join(" · ")}</p>
                <p className="text-xs text-fg-muted">
                  {classes.length > 0 ? `Classes grading on it: ${classes.join(", ")}.` : "No class grades on it by itself."}
                </p>
                {s.unconfirmed && (
                  <Alert variant="warning">
                    <span className="block">{UNCONFIRMED_NOTICE}.</span>
                    <span className="mt-1 block text-xs">
                      Results graded on it cannot be published until it is confirmed. Check the bands, edit them if they are wrong, then
                      confirm.
                    </span>
                    <span className="mt-2 block">
                      <Button
                        variant="secondary"
                        loading={busy === s.id}
                        onClick={() => void confirm(s.id, s.name)}
                        aria-label={`Confirm the bands of ${s.name}`}
                      >
                        Confirm these bands
                      </Button>
                    </span>
                  </Alert>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {data.choices.earlierUnconfirmed.length > 0 && (
        <Alert variant="warning">
          <span className="block font-semibold">Earlier versions never confirmed</span>
          <span className="block text-xs">Marks graded on these cannot be published until their bands are confirmed.</span>
          <ul aria-label="Earlier versions never confirmed" className="mt-2 space-y-1">
            {data.choices.earlierUnconfirmed.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {e.name} (version {e.version})
                </span>
                <Button
                  variant="secondary"
                  loading={busy === e.id}
                  onClick={() => void confirm(e.id, `${e.name} (version ${e.version})`)}
                  aria-label={`Confirm the bands of ${e.name} version ${e.version}`}
                >
                  Confirm these bands
                </Button>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {dialog && (
        <ScaleDialog
          key={dialog.item?.id ?? dialog.seed?.id ?? "new"}
          item={dialog.item}
          seed={dialog.seed}
          usedBy={dialog.item ? usedBy(dialog.item.id) : []}
          open
          branchId={branchId}
          template={bandTemplate}
          onClose={() => setDialog(null)}
          onDone={async (text) => {
            setDialog(null);
            onNotice("success", text);
            await Promise.all([load(), onChanged()]);
          }}
        />
      )}
    </section>
  );
}
