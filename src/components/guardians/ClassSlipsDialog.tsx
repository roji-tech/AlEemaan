"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { GENERIC_ERROR, getJson, sendJson } from "@/components/auth/postJson";
import { SlipCard, SlipSheet, type AccessSlip, type SignIn } from "./AccessSlips";
import { armLabel, classLabel } from "@/lib/academics/class-label";

// "Print access slips" for a class (task 0113 D8; task 0094 3a: "Print access codes for this class"): choose the class (and an arm), what to make, see how many pupils it replaces, confirm,
// and print. New pupil codes for every pupil; a code for each pupil's main guardian who has none (one per guardian across the sheet, so brothers and sisters share it; one who already has a
// code keeps it). At most 100 pupils at a time. The codes are shown once.

type ClassOption = { id: string; name: string; arms: { id: string; name: string; isDefault?: boolean }[] };
type Which = "both" | "pupil" | "guardian";

export function ClassSlipsDialog({
  open,
  branchId,
  classes,
  onClose,
  onDone,
}: {
  open: boolean;
  branchId: string;
  classes: ClassOption[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [classGroupId, setClassGroupId] = useState("");
  const [classArmId, setClassArmId] = useState("");
  const [which, setWhich] = useState<Which>("both");
  const [count, setCount] = useState<{ count: number; tooMany: boolean; max: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ slips: AccessSlip[]; signIn: SignIn } | null>(null);
  const chosen = classes.find((c) => c.id === classGroupId);

  useEffect(() => {
    if (!open || !classGroupId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ branchId, classGroupId, ...(classArmId ? { classArmId } : {}) });
    void getJson(`/api/v1/students/access-codes?${params}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (reply.ok) {
        setCount(reply.data as { count: number; tooMany: boolean; max: number });
        setError(null);
      } else setError(reply.message ?? GENERIC_ERROR);
    });
    return () => controller.abort();
  }, [open, branchId, classGroupId, classArmId]);

  async function make() {
    if (!count || count.tooMany || count.count === 0) return;
    setBusy(true);
    const reply = await sendJson("/api/v1/students/access-codes", "POST", {
      branchId,
      classGroupId,
      ...(classArmId ? { classArmId } : {}),
      which,
      expect: count.count,
    });
    setBusy(false);
    if (!reply.ok) return setError(reply.message ?? GENERIC_ERROR);
    const data = reply.data as { slips: AccessSlip[]; signIn: SignIn };
    setResult(data);
    onDone(
      `Access slips were made for ${data.slips.length} ${data.slips.length === 1 ? "pupil" : "pupils"}. Print them now: the codes are shown only once.`,
    );
  }

  const className = chosen ? classLabel(chosen.name, classArmId ? chosen.arms.find((a) => a.id === classArmId) : null) : "";
  const whatText = which === "both" ? "pupil and guardian codes" : which === "pupil" ? "pupil codes" : "guardian codes";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Print access slips"
      description="New sign-in codes for a class, printed as slips to hand out."
      wide
    >
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {!result ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField
                label="Class"
                value={classGroupId}
                onChange={(e) => (setClassGroupId(e.target.value), setClassArmId(""), setCount(null))}
                options={[
                  { value: "", label: classes.length === 0 ? "No classes set up yet" : "Choose…" },
                  ...classes.map((c) => ({ value: c.id, label: c.name })),
                ]}
                disabled={classes.length === 0}
              />
              <SelectField
                label="Arm"
                value={classArmId}
                onChange={(e) => (setClassArmId(e.target.value), setCount(null))}
                options={[
                  { value: "", label: "Every arm" },
                  ...(chosen?.arms ?? []).map((a) => ({ value: a.id, label: armLabel(a) || "Whole class" })),
                ]}
                disabled={!chosen || chosen.arms.length < 2}
              />
              <SelectField
                label="Codes to make"
                value={which}
                onChange={(e) => setWhich(e.target.value as Which)}
                options={[
                  { value: "both", label: "Pupil and guardian" },
                  { value: "pupil", label: "Pupil codes only" },
                  { value: "guardian", label: "Guardian codes only" },
                ]}
              />
            </div>
            {count && (
              <p className="text-sm text-fg" aria-live="polite">
                {count.tooMany
                  ? `More than ${count.max} pupils: choose one arm at a time.`
                  : count.count === 0
                    ? "No pupils in this class yet."
                    : `${count.count} ${count.count === 1 ? "pupil" : "pupils"} in ${className}. ${
                        which !== "guardian" ? "Every pupil gets a new pupil code; any pupil code made before stops working. " : ""
                      }${which !== "pupil" ? "A guardian who already has a code keeps it." : ""}`}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={() => void make()} loading={busy} disabled={!count || count.tooMany || count.count === 0}>
                {count && !count.tooMany && count.count > 0 ? `Make ${whatText} for ${count.count}` : "Make codes"}
              </Button>
            </div>
          </>
        ) : (
          <section aria-labelledby="class-slips" className="space-y-3">
            <h3 id="class-slips" className="text-sm font-semibold text-fg">
              Slips for {className} (shown once)
            </h3>
            <Alert variant="info">Print them now: the codes are not kept, and closing this shows them no more.</Alert>
            <Button onClick={() => window.print()}>Print the slips</Button>
            <ul aria-label="Access slips" className="space-y-3">
              {result.slips.map((slip) => (
                <SlipCard key={slip.studentId} slip={slip} signIn={result.signIn} />
              ))}
            </ul>
            <SlipSheet>
              {result.slips.map((slip) => (
                <SlipCard key={slip.studentId} slip={slip} signIn={result.signIn} />
              ))}
            </SlipSheet>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}
