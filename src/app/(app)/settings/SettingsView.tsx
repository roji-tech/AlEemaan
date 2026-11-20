"use client";

import { useState } from "react";
import { Tabs, panelId, tabId } from "@/components/ui/Tabs";
import { useTabParam } from "@/components/ui/useTabParam";
import { SETTINGS_TAB_IDS } from "@/lib/search/tab-ids";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Dialog } from "@/components/ui/Dialog";
import { sendJson } from "@/components/auth/postJson";
import { SpinnerIcon } from "@/components/ui/icons";
import { PortalAccessPanel } from "@/components/settings/PortalAccessPanel";
import { ProgramsSettingsPanel } from "@/components/programs/ProgramsSettingsPanel";
import { StandingSettingsPanel } from "@/components/standing/StandingSettingsPanel";
import { ResultsApprovalPanel } from "@/components/settings/ResultsApprovalPanel";
import { LoginSwitchPanel } from "@/components/settings/LoginSwitchPanel";
import { BranchProfileEditor } from "@/components/settings/BranchProfilePanel";
import { FamilySecretsPanel } from "@/components/settings/FamilySecretsPanel";
import type { BranchLoginRow } from "@/lib/auth/login-switch-rules";

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
  /// Whether the signed-in superadmin has two-step verification on (what the confirmation dialog asks for).
  hasMfa: boolean;
  /// Every branch with its student and parent sign-in switches, as the database says now (task 0091). Settings is a superadmin's page, so all of them, with the bulk controls.
  loginBranches: BranchLoginRow[];
};

/// The sections of the Settings page, in the shared tab strip (task 0100): labels never wrap, the strip scrolls sideways when they do not fit, and the open one is `?tab=`.
const SETTINGS_TABS: readonly { id: (typeof SETTINGS_TAB_IDS)[number]; label: string }[] = [
  { id: "profile", label: "School Profile" },
  { id: "academics", label: "Academic Sessions & Terms" },
  { id: "portal", label: "Portal access" },
  { id: "approval", label: "Results approval" },
  { id: "programs", label: "Programs" },
  { id: "discipline", label: "Discipline" },
  { id: "signin", label: "Sign-in access" },
] as const;

export function SettingsView({ initialSettings, branches, initialSessions, hasMfa, loginBranches }: Props) {
  const [activeTab, setActiveTab] = useTabParam(SETTINGS_TAB_IDS, "profile");

  // Profile Form State. `profileScope` is "school" (the school-wide form, as it always was) or a branch id (that branch's own details, task 0115).
  const [profileScope, setProfileScope] = useState<string>("school");
  const profileBranch = branches.find((b) => b.id === profileScope) ?? null;
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
      // The create call answers with the session row (ISO timestamps, the branch nested as `branch`); the list is drawn from the page's own shape (`branchName`, `yyyy-mm-dd`), so the
      // new card is made into that shape here: raw, it showed an empty branch badge and "2026-09-07T00:00:00.000Z" until the page was reloaded.
      const created = res.data?.session as unknown as (Omit<SessionItem, "branchName"> & { branch?: { name: string } }) | undefined;
      if (created) {
        const { branch, ...rest } = created;
        const branchName = branch?.name ?? branches.find((b) => b.id === created.branchId)?.name ?? "";
        setSessions([{ ...rest, branchName, startDate: rest.startDate.slice(0, 10), endDate: rest.endDate.slice(0, 10) }, ...sessions]);
      }
      setIsNewSessionOpen(false);
      setNewLabel("");
      setNewStartDate("");
      setNewEndDate("");
    } else {
      setSessionError(res.message || "Failed to create academic session.");
    }
  };

  // Which term is being made current right now: its button shows it, and no second change starts until this one is answered.
  const [settingPeriod, setSettingPeriod] = useState<string | null>(null);
  const [termProblem, setTermProblem] = useState<string | null>(null);
  const handleSetCurrentPeriod = async (branchId: string, periodId: string) => {
    if (settingPeriod) return;
    setSettingPeriod(periodId);
    setTermProblem(null);
    const res = await sendJson(`/api/v1/academics/periods/${periodId}`, "PATCH", {
      branchId,
      isCurrent: true,
    });

    setSettingPeriod(null);
    if (!res.ok) setTermProblem(res.message || "Couldn't set the current term. Please try again.");
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

      <Tabs label="Settings sections" prefix="settings" tabs={SETTINGS_TABS} active={activeTab} onChange={setActiveTab} className="mt-0" />
      <div role="tabpanel" id={panelId("settings", activeTab)} aria-labelledby={tabId("settings", activeTab)} className="space-y-6">
        {/* Tab 3: what a pupil and a guardian may do in the portal */}
        {activeTab === "portal" && <PortalAccessPanel branches={branches} />}

        {/* Tab 5: the programs switch (task 0043) */}
        {activeTab === "programs" && <ProgramsSettingsPanel />}

        {/* Tab 6: may branch administrators suspend (task 0045) */}
        {activeTab === "discipline" && <StandingSettingsPanel />}

        {/* Tab 7: may students and parents sign in (task 0091) */}
        {activeTab === "signin" && (
          <div className="space-y-6">
            <LoginSwitchPanel initial={loginBranches} canBulk />
            <FamilySecretsPanel />
          </div>
        )}

        {/* Tab 4: who approves results, and where (task 0039) */}
        {activeTab === "approval" && <ResultsApprovalPanel branches={branches} hasMfa={hasMfa} />}

        {/* Tab 1: Profile */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="max-w-xs">
              <SelectField
                label="Edit details for"
                value={profileBranch ? profileBranch.id : "school"}
                onChange={(e) => setProfileScope(e.target.value)}
                options={[{ value: "school", label: "School-wide" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
              />
            </div>
            {profileBranch ? (
              <Card className="max-w-3xl space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-fg">Details for {profileBranch.name}</h2>
                  <p className="mt-1 text-sm text-fg-muted">
                    What {profileBranch.name} prints on its report cards. A field left empty uses the school-wide value; the school&apos;s
                    name is always the school&apos;s.
                  </p>
                </div>
                <BranchProfileEditor key={profileBranch.id} branchId={profileBranch.id} branchName={profileBranch.name} />
              </Card>
            ) : (
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
                      info="settings.principal"
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
                    info="settings.motto"
                    value={settings.motto}
                    onChange={(e) => setSettings({ ...settings, motto: e.target.value })}
                  />
                  <TextField
                    label="Address"
                    value={settings.address}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  />
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
          </div>
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

            {termProblem && <Alert variant="error">{termProblem}</Alert>}
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
                              disabled={settingPeriod !== null}
                              aria-busy={settingPeriod === period.id}
                              className="inline-flex min-h-6 items-center gap-1.5 text-xs font-semibold text-brand-fg hover:underline disabled:opacity-60"
                            >
                              {settingPeriod === period.id && <SpinnerIcon className="h-3.5 w-3.5 motion-safe:animate-spin" />}
                              {settingPeriod === period.id ? "Setting…" : "Set Current"}
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
      </div>

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
            info="sessions.label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="2026/2027"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Session Start Date"
              info="sessions.dates"
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
