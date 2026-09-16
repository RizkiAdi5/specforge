import { NextResponse } from "next/server";
import { InsufficientCreditError } from "@/lib/ai/run";
import { RateLimitError, CostCapError } from "@/lib/ai/limits";
import { ProjectSizeLimitError } from "@/lib/spec/project-limits";

/** Converts a caught business-rule error into the response shape the UI recognizes
 * (US-014/US-015/T-025) — or rethrows if it's an error this doesn't know about. */
export function insufficientCreditResponse(err: unknown) {
  if (err instanceof InsufficientCreditError) {
    return NextResponse.json({ error: "insufficient_credit", message: err.message }, { status: 402 });
  }
  if (err instanceof RateLimitError) {
    return NextResponse.json({ error: "rate_limited", message: err.message }, { status: 429 });
  }
  if (err instanceof CostCapError) {
    return NextResponse.json({ error: "cost_cap_reached", message: err.message }, { status: 402 });
  }
  if (err instanceof ProjectSizeLimitError) {
    return NextResponse.json({ error: "project_size_limit", message: err.message }, { status: 409 });
  }
  throw err;
}
