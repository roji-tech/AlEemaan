import type { Metadata } from "next";
import { headers } from "next/headers";
import { hostFromHeaders } from "@/lib/auth/csrf";
import { classifyHost, readPortalConfig } from "@/lib/portals";
import { doorFor } from "@/lib/portal/door";
import { PortalClient } from "./PortalClient";

export const metadata: Metadata = { title: "Portal" };
// The address decides which door this is (task 0113): read per request.
export const dynamic = "force-dynamic";

// The families' workspace. Signed in, it is the same everywhere; signed out, the address decides: student. and parent. send the visitor to their own /login (the one door), the school's
// own address to /select-role, and a deployment with the portals off shows the one form here.
export default async function PortalPage() {
  const { config } = readPortalConfig();
  const door = doorFor(classifyHost(hostFromHeaders(await headers()), config));
  return <PortalClient door={door} />;
}
