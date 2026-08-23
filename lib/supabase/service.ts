import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Service-role client. Bypasses RLS entirely — this is how `bookings` gets
// written (see section 4: "Writes to bookings happen only server-side with
// the service role key, never from the browser"). The `server-only` import
// above makes it a build error to pull this into any Client Component
// bundle, not just a runtime footgun.
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
