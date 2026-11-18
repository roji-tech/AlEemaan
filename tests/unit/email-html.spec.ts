import "../support/env";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escapeHtml, isSafeUrl, renderEmailHtml } from "@/lib/email/render";
import { invitationEmail, resetEmail, emailChangeConfirmEmail, emailChangedNotice, mfaEnabledEmail } from "@/lib/email/messages";
import { getEmailTransport } from "@/lib/email/transport";

// The HTML half of every e-mail: the same words as the text, drawn as a small page, and safe whatever the words are.

const TOKEN = "gBwonJXO9uaRT04jhIwl31FTgu9sSNXmY0xmJoQ7z24";

test.describe("escaping", () => {
  test("every character that matters in HTML is escaped, in text and in attributes", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });

  test("a hostile name, branch or subject can not become markup", () => {
    const evil = `</p><script>alert(1)</script><img src=x onerror=alert(2)>`;
    const mail = invitationEmail({ to: "a@b.test", token: TOKEN, branchName: evil, roleLabel: evil, inviterName: evil, days: 7 });
    const html = renderEmailHtml({ ...mail, subject: evil });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/<[^>]*onerror=/i); // the text "onerror=alert(2)" survives only as escaped text, never inside a tag
    expect(html).toContain("&lt;script&gt;");
  });
});

test.describe("links", () => {
  test("only a whole http(s) address with nothing in it that could break out is a link", () => {
    for (const ok of ["https://aleemanschool.com/accept-invite#token=abc", "http://localhost:3000/reset-password#token=x_y-z"])
      expect(isSafeUrl(ok), ok).toBe(true);
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<b>",
      "//evil.example",
      "https://a.test/x y",
      'https://a.test/"onmouseover="x',
      "https://a.test/<b>",
      "https://a.test/'x",
      "ftp://a.test/x",
      `https://a.test/${"a".repeat(2100)}`,
    ]) {
      expect(isSafeUrl(bad), bad).toBe(false);
    }
  });

  test("a link line becomes a button with the address printed under it; a bad link stays text", () => {
    const html = renderEmailHtml({
      subject: "S",
      text: `Open this:\nhttps://a.test/reset-password#token=${TOKEN}\n\nAnd this:\njavascript:alert(1)`,
    });
    expect(html).toContain(`href="https://a.test/reset-password#token=${TOKEN}"`);
    expect(html).toContain("Choose a new password");
    expect(html).toContain("copy this address into your browser");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("javascript:alert(1)"); // shown as plain text, not a link
  });

  test("the button says what the link is for", () => {
    const label = (path: string) =>
      /display:inline-block[^>]*>([^<]+)</.exec(renderEmailHtml({ subject: "S", text: `x\nhttps://a.test${path}` }))![1];
    expect(label("/reset-password#token=a")).toBe("Choose a new password");
    expect(label("/accept-invite#token=a")).toBe("Accept the invitation");
    expect(label("/confirm-email#token=a")).toBe("Confirm the new address");
    expect(label("/login")).toBe("Open AlEemaan");
    expect(label("/somewhere")).toBe("Open the link");
  });
});

test.describe("the real messages", () => {
  const messages = () => [
    resetEmail("a@b.test", TOKEN),
    invitationEmail({
      to: "a@b.test",
      token: TOKEN,
      branchName: "Primary (English)",
      roleLabel: "Teaching staff",
      inviterName: "Abu Royhaan",
      days: 7,
    }),
    emailChangeConfirmEmail("a@b.test", TOKEN),
    emailChangedNotice("a@b.test", "new@b.test"),
    mfaEnabledEmail("a@b.test"),
  ];

  test("every message keeps all its words in the HTML (escaped), under the school's name and its subject as the heading", () => {
    for (const m of messages()) {
      const html = renderEmailHtml(m);
      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html).toContain("<h1");
      expect(html).toContain(escapeHtml(m.subject));
      for (const line of m.text.split("\n").filter((l) => l.trim() && !/^https?:\/\//.test(l.trim()))) {
        expect(html, line).toContain(escapeHtml(line.trim()));
      }
    }
  });

  test("a message with a link has two anchors (the button and the printed address) and nothing else is a link", () => {
    const html = renderEmailHtml(resetEmail("a@b.test", TOKEN));
    expect((html.match(/<a /g) ?? []).length).toBe(2);
    // The address is written three times: the button's href, the printed address's href and the printed address itself.
    expect((html.match(new RegExp(TOKEN, "g")) ?? []).length).toBe(3);
    expect((html.match(new RegExp(`href="[^"]*${TOKEN}"`, "g")) ?? []).length).toBe(2);
  });

  test("nothing is fetched: no images, scripts, fonts, forms or tracking", () => {
    for (const m of messages()) {
      const html = renderEmailHtml(m);
      for (const tag of ["<img", "<script", "<link", "<iframe", "<form", "@import", "url("]) expect(html, tag).not.toContain(tag);
    }
  });
});

test.describe("sending", () => {
  test("the file transport writes the text unchanged and an HTML half made from it", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mail-")), "out.jsonl");
    const before = { transport: process.env.EMAIL_TRANSPORT, file: process.env.EMAIL_FILE };
    process.env.EMAIL_TRANSPORT = "file";
    process.env.EMAIL_FILE = file;
    try {
      const m = resetEmail("a@b.test", TOKEN);
      await getEmailTransport().send(m);
      const written = JSON.parse(fs.readFileSync(file, "utf8").trim());
      expect(written.text).toBe(m.text);
      expect(written.html).toContain(`href="`);
      expect(written.html).toContain(escapeHtml(m.subject));
      // A message that already has HTML keeps it.
      await getEmailTransport().send({ ...m, html: "<p>mine</p>" });
      const second = fs.readFileSync(file, "utf8").trim().split("\n")[1];
      expect(JSON.parse(second).html).toBe("<p>mine</p>");
    } finally {
      if (before.transport === undefined) delete process.env.EMAIL_TRANSPORT;
      else process.env.EMAIL_TRANSPORT = before.transport;
      if (before.file === undefined) delete process.env.EMAIL_FILE;
      else process.env.EMAIL_FILE = before.file;
    }
  });
});
