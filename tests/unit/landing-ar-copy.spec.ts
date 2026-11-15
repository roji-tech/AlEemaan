import "../support/env";
import { test, expect } from "@playwright/test";
import { brand } from "@/lib/brand";
import { labelsAr, landingAr, nameAr } from "@/lib/landing-ar";

// The words of the Arabic landing page (task 0050). It says what the English page says (task 0049) and nothing more, in the same shape: the same four branches, the same four kinds of people, the
// same link. Held here: the shape matches the English page, the words are Arabic and carry no figure and no offer the product does not make, sentences end with a full stop, and the title and the
// description are of a length a tab and a search result can show. (Whether the Arabic is good Arabic is for a reader of Arabic: the file says so at its top.)

const english = brand.landing;
const everyText = (): string[] => [
  landingAr.eyebrow,
  landingAr.headline,
  landingAr.lead,
  landingAr.coversHeading,
  ...landingAr.covers.flatMap((c) => [c.title, c.text]),
  landingAr.peopleHeading,
  ...landingAr.people.flatMap((p) => [p.who, p.text]),
  landingAr.about.programsHeading,
  ...landingAr.about.programs.flatMap((x) => [x.title, x.text]),
  landingAr.about.valuesHeading,
  ...landingAr.about.values.flatMap((x) => [x.title, x.text]),
  landingAr.about.contactHeading,
  landingAr.about.contactText,
  ...Object.values(landingAr.about.contactLabels),
  landingAr.closingHeading,
  landingAr.closingText,
];
const ARABIC = /[\u0600-\u06FF]/;
const ASCII_LETTER = /[A-Za-z]/;
const DIGIT = /[0-9\u0660-\u0669\u06F0-\u06F9]/;

test.describe("the same page as the English one", () => {
  test("the same number of branches and of kinds of people, the same links, and no 'how it is run' section", () => {
    expect(landingAr.covers).toHaveLength(english.covers.length);
    expect(landingAr.people).toHaveLength(english.people.length);
    // the school's own sections (task 0070) have the English page's shape
    expect(landingAr.about.programs).toHaveLength(english.about.programs.length);
    expect(landingAr.about.values).toHaveLength(english.about.values.length);
    expect(Object.keys(landingAr.about.contactLabels).sort()).toEqual(Object.keys(english.about.contactLabels).sort());
    expect(new Set(landingAr.about.programs.map((x) => x.title)).size).toBe(landingAr.about.programs.length);
    expect(new Set(landingAr.about.values.map((x) => x.title)).size).toBe(landingAr.about.values.length);
    expect(landingAr.links.map((l) => l.href)).toEqual(english.links.map((l) => l.href));
    expect("howRun" in landingAr).toBe(false);
  });

  test("every branch card and every kind of person is said once, and none of the cards has an icon", () => {
    expect(new Set(landingAr.covers.map((c) => c.title)).size).toBe(landingAr.covers.length);
    expect(new Set(landingAr.people.map((p) => p.who)).size).toBe(landingAr.people.length);
    for (const card of landingAr.covers) expect("icon" in card, card.title).toBe(false);
  });

  test("the four branch names say secondary and primary, English and Arabic, in the school's order", () => {
    const names = landingAr.covers.map((c) => c.title);
    expect(names.map((n) => n.includes("الثانوية"))).toEqual([true, false, true, false]);
    expect(names.map((n) => n.includes("الابتدائية"))).toEqual([false, true, false, true]);
    expect(names.map((n) => n.includes("الإنجليزية"))).toEqual([true, true, false, false]);
    expect(names.map((n) => n.includes("العربية"))).toEqual([false, false, true, true]);
  });
});

test.describe("what the words may be", () => {
  test("they are Arabic: every text has Arabic letters and none has a Latin letter", () => {
    for (const text of [landingAr.title, landingAr.description, nameAr, ...everyText(), ...landingAr.links.map((l) => l.label)]) {
      expect(text, text).toMatch(ARABIC);
      expect(text, text).not.toMatch(ASCII_LETTER);
    }
  });

  test("no figure anywhere in the words, Western or Arabic-Indic (a number on a landing page is a claim that goes stale)", () => {
    for (const text of [landingAr.title, landingAr.description, ...everyText()]) expect(text, text).not.toMatch(DIGIT);
  });

  test("the page offers no registration, price or trial: none exists", () => {
    const text = [landingAr.title, landingAr.description, ...everyText(), ...landingAr.links.map((l) => l.label)].join(" ");
    for (const word of ["تسجيل جديد", "إنشاء حساب", "اشتراك", "مجاني", "مجانا", "سعر", "أسعار", "تجربة", "عرض خاص", "خصم"])
      expect(text, `the copy must not say "${word}"`).not.toContain(word);
  });

  test("every text is trimmed, not empty, with no doubled space and no placeholder", () => {
    for (const text of [
      landingAr.title,
      landingAr.description,
      nameAr,
      ...everyText(),
      ...Object.values(labelsAr.theme),
      labelsAr.signIn,
      labelsAr.footerNav,
    ]) {
      expect(text, text).toBe(text.trim());
      expect(text.length, `"${text}" is empty`).toBeGreaterThan(2);
      expect(text, text).not.toMatch(/ {2}|lorem|todo|tbd|xxx/i);
    }
  });

  test("a sentence ends with a full stop: the lead, the closing words, each branch's line and each person's line", () => {
    for (const text of [
      landingAr.lead,
      landingAr.closingText,
      landingAr.about.contactText,
      ...landingAr.covers.map((c) => c.text),
      ...landingAr.people.map((p) => p.text),
      ...landingAr.about.programs.map((x) => x.text),
      ...landingAr.about.values.map((x) => x.text),
    ])
      expect(text, text).toMatch(/[.]$/);
  });

  test("the title names the school and the town; the description is one sentence short enough for a search result", () => {
    expect(landingAr.title).toContain(nameAr);
    expect(landingAr.title).toContain("إبادان");
    expect(landingAr.title.length).toBeLessThanOrEqual(60);
    expect(landingAr.description.length).toBeLessThanOrEqual(160);
    expect(landingAr.description).toContain("إبادان");
    expect(landingAr.description.split(/[.!?؟](\s|$)/).filter((s) => s.trim().length > 1)).toHaveLength(1);
  });

  test("the extra links are paths on this site, never /login, with a name that says where they go", () => {
    for (const link of landingAr.links) {
      expect(link.href, link.label).toMatch(/^\/[a-z0-9/_-]*$/);
      expect(link.href, link.label).not.toBe("/login");
      expect(link.label.length, link.label).toBeGreaterThan(5);
    }
  });
});

test.describe("the words the component writes itself", () => {
  test("sign in, the footer's name, the rights line and the theme button, each in Arabic", () => {
    expect(labelsAr.signIn).toBe("تسجيل الدخول");
    expect(labelsAr.footerNav).toMatch(ARABIC);
    expect(labelsAr.rights(2030, nameAr)).toBe("© 2030 الإيمان. جميع الحقوق محفوظة.");
    expect(labelsAr.theme.toLight).not.toBe(labelsAr.theme.toDark);
    for (const text of [labelsAr.signIn, labelsAr.footerNav, ...Object.values(labelsAr.theme)]) {
      expect(text, text).toMatch(ARABIC);
      expect(text, text).not.toMatch(ASCII_LETTER);
    }
  });
});
