import "server-only";
import { getStripe } from "@/lib/stripe";

// Multi-host payouts, built on Stripe Connect Express accounts. A host's
// Express account is created and onboarded with the PLATFORM's own secret
// key (getStripe()) — Connect account management and destination charges
// both go through the platform key; only the charge itself ends up
// crediting the connected account, via transfer_data.destination on the
// Checkout Session (see app/api/bookings/route.ts), not a separate key.

/** Creates a new Express account for a host who has none yet. Express
 * (not Standard) so onboarding stays inside this app's own flow via an
 * Account Link, rather than sending the host through a full Stripe
 * dashboard signup. */
export async function createExpressAccount(email: string): Promise<string> {
  const account = await getStripe().accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return account.id;
}

/** Builds a one-time onboarding link for a host's Express account.
 * `refreshUrl` is where Stripe sends the host if the link itself expires
 * or is otherwise invalid — pointing it back at the route that generates
 * a fresh link (rather than, say, Settings directly) means an expired
 * link self-heals with one extra redirect instead of stranding the host. */
export async function createOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<string> {
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

export interface StripeAccountStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

/** Re-reads an account's actual capability flags from Stripe. Landing on
 * `return_url` is not itself proof onboarding succeeded — a host can
 * abandon the flow partway and still get redirected there — so this is
 * what actually confirms status, called right after return and, while a
 * host isn't fully enabled yet, on each Settings page load. */
export async function getAccountStatus(accountId: string): Promise<StripeAccountStatus> {
  const account = await getStripe().accounts.retrieve(accountId);
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  };
}

/** A fresh login link into the host's own Express dashboard (payouts,
 * balance, tax forms) — Express accounts have no standalone dashboard
 * login of their own, only these short-lived links minted on demand. */
export async function createLoginLink(accountId: string): Promise<string> {
  const link = await getStripe().accounts.createLoginLink(accountId);
  return link.url;
}
