import { NextResponse } from "next/server";

// Section 12: "API routes return machine-readable error codes ... never
// English prose." The client maps codes to translated messages — adding a
// human-readable string here would just be dead weight nobody renders.
export const ApiErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  EVENT_TYPE_NOT_FOUND: "EVENT_TYPE_NOT_FOUND",
  QUESTION_NOT_FOUND: "QUESTION_NOT_FOUND",
  INVALID_TIMEZONE: "INVALID_TIMEZONE",
  SLOT_TAKEN: "SLOT_TAKEN",
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  OUTSIDE_NOTICE_WINDOW: "OUTSIDE_NOTICE_WINDOW",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  REFUND_FAILED: "REFUND_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  EVENT_TYPE_NOT_FOUND: 404,
  QUESTION_NOT_FOUND: 404,
  INVALID_TIMEZONE: 400,
  SLOT_TAKEN: 409,
  SLOT_UNAVAILABLE: 409,
  OUTSIDE_NOTICE_WINDOW: 400,
  PAYMENT_FAILED: 402,
  REFUND_FAILED: 502,
  UNAUTHORIZED: 401,
  INTERNAL_ERROR: 500,
};

export function apiError(
  code: ApiErrorCode,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: { code, ...(details ? { details } : {}) } },
    { status: STATUS_BY_CODE[code] },
  );
}
