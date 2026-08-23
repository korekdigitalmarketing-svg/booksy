import { Text } from "@react-email/components";
import { DetailRow, EmailLayout, emailStyles } from "./layout";

export interface ReminderEmailProps {
  t: {
    heading: string;
    greeting: string;
    body: string;
    footer: string;
    dateTimeLabel: string;
    locationLabel: string;
  };
  dateTimeText: string;
  locationText: string;
}

export function ReminderEmail({ t, dateTimeText, locationText }: ReminderEmailProps) {
  return (
    <EmailLayout previewText={t.body} heading={t.heading} footerText={t.footer}>
      <Text style={emailStyles.text}>{t.greeting}</Text>
      <Text style={emailStyles.text}>{t.body}</Text>
      <DetailRow label={t.dateTimeLabel} value={dateTimeText} />
      <DetailRow label={t.locationLabel} value={locationText} />
    </EmailLayout>
  );
}
