"use client";

import { Suspense, startTransition, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safe-redirect";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <Image
        src="/brand/booksy-logo.png"
        alt="Booksy"
        width={1699}
        height={926}
        className="h-9 w-auto"
        priority
      />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}

function LoginForm() {
  // useSearchParams requires a Suspense boundary (above) to allow the
  // static shell to render before this client-only value is available.
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // The real app flow (signInWithOtp below) uses PKCE, which
  // /auth/callback handles server-side via a `?code=` param. This effect
  // is a defensive fallback for the older implicit flow (tokens in a URL
  // fragment, e.g. `#access_token=...`) — fragments are never sent to the
  // server, so this is the only place that flow can ever be completed.
  // Supabase's automatic detectSessionInUrl handling doesn't reliably fire
  // from a plain getSession() call here, so the tokens are parsed out of
  // the fragment and applied explicitly via setSession().
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (!accessToken || !refreshToken) {
      startTransition(() => setCheckingSession(false));
      return;
    }
    const supabase = createClient();
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data }) => {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        if (data.session) {
          router.replace(next);
        } else {
          startTransition(() => setCheckingSession(false));
        }
      });
  }, [next, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <Card className="w-full">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Signing you in…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="flex flex-col gap-4 pt-6">
        {sent ? (
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-lg font-semibold">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              We sent a sign-in link to <strong>{email}</strong>. Open it on this device to
              continue.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 text-center">
              <h1 className="text-lg font-semibold">Sign in to Booksy</h1>
              <p className="text-sm text-muted-foreground">
                We&apos;ll email you a link — no password needed.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
