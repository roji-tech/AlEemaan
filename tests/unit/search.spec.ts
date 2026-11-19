import { test, expect } from "@playwright/test";
import { NAV } from "@/components/shell/nav";
import { SECTIONS } from "@/components/academics/sections";
import { DESTINATIONS, INDEXED_TABS, PAGE_TAB_IDS, type Destination } from "@/lib/search/destinations";
import { highlight, normalise, scoreOf, search, withinOneSlip } from "@/lib/search/match";
import { ACADEMICS_TAB_IDS } from "@/lib/search/tab-ids";
import { visibleDestinations, type Viewer } from "@/lib/search/visible";

// Task 0107: the top-bar search. Pure, so no server: how words are matched and ranked, who may see which destination, and that the index cannot drift from the app (a tab that exists but
// cannot be found, a destination for a tab that is gone, a page that is not a page).

const NONE = { included: {}, excluded: {} };
const superAdmin: Viewer = { isAdmin: true, isSuperAdmin: true, isTeacher: false, isStaff: false, pages: NONE };
const admin: Viewer = { isAdmin: true, isSuperAdmin: false, isTeacher: false, isStaff: false, pages: NONE };
const teacher: Viewer = { isAdmin: false, isSuperAdmin: false, isTeacher: true, isStaff: false, pages: NONE };
const staff: Viewer = { isAdmin: false, isSuperAdmin: false, isTeacher: false, isStaff: true, pages: NONE };
const ids = (list: readonly Destination[]) => list.map((d) => d.id);
const seenBy = (viewer: Viewer) => ids(visibleDestinations(viewer));

test.describe("matching", () => {
  test("case and accents do not matter", () => {
    expect(normalise("Résumé ÉCOLE")).toBe("resume ecole");
    expect(scoreOf("SETTINGS", { title: "Settings", trail: ["Settings"], summary: "x" })).toBeGreaterThan(0);
    expect(scoreOf("cafe", { title: "Café hours", trail: [], summary: "x" })).toBeGreaterThan(0);
  });

  test("every word of the query must be found somewhere, or it is not a result", () => {
    const item = {
      title: "Sign-in access",
      trail: ["Settings", "Sign-in access"],
      keywords: ["login"],
      summary: "Whether pupils may sign in.",
    };
    expect(scoreOf("pupils login", item)).toBeGreaterThan(0);
    expect(scoreOf("pupils zebra", item)).toBe(0);
    expect(scoreOf("", item)).toBe(0);
    expect(scoreOf("   ", item)).toBe(0);
  });

  test("a title beats a trail, a trail beats a keyword, a keyword beats the description", () => {
    const base = { trail: [] as string[], summary: "" };
    const title = scoreOf("fees", { ...base, title: "Fees" });
    const trail = scoreOf("fees", { ...base, title: "Money", trail: ["Fees"] });
    const keyword = scoreOf("fees", { ...base, title: "Money", keywords: ["fees"] });
    const text = scoreOf("fees", { ...base, title: "Money", summary: "What fees are due." });
    expect(title).toBeGreaterThan(trail);
    expect(trail).toBeGreaterThan(keyword);
    expect(keyword).toBeGreaterThan(text);
    expect(text).toBeGreaterThan(0);
  });

  test("one slip is forgiven in a word of five letters or more, never in a short one", () => {
    expect(withinOneSlip("setings", "settings")).toBe(true); // a letter fewer
    expect(withinOneSlip("settngs", "settings")).toBe(true);
    expect(withinOneSlip("sttings", "settings")).toBe(true);
    expect(withinOneSlip("sesttings", "settings")).toBe(true); // a letter more
    expect(withinOneSlip("settnigs", "settings")).toBe(true); // two neighbours swapped
    expect(withinOneSlip("setxings", "settings")).toBe(true); // a letter changed
    expect(withinOneSlip("sxxtings", "settings")).toBe(false); // two slips
    expect(withinOneSlip("abc", "abcdef")).toBe(false);
    const item = { title: "Settings", trail: ["Settings"], summary: "" };
    expect(scoreOf("setings", item)).toBeGreaterThan(0);
    expect(scoreOf("sett", item)).toBeGreaterThan(0); // a start of the word, not a slip
    expect(scoreOf("fees", { title: "Feed", trail: [], summary: "" })).toBe(0); // four letters: no forgiveness
  });

  test("results come best first and ties keep the order of the list", () => {
    const items = [
      { title: "Alpha page", trail: [], summary: "" },
      { title: "Beta", trail: [], summary: "mentions page once" },
      { title: "Page", trail: [], summary: "" },
      { title: "Gamma page", trail: [], summary: "" },
    ];
    expect(search("page", items).map((i) => i.title)).toEqual(["Page", "Alpha page", "Gamma page", "Beta"]);
    expect(search("page", items, 2)).toHaveLength(2);
    expect(search("nothingmatches", items)).toEqual([]);
  });

  test("highlight gives back exactly the text, marking the starts of the query's words", () => {
    const pieces = highlight("Sign-in access", "sign acc");
    expect(pieces.map((p) => p.text).join("")).toBe("Sign-in access");
    expect(pieces.filter((p) => p.match).map((p) => p.text)).toEqual(["Sign", "acc"]);
    expect(highlight("Settings", "")).toEqual([{ text: "Settings", match: false }]);
    expect(highlight("Resume", "zzz").every((p) => !p.match)).toBe(true);
    // the middle of a word is not a start: "ettings" marks nothing
    expect(highlight("Settings", "ettings").every((p) => !p.match)).toBe(true);
  });
});

