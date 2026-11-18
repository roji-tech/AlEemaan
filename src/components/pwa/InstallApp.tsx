"use client";

import { useSyncExternalStore } from "react";
import { DownloadIcon } from "@/components/ui/icons";
import { installState, promptInstall, serverInstallState, subscribeInstall } from "@/lib/pwa/install";

/// "Install the app", where it can be done (task 0104). A button where the browser gave the page an install prompt (Chrome and Edge, Android and desktop); on an iPhone or iPad, which have no
/// prompt, one line saying where the install is (Share, then Add to Home Screen); nothing at all when the app is already installed or the browser offers no install, because a button that does
/// nothing is worse than none. Server-rendered as nothing, so it never disagrees with the first client render.
export function InstallApp({ className = "" }: { className?: string }) {
  const state = useSyncExternalStore(subscribeInstall, installState, serverInstallState);
  if (state === "ready")
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-4 text-sm font-semibold text-fg transition-colors hover:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}
      >
        <DownloadIcon className="h-4 w-4" />
        Install the app
      </button>
    );
  if (state === "apple")
    return (
      <p className={`text-xs leading-relaxed text-fg-muted ${className}`}>
        To install on an iPhone or iPad: tap <strong className="font-semibold text-fg-2">Share</strong>, then{" "}
        <strong className="font-semibold text-fg-2">Add to Home Screen</strong>.
      </p>
    );
  return null;
}
