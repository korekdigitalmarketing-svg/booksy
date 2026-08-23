import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireHostProfile, getEventTypeById, getEventTypeQuestions } from "@/lib/dashboard-data";
import { EventTypeForm } from "../event-type-form";
import { QuestionsEditor } from "../questions-editor";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditEventTypePage({ params }: Props) {
  const { id } = await params;
  const profile = await requireHostProfile();
  const t = await getTranslations("dashboard.eventTypes");

  const eventType = await getEventTypeById(id);
  if (!eventType) notFound();
  const questions = await getEventTypeQuestions(eventType.id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-heading font-semibold tracking-tight">{t("editHeading")}</h1>
      <EventTypeForm
        hostSlug={profile.slug}
        hostDefaultLocale={profile.locale}
        eventTypeId={eventType.id}
        initial={eventType}
      />
      <QuestionsEditor
        eventTypeId={eventType.id}
        hostDefaultLocale={profile.locale}
        initial={questions}
      />
    </div>
  );
}
