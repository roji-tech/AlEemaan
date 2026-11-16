import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSetupComplete } from "@/lib/setup/status";

/// The decision the start pages share (tasks 0048 and 0050): a signed-in person goes straight to their dashboard and an instance whose first-run setup is not finished to its setup wizard;
/// anyone else (a visitor, a person signed out, a setup state that could not be read) stays, and the page is drawn. Reads the session cookie, so a page that calls it is never statically cached.
export async function leaveUnlessVisitor(): Promise<void> {
  if (await getSession()) redirect("/dashboard");
  if ((await isSetupComplete()) === false) redirect("/setup");
}
