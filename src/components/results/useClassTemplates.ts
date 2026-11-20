"use client";

import { useCallback, useEffect, useState } from "react";
import { getJson } from "@/components/auth/postJson";
import type { TemplatesData } from "@/components/results/template-types";

/// Which result template each class of the branch uses (task 0116), for the Classes tab: one request per branch, any staff role. `byClass[id]` is absent until it has loaded; a failed load
/// leaves it empty (the tab simply shows no template line).
export function useClassTemplates(branchId: string, enabled: boolean) {
  const [byClass, setByClass] = useState<Record<string, { name: string; explicit: boolean }>>({});
  const reload = useCallback(async () => {
    const reply = await getJson(`/api/v1/results/templates?branchId=${encodeURIComponent(branchId)}`);
    if (!reply.ok) return setByClass({});
    const data = reply.data as unknown as TemplatesData;
    setByClass(
      Object.fromEntries(
        data.coverage.filter((c) => c.templateName).map((c) => [c.classGroupId, { name: c.templateName!, explicit: c.explicit }]),
      ),
    );
  }, [branchId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading on a branch change is exactly what this effect is for
    if (enabled) void reload();
  }, [enabled, reload]);
  return { byClass, reload };
}
