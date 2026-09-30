"use client";

import { usePathname } from "next/navigation";
import { PAGE_LABELS } from "./nav";

/// "Admin / Branches" — where you are, in the top bar. Two levels only: the person's section
/// and the page (there are no deeper pages yet). `aria-current="page"` marks the last crumb.
export function Breadcrumb({ section }: { section: string }) {
  const pathname = usePathname();
  const page = PAGE_LABELS[pathname];

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-sm">
        <li className="text-fg-muted">{section}</li>
        {page && (
          <>
            <li aria-hidden="true" className="text-fg-muted">
              /
            </li>
            <li aria-current="page" className="font-semibold text-fg">
              {page}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
