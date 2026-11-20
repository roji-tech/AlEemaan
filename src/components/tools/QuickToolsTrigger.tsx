"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { WrenchIcon } from "@/components/ui/icons";
import { QuickToolsDrawer } from "./QuickToolsDrawer";
import type { QuickToolId } from "./types";

export function QuickToolsTrigger() {
  const searchParams = useSearchParams();
  const requestedTool = searchParams.get("tool");
  const isPwaTool =
    requestedTool === "calculator" || requestedTool === "lookup" || requestedTool === "scratchpad" || requestedTool === "report";

  const [open, setOpen] = useState(isPwaTool);
  const [initialTool] = useState<QuickToolId>(isPwaTool ? (requestedTool as QuickToolId) : "calculator");

  // Global Keyboard Shortcut: Cmd+K / Ctrl+K or Alt+T
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Floating Action Button. The phone's bottom tab bar (and its More button at the right end) is shown below `lg`, so the button stays above it until `lg`: at `sm` it used to drop to the corner and sit on More. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Quick Tools (Cmd+K)"
        data-fixed-bottom
        title="Quick Tools (Cmd+K or Alt+T)"
        className="fixed right-4 print:hidden bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/25 transition-all duration-200 hover:scale-105 hover:bg-brand/90 hover:shadow-xl active:scale-95 lg:right-6 lg:bottom-6 focus:outline-none focus:ring-2 focus:ring-brand-strong focus:ring-offset-2"
      >
        <WrenchIcon className="h-5 w-5" />
      </button>

      <QuickToolsDrawer open={open} onClose={() => setOpen(false)} initialTool={initialTool} />
    </>
  );
}
