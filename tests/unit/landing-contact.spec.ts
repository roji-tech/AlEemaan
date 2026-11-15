import "../support/env";
import { test, expect } from "@playwright/test";
import { eyebrowWithMotto, mailtoHref, telHref, toPublicContact, websiteHref } from "@/lib/landing/contact";

// What the landing pages make of the school profile (task 0070): which fields are shown, and which values may become links. A profile value is typed by a person in Settings and shown to the
// public, so a value is a link only when it is safe as an `href`.

const row = { motto: null, phone: null, email: null, address: null, website: null };

test.describe("which fields of the profile the page shows", () => {
  test("a missing profile, or one with nothing typed, shows nothing", () => {
    expect(toPublicContact(null)).toEqual({});
    expect(toPublicContact(row)).toEqual({});
    expect(toPublicContact({ ...row, motto: "   ", phone: "", address: "\n" })).toEqual({});
  });

  test("each field is trimmed, an empty one is left out, and nothing but the five public fields is ever read", () => {
    const shown = toPublicContact({
      motto: "  Second To None ",
      phone: " +234 815 300 5393",
      email: "office@school.example ",
      address: null,
      website: "",
    });
    expect(shown).toEqual({ motto: "Second To None", phone: "+234 815 300 5393", email: "office@school.example" });
    // a row that carries more (the principal's name, say) is not passed on
    const wideRow = { ...row, motto: "Motto", principal: "Someone", name: "School" };
    const wide = toPublicContact(wideRow);
    expect(Object.keys(wide)).toEqual(["motto"]);
  });
});

test.describe("which values may be links", () => {
  test("an e-mail address becomes a mailto link, anything that is not one stays text", () => {
    expect(mailtoHref("office@school.example")).toBe("mailto:office@school.example");
    for (const bad of ["not an address", "a@b", 'x"@y.example', "a b@c.example", "<script>@x.example", "javascript:alert(1)"])
      expect(mailtoHref(bad), bad).toBeNull();
  });

  test("a telephone number becomes a tel link of its digits and a leading plus: spaces, brackets and dashes are for the eye", () => {
    expect(telHref("+234 815 300 5393")).toBe("tel:+2348153005393");
    expect(telHref("(0803) 000-0001")).toBe("tel:08030000001");
    for (const bad of ["call us", "12", "javascript:alert(1)", ""]) expect(telHref(bad), bad).toBeNull();
  });

  test("a website is a link only when it is an http or https address", () => {
    expect(websiteHref("https://school.example/home")).toBe("https://school.example/home");
    expect(websiteHref("http://school.example")).toBe("http://school.example");
    for (const bad of ["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://school.example", "school.example", "//school.example", ""])
      expect(websiteHref(bad), bad).toBeNull();
  });
});

test.describe("the hero's small line", () => {
  test("it names the town, and the motto in quotation marks when the school has one", () => {
    expect(eyebrowWithMotto("Ibadan, Nigeria", undefined)).toBe("Ibadan, Nigeria");
    expect(eyebrowWithMotto("Ibadan, Nigeria", "Second To None")).toBe("Ibadan, Nigeria · “Second To None”");
  });
});
