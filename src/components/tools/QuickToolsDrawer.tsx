"use client";

import { useState, useEffect } from "react";
import { CalculatorTool } from "./calculator/CalculatorTool";
import { StudentLookupTool } from "./students/StudentLookupTool";
import { QuickNotesTool } from "./QuickNotesTool";
import { CalculatorIcon, FileTextIcon, GraduationCapIcon, XIcon } from "@/components/ui/icons";
import type { QuickToolId } from "./types";

interface QuickToolsDrawerProps {
  open: boolean;
  onClose: () => void;
  initialTool?: QuickToolId;
}

export function QuickToolsDrawer({
  open,
  onClose,
  initialTool = "calculator",
}: QuickToolsDrawerProps) {
  const [selectedTool, setSelectedTool] = useState<QuickToolId | null>(null);
  const activeTool = selectedTool ?? initialTool;

  const tools = [
    {
      id: "calculator" as const,
      name: "Calculator",
      icon: CalculatorIcon,
    },
    {
      id: "lookup" as const,
      name: "Student Lookup",
      icon: GraduationCapIcon,
    },
    {
      id: "scratchpad" as const,
      name: "Scratchpad",
      icon: FileTextIcon,
    },
  ];

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Tools"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer / Bottom Sheet Container */}
      <div className="relative z-10 flex max-h-[90vh] sm:max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl border border-line bg-surface shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header Bar */}
        <div className="border-b border-line px-5 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-fg">Quick Tools</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
              aria-label="Close Quick Tools"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Tool Tab Bar */}
          <div className="mt-3 flex gap-1 rounded-xl bg-surface-2 p-1">
            {tools.map((t) => {
              const Icon = t.icon;
              const selected = activeTool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTool(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                    selected
                      ? "bg-surface text-fg shadow-xs ring-1 ring-line"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Tool Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTool === "calculator" && <CalculatorTool />}
          {activeTool === "lookup" && <StudentLookupTool />}
          {activeTool === "scratchpad" && <QuickNotesTool />}
        </div>
      </div>
    </div>
  );
}
