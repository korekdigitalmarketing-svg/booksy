import "server-only";
import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

// Lazily constructed so a missing STRIPE_SECRET_KEY only breaks the paid
// flow it's actually needed for, not every route that happens to import
// this module.
export function getStripe(): Stripe {
  if (!stripeSingleton) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}
