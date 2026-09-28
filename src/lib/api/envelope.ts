import { NextResponse } from "next/server";

// Consistent response shape (mirrors Octalve Edu's PRD §7 convention, reused
// here for the same reason: every response is { data, meta, error }, never a
// bare array or ad hoc shape).
export function ok<T>(
  data: T,
  meta: Record<string, unknown> = {},
  status = 200,
) {
  return NextResponse.json({ data, meta, error: null }, { status });
}

export function fail(message: string, status: number, code?: string) {
  return NextResponse.json(
    { data: null, meta: {}, error: { code: code ?? String(status), message } },
    { status },
  );
}
