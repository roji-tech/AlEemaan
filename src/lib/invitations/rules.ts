import "@/lib/zod-csp";
import { z } from "zod";

// The rules for an invitation's fields with NO database in them, so the single form, the route and the bulk entry (task 0084) run the same ones.

export const inviteEmail = z
  .string({ error: "Enter an email address." })
  .trim()
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.")
  .toLowerCase();

/// The database's `Role` values (a unit test pins that they are the same list).
export const ROLE_VALUES = ["ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF", "STUDENT", "PARENT"] as const;
export const inviteRole = z.enum(ROLE_VALUES, { error: "Choose a role." });
