import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-errors";
import { QuestionSchema } from "@/lib/schemas/question";

export const runtime = "nodejs";

// GET /api/event-types/{id}/questions — host-only, RLS-scoped.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED");

  const { data, error } = await supabase
    .from("event_type_questions")
    .select("id, label, question_type, options, is_required, sort_order")
    .eq("event_type_id", id)
    .order("sort_order", { ascending: true });

  if (error) return apiError("INTERNAL_ERROR", { message: error.message });

  return NextResponse.json({
    questions: (data ?? []).map((q) => ({
      id: q.id,
      label: (q.label ?? {}) as Record<string, string>,
      questionType: q.question_type,
      options: (q.options ?? []) as string[],
      isRequired: q.is_required,
      sortOrder: q.sort_order,
    })),
  });
}

// POST /api/event-types/{id}/questions — host-only. Each question is its
// own row with its own stable id, created individually rather than via a
// replace-all payload: bookings.custom_answers is keyed by question id, so
// an edit to one question must never reassign another question's id.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  // RLS's `owner_id = auth.uid()` WITH CHECK only constrains the row being
  // inserted — it says nothing about which event_type_id that row points
  // at. Without this check a host could POST their own owner_id alongside
  // someone else's event_type_id in the URL and inject a question (and
  // therefore an answer field) onto another host's public booking page.
  const { data: eventType, error: eventTypeError } = await supabase
    .from("event_types")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (eventTypeError) return apiError("INTERNAL_ERROR", { message: eventTypeError.message });
  if (!eventType) return apiError("EVENT_TYPE_NOT_FOUND");

  const { data, error } = await supabase
    .from("event_type_questions")
    .insert({
      owner_id: user.id,
      event_type_id: id,
      label: input.label,
      question_type: input.questionType,
      options: input.options,
      is_required: input.isRequired,
      sort_order: input.sortOrder,
    })
    .select("id")
    .single();

  if (error) return apiError("INTERNAL_ERROR", { message: error.message });

  return NextResponse.json({ id: data.id });
}