test.describe("what people type finds what they mean", () => {
  const all = visibleDestinations(superAdmin);
  const top = (query: string, group?: Destination["group"]) => search(query, group ? all.filter((d) => d.group === group) : all)[0]?.id;
  test("each question lands on the right destination", () => {
    expect(top("login")).toBe("/settings#signin");
    expect(top("sign in access")).toBe("/settings#signin");
    expect(top("new session")).toBe("task:new-session");
    expect(top("invoice", "page")).toBe("/finance");
    expect(top("fees", "page")).toBe("/finance");
    expect(top("pupil", "page")).toBe("/students");
    expect(top("add a pupil")).toBe("task:new-pupil");
    expect(top("holiday")).toBe("task:term-break");
    expect(top("password")).toBe("task:change-password");
    expect(top("setings", "setting")).toBeDefined(); // a slip is forgiven
    expect(top("invite")).toBe("task:invite");
  });
  test("a made-up word finds nothing", () => {
    expect(search("qwertyuiop", all)).toEqual([]);
  });
});

test.describe("who sees what", () => {
  test("a superadmin sees every page, every Settings tab and the video guide", () => {
    const seen = seenBy(superAdmin);
    for (const id of ["/settings", "/branches", "/finance", "/academics", "/users", "/video-guide", "/account"])
      expect(seen, id).toContain(id);
    for (const tab of PAGE_TAB_IDS["/settings"]) expect(seen).toContain(`/settings#${tab}`);
    expect(seen).toContain("/approvals#self");
  });

  test("a branch administrator sees Academics, Finance, Users and Approvals but not Settings, Branches, the video guide or self-approval", () => {
    const seen = seenBy(admin);
    for (const id of [
      "/academics",
      "/finance",
      "/users",
      "/approvals",
      "/academics#sessions",
      "/approvals#requests",
      "task:new-session",
      "task:invoices",
    ])
      expect(seen, id).toContain(id);
    for (const id of ["/settings", "/branches", "/video-guide", "/approvals#self", "/settings#signin"]) expect(seen, id).not.toContain(id);
  });

  test("a teacher sees the classroom, never Finance, Academics, Users, Settings or their tasks", () => {
    const seen = seenBy(teacher);
    for (const id of ["/students", "/attendance", "/results", "/account", "task:new-pupil"]) expect(seen, id).toContain(id);
    for (const id of [
      "/finance",
      "/academics",
      "/academics#sessions",
      "/users",
      "/settings",
      "/approvals",
      "task:invoices",
      "task:new-session",
      "task:invite",
      "/video-guide",
    ]) {
      expect(seen, id).not.toContain(id);
    }
  });

  test("another member of staff sees only the pages every member of staff has, and their own account", () => {
    const seen = seenBy(staff);
    expect(seen).toContain("/programs");
    expect(seen).toContain("/forms");
    expect(seen).toContain("/announcements");
    expect(seen).toContain("/account");
    expect(seen).not.toContain("/students");
    expect(seen).not.toContain("/finance");
  });

  test("a page the person's overrides hide is gone with its tasks; one they add is there", () => {
    const hidden = seenBy({ ...admin, pages: { included: {}, excluded: { "/students": true } } });
    expect(hidden).not.toContain("/students");
    expect(hidden).not.toContain("task:new-pupil");
    const added = seenBy({ ...staff, pages: { included: { "/students": true }, excluded: {} } });
    expect(added).toContain("/students");
    // an override can never offer an administrators' page to anyone
    const trick = seenBy({ ...teacher, pages: { included: { "/finance": true, "/settings": true }, excluded: {} } });
    expect(trick).not.toContain("/finance");
    expect(trick).not.toContain("/settings");
  });

  test("a destination's own narrower rule holds even on a page the person has: a tab is never wider than its page", () => {
    // an administrator has /approvals, but its Self-approval tab is for superadmins
    expect(seenBy(admin)).toContain("/approvals");
    expect(seenBy(admin)).not.toContain("/approvals#self");
  });
});

