import { NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, fail } from "@/lib/api/envelope";
import { validateCSRF } from "@/lib/auth/csrf";
import { reserveAttempt, refundAttempt, getClientIp } from "@/lib/auth/rate-limit";
import { hashPassword } from "@/lib/auth/password";
import { checkNewPassword } from "@/lib/auth/password-policy";
import { isBreachedPassword, BREACHED_MESSAGE } from "@/lib/auth/pwned-password";

// The four legacy sections, unified into one school (PRD §3). Seeded once,
// here, rather than asked for in the form — this is a known, fixed fact
// about this one deployment, not a generic template for other schools.
const INITIAL_BRANCHES = [
  "Secondary (English)",
  "Primary (English)",
  "Secondary (Arabic)",
  "Primary (Arabic)",
] as const;

const setupSchema = z.object({
  name: z.string().trim().min(1, "Administrator name is required"),
  email: z.string().trim().email("Valid email address is required").toLowerCase(),
  password: z.string().superRefine((value, ctx) => {
    const problem = checkNewPassword(value); // the one shared rule (setup, reset, change)
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
  setupToken: z.string().optional(),
});

/**
 * GET /api/v1/setup
 * Public. Returns whether this instance's first-run setup is complete.
 */
export async function GET() {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "global" },
    });

    return ok({
      setupComplete: !!settings?.setupComplete,
      requiresToken: Boolean(process.env.SETUP_TOKEN),
    });
  } catch (err) {
    console.error("[SETUP_STATUS_ERROR]", err);
    // Fail open on a DB blip so a deployer isn't locked out of their own
    // bootstrap step by a transient connection error.
    return ok({
      setupComplete: false,
      requiresToken: Boolean(process.env.SETUP_TOKEN),
    });
  }
}

/**
 * POST /api/v1/setup
 * One-time bootstrap: seeds the four branches and creates the first ADMIN,
 * anchored to the first branch (the ADMIN role itself is meant to reach
 * across every branch at the application layer — a Phase 1 authorization
 * rule, not built yet; see prisma/schema.prisma's Membership model comment).
 * Guarded by CSRF + IP rate limiting + optional SETUP_TOKEN + an atomic
 * conditional update (only one concurrent request can ever flip
 * setupComplete false -> true) + an AuditLog row in the same transaction.
 */
export async function POST(req: NextRequest) {
  if (!validateCSRF(req)) {
    return fail("Cross-origin request blocked", 403, "CSRF");
  }

  // Reserve-then-refund: the slot is taken now, before any slow work, and handed
  // back only on success (so failed attempts are what count). `await` is mandatory —
  // the limiter is async so a Redis backend stays a drop-in; `!reserveAttempt(...)`
  // without it is `!Promise` (always false) and would silently disable the limit.
  const clientIp = getClientIp(req);
  const limitKey = `setup:${clientIp}`;
  if (!(await reserveAttempt(limitKey))) {
    return fail(
      "Too many setup attempts from this IP. Please try again later.",
      429,
      "RATE_LIMITED",
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body", 400, "INVALID_BODY");
  }

  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid payload", 400, "VALIDATION");
  }

  const { email, password, name, setupToken } = parsed.data;

  const expectedToken = process.env.SETUP_TOKEN;
  if (expectedToken) {
    const providedToken = req.headers.get("x-setup-token") || setupToken || "";
    const expectedBuf = Buffer.from(expectedToken);
    const providedBuf = Buffer.from(providedToken);

    const isValidToken =
      expectedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!isValidToken) {
      return fail(
        "Invalid or missing setup token. Check your server environment settings.",
        401,
        "BAD_SETUP_TOKEN",
      );
    }
  }

  // The first administrator's password is the most valuable one on the install. (After the token check: an
  // unauthenticated request with a wrong token must not make this server call out.)
  if (await isBreachedPassword(password)) {
    return fail(BREACHED_MESSAGE, 400, "VALIDATION");
  }

  try {
    const currentSettings = await prisma.systemSettings.findUnique({
      where: { id: "global" },
    });
    if (currentSettings?.setupComplete) {
      return fail("Setup has already been completed.", 409, "ALREADY_COMPLETE");
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return fail("An account with this email address already exists", 409, "DUPLICATE_EMAIL");
    }

    const passwordHash = await hashPassword(password);
    const userAgent = req.headers.get("user-agent") || "unknown";

    const result = await prisma.$transaction(async (tx) => {
      await tx.systemSettings.upsert({
        where: { id: "global" },
        update: {},
        create: { id: "global", setupComplete: false },
      });

      const updateResult = await tx.systemSettings.updateMany({
        where: { id: "global", setupComplete: false },
        data: { setupComplete: true },
      });

      if (updateResult.count === 0) {
        throw new Error("SETUP_ALREADY_COMPLETED");
      }

      const branches = [];
      for (const branchName of INITIAL_BRANCHES) {
        branches.push(
          await tx.branch.upsert({
            where: { name: branchName },
            update: {},
            create: { name: branchName },
          }),
        );
      }

      const admin = await tx.user.create({
        data: { email, name, passwordHash },
      });

      await tx.membership.create({
        data: { userId: admin.id, branchId: branches[0].id, role: Role.ADMIN },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: "SETUP_WIZARD_COMPLETE",
          targetType: "SystemSettings",
          targetId: "global",
          afterValue: {
            ip: clientIp,
            userAgent,
            email: admin.email,
            name: admin.name,
            branches: branches.map((b) => b.name),
          },
        },
      });

      return { admin, branches };
    });

    console.log(
      `[FIRST_RUN_SETUP] Administrator created: ${result.admin.email} from IP ${clientIp}, ${result.branches.length} branches seeded`,
    );

    await refundAttempt(limitKey);

    return ok(
      {
        message: "Administrator account created successfully. Setup is now complete.",
        admin: { id: result.admin.id, name: result.admin.name, email: result.admin.email },
        branches: result.branches.map((b) => ({ id: b.id, name: b.name })),
      },
      {},
      201,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "SETUP_ALREADY_COMPLETED") {
      return fail("Setup has already been completed.", 409, "ALREADY_COMPLETE");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("A record with a conflicting unique value already exists.", 409, "CONFLICT");
    }
    console.error("[SETUP_POST_ERROR]", error);
    return fail("An unexpected error occurred during setup. Please try again.", 500, "INTERNAL");
  }
}
