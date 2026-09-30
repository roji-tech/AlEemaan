import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isSetupComplete } from "@/lib/setup/status";

// A pure router — never renders UI. Sends every visitor to the one place that
// makes sense for their state.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getSession()) redirect("/dashboard");
  if ((await isSetupComplete()) === false) redirect("/setup");
  redirect("/login");
}
