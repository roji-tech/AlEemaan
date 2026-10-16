import type { ComponentType } from "react";

export type QuickToolId = "calculator" | "lookup" | "scratchpad";

export interface QuickToolDefinition {
  id: QuickToolId;
  name: string;
  shortName: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
}
