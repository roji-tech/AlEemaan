import { expect, test } from "@playwright/test";
import { renderEmailHtml } from "@/lib/email/render";
import { invitationsEmail } from "@/lib/email/messages";

// One person invited to several branches (task 0092): ONE message that names every branch and has a link of its own under each name. Pure: no server.

const A = "A".repeat(43);
const B = "B".repeat(43);
const C = "C".repeat(43);
const mail = (names: string[], inviterName: string | null = "Abu Royhaan") =>
  invitationsEmail({
    to: "a@b.test",
    branches: [A, B, C].slice(0, names.length).map((token, i) => ({ branchName: names[i], token })),
    roleLabel: "Teaching staff",
    inviterName,
    days: 7,
  });

test("it names the inviter, the role and every branch, and puts each branch's own link under its name (in the fragment, never a query)", () => {
  const m = mail(["Primary (English)", "Secondary (Arabic)", "Primary (Arabic)"]);
  expect(m.to).toBe("a@b.test");
  expect(m.subject).toBe("You're invited to join AlEemaan");
  expect(m.text).toContain(
    "Abu Royhaan invited you to join AlEemaan as Teaching staff in 3 branches: Primary (English), Secondary (Arabic), Primary (Arabic).",
  );
  expect(m.text).toContain("within 7 days. Each link works once and adds that branch only");
  for (const [name, token] of [
    ["Primary \\(English\\)", A],
    ["Secondary \\(Arabic\\)", B],
    ["Primary \\(Arabic\\)", C],
  ])
    expect(m.text).toMatch(new RegExp(`For ${name}:\\nhttps?://\\S+/accept-invite#token=${token}\\n?`));
  expect(m.text).not.toContain("?token=");
});

test("without an inviter it says 'An administrator', and a name with a line break cannot break a line of the message", () => {
  expect(mail(["One", "Two"], null).text.startsWith("An administrator invited you")).toBe(true);
  const m = mail(["Evil\nBranch\u2028Name", "Two"], "Bad\r\nInviter");
  expect(m.text).toContain("Bad Inviter invited you");
  expect(m.text).toContain("For Evil Branch Name:");
  for (const line of m.text.split("\n")) expect(line).not.toMatch(/^Branch/);
});

test("the HTML draws one button per branch under the branch's name, and a branch named like an address never becomes a link", () => {
  const html = renderEmailHtml(mail(["Primary (English)", "https://evil.example/x"]));
  expect((html.match(/>Accept the invitation</g) ?? []).length).toBe(2); // one button per branch
  expect(html).toContain("For Primary (English):");
  expect(html).toContain("For https://evil.example/x:"); // shown as words
  expect(html).not.toContain('href="https://evil.example');
  expect((html.match(new RegExp(`href="[^"]*${A}"`, "g")) ?? []).length).toBe(2); // the button and the printed address, for the first branch
});
