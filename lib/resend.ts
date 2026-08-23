import "server-only";
import { Resend } from "resend";

let resendSingleton: Resend | null = null;

// Lazily constructed, same rationale as lib/stripe.ts — a missing
// RESEND_API_KEY only breaks the send path that actually needs it.
export function getResend(): Resend {
  if (!resendSingleton) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY is not set");
    }
    resendSingleton = new Resend(key);
  }
  return resendSingleton;
}
