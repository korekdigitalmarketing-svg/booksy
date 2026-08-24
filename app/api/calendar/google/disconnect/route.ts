import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiError } from "@/lib/api-errors";
import { stopWatchChannel } from "@/lib/calendar-sync";

export const runtime = "nodejs";

// POST /api/calendar/google/disconnect — host-only. Stops the Google
// watch channel (best-effort) and deletes the connection row; deleting it
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
    .select("id, access_token, channel_id, resource_id")
    .eq("owner_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ ok: true });
  }

  if (connection.channel_id && connection.resource_id) {
    await stopWatchChannel(connection.access_token, connection.channel_id, connection.resource_id);
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.from("calendar_connections").delete().eq("id", connection.id);
  if (error) return apiError("INTERNAL_ERROR", { message: error.message });

  return NextResponse.json({ ok: true });
}
