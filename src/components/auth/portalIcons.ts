import type { ComponentType, SVGProps } from "react";
import { GraduationCapIcon, ShieldCheckIcon, UserIcon, UsersIcon } from "@/components/ui/icons";
import type { Portal } from "@/lib/portals";

/// The picture of each sign-in portal (task 0086), on its own sign-in page and on the website's sign-in page.
export const PORTAL_ICONS: Record<Portal, ComponentType<SVGProps<SVGSVGElement>>> = {
  admin: ShieldCheckIcon,
  staff: UsersIcon,
  student: GraduationCapIcon,
  parent: UserIcon,
};
