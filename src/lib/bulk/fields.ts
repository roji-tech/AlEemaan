import "@/lib/zod-csp";
import { z } from "zod";
import { staffEmail, staffPhone } from "@/lib/academics/staff-rules";

// Field rules the bulk kinds share (task 0084), client-safe. An empty cell means "not given" for an optional column.

export const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
/// Excel keeps a phone typed as 08031234567 as a NUMBER and drops the zero: ten digits that do not start with 0 get it back.
export const phoneText = (v: unknown) => {
  const t = blankToUndefined(v);
  return typeof t === "string" && /^[1-9]\d{9}$/.test(t.trim()) ? `0${t.trim()}` : t;
};
export const optionalPhone = z.preprocess(phoneText, staffPhone.optional());
export const optionalEmail = z.preprocess(blankToUndefined, staffEmail.optional());
export const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Use at most ${max} characters.`).optional());
export const letters = (v: string) => v.toLowerCase().replace(/[^a-z]/g, "");