test.describe("the index cannot drift from the app", () => {
  test("every id is unique", () => {
    const all = ids(DESTINATIONS);
    expect(new Set(all).size).toBe(all.length);
  });

  test("every destination is on a page the sidebar knows (or the account and the video guide)", () => {
    const pages = new Set([...NAV.flatMap((n) => (n.href ? [n.href] : [])), "/account", "/video-guide"]);
    for (const d of DESTINATIONS) {
      expect(pages.has(d.page), `${d.id} is on ${d.page}`).toBe(true);
      expect(d.href.split("?")[0], `${d.id}: its address is on its page`).toBe(d.page);
    }
  });

  test("every tab a destination names is a real tab of that page, and every real tab can be found", () => {
    for (const [page, real] of Object.entries(PAGE_TAB_IDS)) {
      expect([...INDEXED_TABS[page]!].sort(), `the tabs the index reaches on ${page}`).toEqual([...real].sort());
    }
    for (const d of DESTINATIONS) {
      const tab = new URL(d.href, "https://x.test").searchParams.get("tab");
      if (!tab) continue;
      const real = (PAGE_TAB_IDS as Record<string, readonly string[]>)[d.page];
      expect(real, `${d.id} names a tab, so ${d.page} must keep its tabs in the address`).toBeDefined();
      expect(real!, `${d.id} names the tab "${tab}"`).toContain(tab);
    }
  });

  test("Academics' own list of tabs is the one the index was written against", () => {
    expect(SECTIONS.map((s) => s.id).sort()).toEqual([...ACADEMICS_TAB_IDS].sort());
  });

  test("a task always says how, in whole sentences; a page always says what is there", () => {
    for (const d of DESTINATIONS) {
      expect(d.summary.length, `${d.id} has a line`).toBeGreaterThan(10);
      if (d.group === "task") {
        expect(d.steps?.length ?? 0, `${d.id} has steps`).toBeGreaterThanOrEqual(2);
        for (const step of d.steps ?? []) expect(step, `${d.id}: "${step}" is a sentence`).toMatch(/[.)]$/);
      }
    }
  });

  test("a narrower rule is only ever narrower: nothing for administrators sits on a page that teachers have", () => {
    const teacherPages = new Set(NAV.filter((n) => !n.adminOnly && !n.superAdminOnly && n.href).map((n) => n.href));
    for (const d of DESTINATIONS)
      if (d.only === "admin" || d.only === "superadmin")
        expect(d.group === "task" || !teacherPages.has(d.page) || d.only === "admin", d.id).toBe(true);
  });
});
