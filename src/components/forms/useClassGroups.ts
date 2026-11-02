"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/components/auth/postJson";

export type ClassGroup = { id: string; name: string };

/// The class groups of a branch, for naming the classes a form is for and for choosing them. Empty while loading or when they cannot be read: the API decides who may list them.
export function useClassGroups(branchId: string): ClassGroup[] {
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    void (async () => {
      const reply = await getJson(`/api/v1/academics/class-groups?branchId=${encodeURIComponent(branchId)}`, controller.signal);
      if (controller.signal.aborted) return;
      const rows = (reply.data?.classGroups ?? []) as ClassGroup[];
      setClassGroups(reply.ok ? rows.map((g) => ({ id: g.id, name: g.name })) : []);
    })();
    return () => controller.abort();
  }, [branchId]);
  return classGroups;
}
