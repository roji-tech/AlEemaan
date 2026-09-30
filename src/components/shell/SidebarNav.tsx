"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SoonTag } from "./SoonTag";
import { isActive, navFor } from "./nav";

/// The desktop sidebar's navigation. The current page is marked with `aria-current="page"`
/// (which is also what the styling keys off, so what sighted and screen-reader users are told
/// can't drift apart); pages that don't exist yet are plain text with a "Soon" tag.
export function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      <ul className="space-y-1">
        {navFor(isAdmin).map(({ label, href, icon: Icon }) => (
          <li key={label}>
            {href ? (
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg aria-[current=page]:bg-brand-tint aria-[current=page]:font-semibold aria-[current=page]:text-brand-fg"
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </Link>
            ) : (
              <span className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-fg-muted">
                <Icon className="h-5 w-5 shrink-0" />
                {label}
                <SoonTag />
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
