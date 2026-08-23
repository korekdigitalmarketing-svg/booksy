import { Text } from "@react-email/components";
import { DetailRow, EmailLayout, emailStyles } from "./layout";

export interface RescheduleHostEmailProps {
  t: {
    heading: string;
    greeting: string;
    body: string;
    footer: string;
    previousTimeLabel: string;
    newTimeLabel: string;
  };
  previousDateTimeText: string;
  newDateTimeText: string;
}

export function RescheduleHostEmail({
  t,
  previousDateTimeText,
  newDateTimeText,
}: RescheduleHostEmailProps) {
  return (
    <EmailLayout previewText={t.body} heading={t.heading} footerText={t.footer}>
      <Text style={emailStyles.text}>{t.greeting}</Text>
      <Text style={emailStyles.text}>{t.body}</Text>
      <DetailRow label={t.previousTimeLabel} value={previousDateTimeText} />
      <DetailRow label={t.newTimeLabel} value={newDateTimeText} />
    </EmailLayout>
  );
}
