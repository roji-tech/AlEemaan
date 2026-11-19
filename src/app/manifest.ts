import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { hostFromHeaders } from "@/lib/auth/csrf";
import { classifyHost, readPortalConfig } from "@/lib/portals";
import { manifestFor } from "@/lib/pwa/manifest";

// The manifest depends on the address it is asked for (task 0104): `parent.` and `student.` open their workspace, `staff.` and `admin.` the dashboard. Reading the host makes this route
// dynamic, which is right: each address gets its own answer (the CDN keys on the host).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return manifestFor(classifyHost(hostFromHeaders(await headers()), readPortalConfig().config));
}
