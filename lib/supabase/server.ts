import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

// Anon-key client for Server Components, Server Actions and Route Handlers,
// scoped to the signed-in host via their session cookie. Still fully
// subject to RLS — this is "the current user's view of the database", not
// an admin client. Use lib/supabase/service.ts when you deliberately need
// to bypass RLS (webhooks, cron, slot writes).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component that can't write cookies —
            // safe to ignore as long as middleware refreshes the session.
          }
        },
      },
    },
  );
}
