"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLocalized } from "@/lib/i18n-content";
import type { DashboardQuestion } from "@/lib/dashboard-data";

const LOCALES = ["en", "fr", "es"] as const;
const QUESTION_TYPES = ["text", "select"] as const;

interface QuestionsEditorProps {
  eventTypeId: string;
  hostDefaultLocale: string;
  initial: DashboardQuestion[];
}

type SortedQuestion = DashboardQuestion;

function sortByOrder(list: SortedQuestion[]): SortedQuestion[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function QuestionsEditor({ eventTypeId, hostDefaultLocale, initial }: QuestionsEditorProps) {
  const t = useTranslations("dashboard.eventTypes.questions");
  const [questions, setQuestions] = useState<SortedQuestion[]>(sortByOrder(initial));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SortedQuestion | null>(null);

  async function persist(
    payload: {
      label: Record<string, string>;
      questionType: "text" | "select";
      options: string[];
      isRequired: boolean;
      sortOrder: number;
    },
    questionId?: string,
  ): Promise<boolean> {
    const res = await fetch(
      questionId
        ? `/api/event-types/${eventTypeId}/questions/${questionId}`
        : `/api/event-types/${eventTypeId}/questions`,
      {
        method: questionId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      toast.error(data?.error?.message ?? t("errorToast"));
      return false;
    }
    if (questionId) {
      setQuestions((prev) =>
        sortByOrder(prev.map((q) => (q.id === questionId ? { ...q, ...payload } : q))),
      );
    } else {
      setQuestions((prev) => sortByOrder([...prev, { id: data.id, ...payload }]));
    }
    return true;
  }

  async function handleDelete(questionId: string) {
    const res = await fetch(`/api/event-types/${eventTypeId}/questions/${questionId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(t("errorToast"));
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    toast.success(t("deletedToast"));
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const a = questions[index];
    const b = questions[target];

    // Swap sort_order between the two adjacent rows — each PATCH sends
    // that question's full existing content back, since the route
    // replaces the whole row rather than patching a single field.
    const [okA, okB] = await Promise.all([
      persist(
        { label: a.label, questionType: a.questionType, options: a.options, isRequired: a.isRequired, sortOrder: b.sortOrder },
        a.id,
      ),
      persist(
        { label: b.label, questionType: b.questionType, options: b.options, isRequired: b.isRequired, sortOrder: a.sortOrder },
        b.id,
      ),
    ]);
    if (!okA || !okB) return;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">{t("heading")}</h2>
            <p className="text-xs text-muted-foreground">{t("hint")}</p>
          </div>
          <Dialog
            open={editorOpen}
            onOpenChange={(next) => {
              setEditorOpen(next);
              if (!next) setEditing(null);
            }}
          >
            <DialogTrigger
              className={buttonVariants({ variant: "outline", size: "sm" })}
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="size-4" /> {t("addButton")}
            </DialogTrigger>
            <QuestionEditorDialog
              hostDefaultLocale={hostDefaultLocale}
              editing={editing}
              nextSortOrder={questions.length}
              onSave={async (payload) => {
                const ok = await persist(payload, editing?.id);
                if (ok) {
                  setEditorOpen(false);
                  setEditing(null);
                  toast.success(t("savedToast"));
                }
                return ok;
              }}
            />
          </Dialog>
        </div>

        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noQuestions")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {questions.map((q, index) => (
              <div
                key={q.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {getLocalized(q.label, hostDefaultLocale, hostDefaultLocale)}
                    </p>
                    {q.isRequired ? (
                      <Badge variant="outline">{t("requiredBadge")}</Badge>
                    ) : null}
                    <Badge variant="secondary">{t(`typeOptions.${q.questionType}`)}</Badge>
                  </div>
                  {q.questionType === "select" ? (
                    <p className="text-xs text-muted-foreground">{q.options.join(", ")}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                    aria-label={t("moveUp")}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={index === questions.length - 1}
                    onClick={() => handleMove(index, 1)}
                    aria-label={t("moveDown")}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(q);
                      setEditorOpen(true);
                    }}
                    aria-label={t("editButton")}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger
                      className={buttonVariants({ variant: "ghost", size: "icon" })}
                      aria-label={t("deleteButton")}
                    >
                      <Trash2 className="size-4" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("deleteDialogBody")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(q.id)}>
                          {t("deleteButton")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuestionEditorDialog({
  hostDefaultLocale,
  editing,
  nextSortOrder,
  onSave,
}: {
  hostDefaultLocale: string;
  editing: SortedQuestion | null;
  nextSortOrder: number;
  onSave: (payload: {
    label: Record<string, string>;
    questionType: "text" | "select";
    options: string[];
    isRequired: boolean;
    sortOrder: number;
  }) => Promise<boolean>;
}) {
  const t = useTranslations("dashboard.eventTypes.questions");
  const [label, setLabel] = useState<Record<string, string>>(editing?.label ?? {});
  const [questionType, setQuestionType] = useState<(typeof QUESTION_TYPES)[number]>(
    editing?.questionType ?? "text",
  );
  const [optionsText, setOptionsText] = useState((editing?.options ?? []).join("\n"));
  const [isRequired, setIsRequired] = useState(editing?.isRequired ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed local state whenever a different question (or "new") opens —
  // Dialog stays mounted across opens, so without this the form would
  // keep showing whatever was last edited.
  const [seededFor, setSeededFor] = useState(editing?.id ?? null);
  if (seededFor !== (editing?.id ?? null)) {
    setSeededFor(editing?.id ?? null);
    setLabel(editing?.label ?? {});
    setQuestionType(editing?.questionType ?? "text");
    setOptionsText((editing?.options ?? []).join("\n"));
    setIsRequired(editing?.isRequired ?? false);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    const options = optionsText
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
    if (questionType === "select" && options.length < 2) {
      setError(t("optionsRequiredError"));
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onSave({
        label,
        questionType,
        options,
        isRequired,
        sortOrder: editing?.sortOrder ?? nextSortOrder,
      });
      if (!ok) setError(t("errorToast"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? t("editDialogTitle") : t("addDialogTitle")}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>{t("labelLabel")}</Label>
          <Tabs defaultValue={hostDefaultLocale}>
            <TabsList>
              {LOCALES.map((loc) => (
                <TabsTrigger key={loc} value={loc}>
                  {loc.toUpperCase()}
                  {loc === hostDefaultLocale ? " *" : ""}
                </TabsTrigger>
              ))}
            </TabsList>
            {LOCALES.map((loc) => (
              <TabsContent key={loc} value={loc}>
                <Input
                  value={label[loc] ?? ""}
                  required={loc === hostDefaultLocale}
                  onChange={(e) => setLabel((prev) => ({ ...prev, [loc]: e.target.value }))}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="question-type">{t("typeLabel")}</Label>
          {/* Plain native select, not the portal-based Select component:
              nested inside this Dialog, the portaled Select's popup sits
              outside the Dialog's own DOM subtree, and selecting an item
              retargets the closing click onto the Dialog's backdrop —
              closing the whole dialog and discarding the form. A native
              select has no portal, so it can't collide with the Dialog's
              outside-press dismissal. */}
          <select
            id="question-type"
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value as typeof questionType)}
            className="flex h-8 w-fit items-center rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`typeOptions.${type}`)}
              </option>
            ))}
          </select>
        </div>

        {questionType === "select" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="question-options">{t("optionsLabel")}</Label>
            <Textarea
              id="question-options"
              rows={4}
              placeholder={t("optionsPlaceholder")}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Switch id="question-required" checked={isRequired} onCheckedChange={setIsRequired} />
          <Label htmlFor="question-required">{t("requiredLabel")}</Label>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <DialogFooter>
        <DialogClose className={buttonVariants({ variant: "outline" })}>
          {t("cancelButton")}
        </DialogClose>
        <Button type="button" disabled={submitting} onClick={handleSubmit}>
          {submitting ? t("savingButton") : t("saveButton")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
