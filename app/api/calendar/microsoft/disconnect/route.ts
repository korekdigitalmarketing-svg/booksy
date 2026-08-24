import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiError } from "@/lib/api-errors";
import { stopSubscription } from "@/lib/calendar-sync-microsoft";

export const runtime = "nodejs";

// POST /api/calendar/microsoft/disconnect — host-only. Stops the Graph
// subscription (best-effort) and deletes the connection row; deleting it
// cascades to calendar_busy_blocks via the FK, so no separate cleanup
// step is needed there.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED");

  const { data: connection } = await supabase
    .from("calendar_connections")
    .select("id, access_token, channel_id")
    .eq("owner_id", user.id)
    .eq("provider", "microsoft")
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ ok: true });
  }

  if (connection.channel_id) {
    await stopSubscription(connection.access_token, connection.channel_id);
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.from("calendar_connections").delete().eq("id", connection.id);
  if (error) return apiError("INTERNAL_ERROR", { message: error.message });

  return NextResponse.json({ ok: true });
}
