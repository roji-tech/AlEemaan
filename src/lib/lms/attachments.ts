// The links on a study material, an assignment and a hand-in (task 0065). A link is a web address: http or https. The schema used z.string().url(), which also takes javascript:, data: and ftp:.

export interface AttachmentLink {
  title: string;
  url: string;
}

/// True for an http or https address; anything else (javascript:, data:, ftp:, mailto:, a text that is not an address) is not a link this app shows or stores.
export function isWebLink(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/// The links that can be opened in a stored `attachments` value. The column is JSON of no fixed shape (rows written before the rule, or by hand, may hold anything), so a screen asks this
/// instead of reading the value: an entry that is not { title, url } with a web address in `url` is left out.
export function attachmentLinks(value: unknown): AttachmentLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AttachmentLink[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const { title, url } = entry as Record<string, unknown>;
    if (typeof url !== "string" || !isWebLink(url)) return [];
    return [{ title: typeof title === "string" && title.trim() ? title : "Resource", url }];
  });
}
