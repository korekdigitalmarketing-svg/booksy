import { Text } from "@react-email/components";
import { DetailRow, EmailLayout, emailStyles } from "./layout";

export interface HostNotificationEmailProps {
  t: {
    heading: string;
    greeting: string;
    body: string;
    footer: string;
    dateTimeLabel: string;
    locationLabel: string;
    contactLabel: string;
    notesLabel: string;
  };
  dateTimeText: string;
  locationText: string;
  inviteeEmail: string;
  inviteePhone: string | null;
  notes: string | null;
  answers: { label: string; value: string }[];
}

export function HostNotificationEmail({
  t,
  dateTimeText,
  locationText,
  inviteeEmail,
  inviteePhone,
  notes,
  answers,
}: HostNotificationEmailProps) {
  const contact = inviteePhone ? `${inviteeEmail} · ${inviteePhone}` : inviteeEmail;

  return (
    <EmailLayout previewText={t.body} heading={t.heading} footerText={t.footer}>
      <Text style={emailStyles.text}>{t.greeting}</Text>
      <Text style={emailStyles.text}>{t.body}</Text>
      <DetailRow label={t.dateTimeLabel} value={dateTimeText} />
      <DetailRow label={t.locationLabel} value={locationText} />
      <DetailRow label={t.contactLabel} value={contact} />
      {notes ? <DetailRow label={t.notesLabel} value={notes} /> : null}
      {answers.map((a) => (
        <DetailRow key={a.label} label={a.label} value={a.value} />
      ))}
    </EmailLayout>
  );
}
