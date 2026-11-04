// The pure part of the ceiling switch (no database, safe to import from a screen): what a stored value may be, and what applies.

/// A stored value that is not a boolean is ignored (never trusted).
export const parseSwitch = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);

/// On for a branch only if the school AND the branch have it on; nothing stored is on. A branch can narrow the school's value, never widen it.
export const effectiveSwitch = (school: boolean | undefined, branch: boolean | undefined): boolean => (school ?? true) && (branch ?? true);
