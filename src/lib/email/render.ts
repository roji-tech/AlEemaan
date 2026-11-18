import { brand } from "@/lib/brand";

// The HTML version of every message (the maintainer: "use a nice UI for the emails"). The plain-text message stays exactly as written (it is the other half of the e-mail and what a plain
// reader, a screen reader and the tests see); this draws the same words as a small, safe page: the school's name, a heading, paragraphs, and a button for a link.
//
// Safe because it only ever receives TEXT: every character that came from anywhere (a person's name, a branch, a school announcement) is escaped, a link becomes a button only when it is
// a whole http(s) address with nothing in it that could close an attribute, and nothing is fetched (no pictures, fonts or tracking). Inline styles and tables because mail programs
// ignore style sheets; the page's own Content-Security-Policy does not apply to mail.

const GREEN = "#2a7f4f"; // the brand's filled-button colour: white on it is 4.94:1
const INK = "#1f2937";
const MUTED = "#6b7280";

/// Escapes text for an HTML body or a double-quoted attribute.
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/// A whole http(s) address on one line, with nothing that could break out of a double-quoted attribute or start a script.
const URL_LINE = /^https?:\/\/[^\s<>"'`]+$/i;
export const isSafeUrl = (value: string): boolean => URL_LINE.test(value) && value.length <= 2048;

/// What the button says, from where the link goes. Anything else is a plain "Open the link".
function buttonLabel(url: string): string {
  const path = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return "";
    }
  })();
  if (path.startsWith("/reset-password")) return "Choose a new password";
  if (path.startsWith("/accept-invite")) return "Accept the invitation";
  if (path.startsWith("/confirm-email")) return "Confirm the new address";
  if (path.endsWith("/login") || path.startsWith("/forgot-password")) return "Open AlEemaan";
  return "Open the link";
}

const P = `margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK};`;

function paragraph(lines: string[]): string {
  return `<p style="${P}">${lines.map(escapeHtml).join("<br>")}</p>`;
}

function button(url: string): string {
  const href = escapeHtml(url);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 12px;"><tr><td style="border-radius:10px;background:${GREEN};">` +
    `<a href="${href}" style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(buttonLabel(url))}</a>` +
    `</td></tr></table>` +
    `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:${MUTED};">If the button does not work, copy this address into your browser:<br>` +
    `<a href="${href}" style="color:${GREEN};word-break:break-all;">${href}</a></p>`
  );
}

/// The message as an HTML document. `text` is split into paragraphs at blank lines; a line that is only a web address becomes a button (with the address printed under it).
export function renderEmailHtml(message: { subject: string; text: string }): string {
  const blocks = message.text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.split("\n").filter((line) => line.trim() !== ""))
    .filter((lines) => lines.length > 0);

  const body = blocks
    .map((lines) => {
      const out: string[] = [];
      let pending: string[] = [];
      const flush = () => {
        if (pending.length > 0) out.push(paragraph(pending));
        pending = [];
      };
      for (const line of lines) {
        const trimmed = line.trim();
        if (isSafeUrl(trimmed)) {
          flush();
          out.push(button(trimmed));
        } else pending.push(line);
      }
      flush();
      return out.join("");
    })
    .join("");

  const name = escapeHtml(brand.name);
  const title = escapeHtml(message.subject);
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${title}</title></head>` +
    `<body style="margin:0;padding:0;background:#f3f5f4;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f4;"><tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
    `<tr><td style="padding:0 4px 14px;font-size:20px;font-weight:700;color:${GREEN};letter-spacing:.2px;">${name}</td></tr>` +
    `<tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:28px 28px 12px;">` +
    `<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${INK};">${title}</h1>` +
    body +
    `</td></tr>` +
    `<tr><td style="padding:16px 8px 0;font-size:12px;line-height:1.5;color:${MUTED};text-align:center;">Sent by ${name}. This is an automatic message, so please do not reply to it.</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}
