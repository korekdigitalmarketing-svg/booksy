import { Link, Text } from "@react-email/components";
import { DetailRow, EmailLayout, emailStyles } from "./layout";

export interface RescheduleClientEmailProps {
  t: {
    heading: string;
    greeting: string;
    body: string;
    footer: string;
    previousTimeLabel: string;
    newTimeLabel: string;
    confirmationNumberLabel: string;
    manageLinkText: string;
  };
  confirmationNumber: string;
  previousDateTimeText: string;
  newDateTimeText: string;
  manageUrl: string;
}

export function RescheduleClientEmail({
  t,
  confirmationNumber,
  previousDateTimeText,
  newDateTimeText,
  manageUrl,
}: RescheduleClientEmailProps) {
  return (
    <EmailLayout previewText={t.body} heading={t.heading} footerText={t.footer}>
      <Text style={emailStyles.text}>{t.greeting}</Text>
      <Text style={emailStyles.text}>{t.body}</Text>
      <DetailRow label={t.confirmationNumberLabel} value={confirmationNumber} />
      <DetailRow label={t.previousTimeLabel} value={previousDateTimeText} />
      <DetailRow label={t.newTimeLabel} value={newDateTimeText} />
      <Text style={emailStyles.text}>
        <Link href={manageUrl}>{t.manageLinkText}</Link>
      </Text>
    </EmailLayout>
  );
}
