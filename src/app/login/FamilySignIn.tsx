"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Portal } from "@/lib/portals";
import { PortalLoginCard } from "@/components/portal/PortalLoginCard";
import { LoginForm } from "./LoginForm";

// The one door (task 0113, task 0094 D1): on student. and parent. the sign-in page shows the form families can use (admission number and the code or secret the address asks for); the
// e-mail and password sign-in of an account the school invited is one click under it. A family's sign-in lands in the workspace at /portal on this same address.
export function FamilySignIn({
  portal,
  returnTo,
  closedNotice,
}: {
  portal: { id: Portal; title: string; line: string };
  returnTo: string | null;
  closedNotice: string | null;
}) {
  const [email, setEmail] = useState(false);
  const router = useRouter();
  if (email) {
    return (
      <div className="space-y-4">
        <LoginForm portal={portal} returnTo={returnTo} closedNotice={closedNotice} />
        <p className="text-center text-sm">
          <button
            type="button"
            onClick={() => setEmail(false)}
            className="min-h-11 rounded-md px-2 font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Sign in with the admission number instead
          </button>
        </p>
      </div>
    );
  }
  return (
    <PortalLoginCard
      door={portal.id === "student" ? "PUPIL" : "GUARDIAN"}
      heading={{ title: portal.title, line: portal.line, portal: portal.id }}
      notice={closedNotice}
      onSuccess={() => router.push("/portal")}
      onUseEmail={() => setEmail(true)}
    />
  );
}
