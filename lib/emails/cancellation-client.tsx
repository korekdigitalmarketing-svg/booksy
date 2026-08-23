import { Text } from "@react-email/components";
import { DetailRow, EmailLayout, emailStyles } from "./layout";

export interface CancellationClientEmailProps {
  t: {
    heading: string;
    greeting: string;
    body: string;
    footer: string;
    dateTimeLabel: string;
    cancelledByText: string; // pre-resolved: cancelledByHost or cancelledByClient
    reasonLabel: string;
    refundNote: string;
  };
  dateTimeText: string;
  reason: string | null;
  wasPaid: boolean;
}

export function CancellationClientEmail({
  t,
  dateTimeText,
  reason,
  wasPaid,
}: CancellationClientEmailProps) {
  return (
    <EmailLayout previewText={t.body} heading={t.heading} footerText={t.footer}>
      <Text style={emailStyles.text}>{t.greeting}</Text>
      <Text style={emailStyles.text}>{t.body}</Text>
      <DetailRow label={t.dateTimeLabel} value={dateTimeText} />
      <Text style={emailStyles.text}>{t.cancelledByText}</Text>
      {reason ? <DetailRow label={t.reasonLabel} value={reason} /> : null}
      {wasPaid ? <Text style={emailStyles.text}>{t.refundNote}</Text> : null}
    </EmailLayout>
  );
}
