"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

// The branch the signed-in PERSON last chose (task 0127): read on the server from their own record, so the first paint already has it and it follows them to any browser or device, and written
// back (one small request) when they choose another. Before this it was the browser's localStorage, so another person on the same browser inherited it. A page still uses it only when it is one
// of the branches that person may see (`pickBranch`).

type Memory = { value: string | null; remember: (id: string) => void };
const BranchMemoryContext = createContext<Memory>({ value: null, remember: () => {} });

export function BranchMemoryProvider({ initial, children }: { initial: string | null; children: ReactNode }) {
  const [value, setValue] = useState<string | null>(initial);
  const sent = useRef<string | null>(initial);
  const remember = useCallback((id: string) => {
    setValue(id);
    if (sent.current === id) return;
    sent.current = id;
    // Best effort: a failed save only means another device does not learn it; this page has it already. `keepalive` lets it finish when the person leaves the page straight after choosing.
    void fetch("/api/v1/account/branch", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId: id }),
      keepalive: true,
    }).catch(() => {});
  }, []);
  const memory = useMemo(() => ({ value, remember }), [value, remember]);
  return <BranchMemoryContext.Provider value={memory}>{children}</BranchMemoryContext.Provider>;
}

export const useBranchMemory = () => useContext(BranchMemoryContext);
