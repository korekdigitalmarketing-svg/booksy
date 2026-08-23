import { Text } from "@react-email/components";
import { DetailRow, EmailLayout, emailStyles } from "./layout";

export interface CancellationHostEmailProps {
  t: {
    heading: string;
    greeting: string;
    body: string;
    footer: string;
    dateTimeLabel: string;
    cancelledByText: string; // pre-resolved: cancelledByHost or cancelledByClient
    reasonLabel: string;
  };
  dateTimeText: string;
  reason: string | null;
}

export function CancellationHostEmail({ t, dateTimeText, reason }: CancellationHostEmailProps) {
  return (
    <EmailLayout previewText={t.body} heading={t.heading} footerText={t.footer}>
      <Text style={emailStyles.text}>{t.greeting}</Text>
      <Text style={emailStyles.text}>{t.body}</Text>
      <DetailRow label={t.dateTimeLabel} value={dateTimeText} />
      <Text style={emailStyles.text}>{t.cancelledByText}</Text>
      {reason ? <DetailRow label={t.reasonLabel} value={reason} /> : null}
    </EmailLayout>
  );
}
