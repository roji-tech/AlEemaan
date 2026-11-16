import { prisma } from "@/lib/db";
import { isWebLink } from "@/lib/lms/attachments";

// What the landing pages show of the school profile (task 0070): the motto and the ways to reach the school. A visitor is not signed in, so this reads ONLY the five fields the school
// typed for the public (never the principal's name or anything else of the row), and only reads: `getSchoolSettings()` upserts, and the landing page writes nothing.

export type PublicContact = { motto?: string; phone?: string; email?: string; address?: string; website?: string };

type Row = { motto: string | null; phone: string | null; email: string | null; address: string | null; website: string | null };

const text = (value: string | null | undefined): string | undefined => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
};

/// The profile row as the page shows it: each field trimmed, and left out when it is empty.
export function toPublicContact(row: Row | null): PublicContact {
  if (!row) return {};
  const contact: PublicContact = {};
  for (const key of ["motto", "phone", "email", "address", "website"] as const) {
    const value = text(row[key]);
    if (value) contact[key] = value;
  }
  return contact;
}

/// The profile for the landing page. A database that cannot be read draws the page without the profile, as the start page's own setup check does (`isSetupComplete`): the front page of the
/// school must not fail because a table could not be read.
export async function getPublicContact(): Promise<PublicContact> {
  try {
    const row = await prisma.schoolSettings.findUnique({
      where: { id: "global" },
      select: { motto: true, phone: true, email: true, address: true, website: true },
    });
    return toPublicContact(row);
  } catch (err) {
    console.error("[LANDING_CONTACT_ERROR]", err);
    return {};
  }
}

/// A link is made only from a value that is safe as an `href`; anything else is shown as plain text and never becomes a link.
export const mailtoHref = (email: string): string | null =>
  /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(email) ? `mailto:${email}` : null;

/// The digits of a telephone number and a leading plus, nothing else (spaces, brackets and dashes are for the eye).
export const telHref = (phone: string): string | null => {
  const dialled = phone.replace(/[^\d+]/g, "");
  return /^\+?\d{5,20}$/.test(dialled) ? `tel:${dialled}` : null;
};

export const websiteHref = (website: string): string | null => (isWebLink(website) ? website : null);

/// The hero's small line: where the school is, then its motto when it has one.
export function eyebrowWithMotto(eyebrow: string, motto: string | undefined): string {
  return motto ? `${eyebrow} · “${motto}”` : eyebrow;
}
