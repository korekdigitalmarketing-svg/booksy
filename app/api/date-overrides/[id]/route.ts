import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED");

  const { error } = await supabase.from("date_overrides").delete().eq("id", id);
  if (error) {
    return apiError("INTERNAL_ERROR", { message: error.message });
  }

  return NextResponse.json({ ok: true });
}
