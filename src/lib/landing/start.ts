import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

/// The decision the start pages share (tasks 0048, 0050 and 0078): a signed-in person goes straight to their dashboard; anyone else (a visitor, a person signed out) stays, and the page is drawn.
/// It no longer asks whether first-run setup is finished (task 0078): a new instance shows its landing page at once, and `/login`, the way in, still sends a visitor to the wizard until an
/// administrator exists. Reads the session cookie, so a page that calls it is never statically cached.
export async function leaveUnlessVisitor(): Promise<void> {
  if (await getSession()) redirect("/dashboard");
}
