"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Dialog } from "@/components/ui/Dialog";
import { sendJson } from "@/components/auth/postJson";

type SchoolSettingsState = {
  name: string;
  principal: string;
  phone: string;
  motto: string;
  address: string;
  email: string;
  website: string;
};

type PeriodItem = {
  id: string;
  label: string;
  ordinal: number;
  isCurrent: boolean;
};

type SessionItem = {
  id: string;
  branchId: string;
  branchName: string;
  label: string;
  startDate: string;
  endDate: string;
  status: string;
  periods: PeriodItem[];
};

type Props = {
  initialSettings: SchoolSettingsState;
  branches: { id: string; name: string }[];
  initialSessions: SessionItem[];
};

export function SettingsView({ initialSettings, branches, initialSessions }: Props) {
  const [activeTab, setActiveTab] = useState<"profile" | "academics">("profile");

  // Profile Form State
  const [settings, setSettings] = useState<SchoolSettingsState>(initialSettings);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Sessions State
  const [sessions, setSessions] = useState<SessionItem[]>(initialSessions);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [isNewSessionOpen, setIsNewSessionOpen] = useState(false);
  const [newBranchId, setNewBranchId] = useState(branches[0]?.id || "");
  const [newLabel, setNewLabel] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);

    const res = await sendJson("/api/v1/settings/school", "PATCH", settings);
    setSavingProfile(false);

    if (res.ok) {
      setProfileMsg({ kind: "success", text: "School profile updated successfully." });
    } else {
      setProfileMsg({ kind: "error", text: res.message || "Failed to update school profile." });
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingSession(true);
    setSessionError(null);

    const res = await sendJson("/api/v1/academics/sessions", "POST", {
      branchId: newBranchId,
      label: newLabel,
      startDate: newStartDate,
      endDate: newEndDate,
    });
    setCreatingSession(false);

    if (res.ok) {
      const created = res.data?.session as unknown as SessionItem;
      if (created) {
        setSessions([created, ...sessions]);
      }
      setIsNewSessionOpen(false);
      setNewLabel("");
      setNewStartDate("");
      setNewEndDate("");
    } else {
      setSessionError(res.message || "Failed to create academic session.");
    }
  };

  const handleSetCurrentPeriod = async (branchId: string, periodId: string) => {
    const res = await sendJson(`/api/v1/academics/periods/${periodId}`, "PATCH", {
      branchId,
      isCurrent: true,
    });

    if (res.ok) {
      // Refresh local sessions state
      setSessions((prev) =>
        prev.map((s) => {
          if (s.branchId !== branchId) return s;
          return {
            ...s,
            periods: s.periods.map((p) => ({
              ...p,
              isCurrent: p.id === periodId,
            })),
          };
        }),
      );
    }
  };

  const filteredSessions = selectedBranchId === "all" ? sessions : sessions.filter((s) => s.branchId === selectedBranchId);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure institution profile, contact details, and branch academic sessions." />

      {/* Tabs */}
      <div className="flex border-b border-line">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "profile" ? "border-brand-primary text-brand-primary" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          School Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("academics")}
          className={`border-b-2 px-5 py-3 text-sm font-semibold transition-colors ${
            activeTab === "academics" ? "border-brand-primary text-brand-primary" : "border-transparent text-fg-muted hover:text-fg"
          }`}
        >
          Academic Sessions & Terms
        </button>
      </div>

      {/* Tab 1: Profile */}
      {activeTab === "profile" && (
        <Card className="max-w-3xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-fg">School Information</h2>
            <p className="mt-1 text-sm text-fg-muted">
              These details appear on report cards, transcripts, invoices, and official communications.
            </p>
          </div>

          {profileMsg && <Alert variant={profileMsg.kind === "success" ? "success" : "error"}>{profileMsg.text}</Alert>}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <TextField
              label="School Name"
              value={settings.name}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
              required
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Principal / Head of School"
                value={settings.principal}
                onChange={(e) => setSettings({ ...settings, principal: e.target.value })}
              />
              <TextField
                label="Phone Number"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              />
            </div>
            <TextField
              label="Motto / Slogan"
              value={settings.motto}
              onChange={(e) => setSettings({ ...settings, motto: e.target.value })}
            />
            <TextField label="Address" value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Official Email"
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              />
              <TextField
                label="Website URL"
                type="url"
                value={settings.website}
                onChange={(e) => setSettings({ ...settings, website: e.target.value })}
              />
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Saving Changes..." : "Save Profile"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab 2: Academic Sessions */}
      {activeTab === "academics" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-64">
              <SelectField
                label="Filter by Branch"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                options={[{ value: "all", label: "All Branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
              />
            </div>
            <Button onClick={() => setIsNewSessionOpen(true)}>New Academic Session</Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {filteredSessions.map((session) => (
              <Card key={session.id} className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block rounded-full bg-field px-2.5 py-0.5 text-xs font-semibold text-fg-muted">
                      {session.branchName}
                    </span>
                    <h3 className="mt-2 text-lg font-bold text-fg">{session.label}</h3>
                    <p className="text-xs text-fg-muted">
                      {session.startDate} &rarr; {session.endDate}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      session.status === "ACTIVE" ? "bg-brand-primary/10 text-brand-primary" : "bg-field text-fg-muted"
                    }`}
                  >
                    {session.status}
                  </span>
                </div>

                <div className="border-t border-line pt-3">
                  <p className="mb-2 text-xs font-bold tracking-wide text-fg-2 uppercase">Terms & Calendars</p>
                  <div className="space-y-2">
                    {session.periods.map((period) => (
                      <div key={period.id} className="flex items-center justify-between rounded-lg bg-field p-2.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg">{period.label}</span>
                          {period.isCurrent && (
                            <span className="rounded bg-brand-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-primary">
                              CURRENT TERM
                            </span>
                          )}
                        </div>
                        {!period.isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleSetCurrentPeriod(session.branchId, period.id)}
                            className="text-xs font-semibold text-brand-fg hover:underline"
                          >
                            Set Current
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ))}

            {filteredSessions.length === 0 && (
              <Card className="col-span-2 py-10 text-center text-fg-muted">No academic sessions configured for this branch.</Card>
            )}
          </div>
        </div>
      )}

      {/* New Session Dialog */}
      <Dialog
        open={isNewSessionOpen}
        onClose={() => setIsNewSessionOpen(false)}
        title="Create Academic Session"
        description="Initialize an academic year for a specific branch. Terms will be configured automatically (3 terms for English branches, 2 terms for Arabic branches)."
      >
        {sessionError && (
          <div className="mb-4">
            <Alert variant="error">{sessionError}</Alert>
          </div>
        )}

        <form onSubmit={handleCreateSession} className="space-y-4">
          <SelectField
            label="Branch"
            value={newBranchId}
            onChange={(e) => setNewBranchId(e.target.value)}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            required
          />
          <TextField
            label="Session Label (e.g. 2026/2027)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="2026/2027"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Session Start Date"
              type="date"
              value={newStartDate}
              onChange={(e) => setNewStartDate(e.target.value)}
              required
            />
            <TextField label="Session End Date" type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} required />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" variant="secondary" onClick={() => setIsNewSessionOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creatingSession}>
              {creatingSession ? "Creating..." : "Create Session"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
