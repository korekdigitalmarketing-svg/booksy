import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";
import { QuestionSchema } from "@/lib/schemas/question";

export const runtime = "nodejs";

// PATCH /api/event-types/{id}/questions/{questionId} — host-only,
// RLS-scoped. The row's id never changes, so any bookings.custom_answers
// already keyed by it stay valid after an edit.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const { id, questionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", { message: "Invalid JSON body" });
  }

  const parsed = QuestionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", { issues: parsed.error.issues });
  }
  const input = parsed.data;

  const { data, error } = await supabase
    .from("event_type_questions")
    .update({
      label: input.label,
      question_type: input.questionType,
      options: input.options,
      is_required: input.isRequired,
      sort_order: input.sortOrder,
    })
    .eq("id", questionId)
    .eq("event_type_id", id)
    .select("id")
    .maybeSingle();

  if (error) return apiError("INTERNAL_ERROR", { message: error.message });
  if (!data) return apiError("QUESTION_NOT_FOUND");

  return NextResponse.json({ id: data.id });
}

// DELETE /api/event-types/{id}/questions/{questionId} — host-only,
// RLS-scoped. Existing bookings keep whatever answer they already
// collected in custom_answers; it just has no live question to render
// against on the dashboard going forward.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  const { id, questionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED");

  const { data, error } = await supabase
    .from("event_type_questions")
    .delete()
    .eq("id", questionId)
    .eq("event_type_id", id)
    .select("id")
    .maybeSingle();

  if (error) return apiError("INTERNAL_ERROR", { message: error.message });
  if (!data) return apiError("QUESTION_NOT_FOUND");

  return NextResponse.json({ ok: true });
}
