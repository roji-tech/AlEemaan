import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

// Auth.js's Credentials provider is incompatible with database sessions by
// design (confirmed at runtime: "Signing in with credentials only supported
// if JWT strategy is enabled") — so there's no provider configured here at
// all. Login is fully hand-rolled (src/app/api/v1/auth/login/route.ts)
// against this exact same Session table via the Prisma adapter, using the
// cookie name declared below so auth()'s reads and the login route's writes
// agree. This keeps the deliberate database-session choice (a session is
// revocable by deleting its row) instead of falling back to JWT.
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Secure-aleemaan.session-token" : "aleemaan.session-token";

export { SESSION_COOKIE_NAME };

export const { handlers, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  providers: [],
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
