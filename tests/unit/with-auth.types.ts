// Compile-time check, enforced by `pnpm typecheck` (tsc) — not a runtime test.
// If `permissions` ever becomes accepted again before §1.7's design exists, or `roles`
// stops rejecting things that aren't Roles, the @ts-expect-error lines below stop erroring
// and `tsc` fails with "Unused '@ts-expect-error' directive", which is the point.
import { Role } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";

const handler = async () => new Response("ok");

// @ts-expect-error `permissions` is `never` until §1.7
withAuth(handler, { permissions: ["CAN_MANAGE_FINANCE"] });

// @ts-expect-error `roles` only accepts Role values (a typo can't silently open a route)
withAuth(handler, { roles: ["ADMN"] });

withAuth(handler); // the supported call shapes still compile
withAuth(handler, { roles: [Role.ADMIN] });
