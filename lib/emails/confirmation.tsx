import { Text } from "@react-email/components";
import { DetailRow, EmailLayout, emailStyles } from "./layout";

export interface ConfirmationEmailProps {
  t: {
    heading: string;
    greeting: string;
    body: string;
    footer: string;
    dateTimeLabel: string;
    locationLabel: string;
    priceLabel: string;
    notesLabel: string;
    confirmationNumberLabel: string;
  };
  confirmationNumber: string;
  dateTimeText: string;
  locationText: string;
  priceText: string | null;
  notes: string | null;
}

export function ConfirmationEmail({
  t,
  confirmationNumber,
  dateTimeText,
  locationText,
  priceText,
  notes,
}: ConfirmationEmailProps) {
  return (
    <EmailLayout previewText={t.body} heading={t.heading} footerText={t.footer}>
      <Text style={emailStyles.text}>{t.greeting}</Text>
      <Text style={emailStyles.text}>{t.body}</Text>
      <DetailRow label={t.confirmationNumberLabel} value={confirmationNumber} />
      <DetailRow label={t.dateTimeLabel} value={dateTimeText} />
      <DetailRow label={t.locationLabel} value={locationText} />
      {priceText ? <DetailRow label={t.priceLabel} value={priceText} /> : null}
      {notes ? <DetailRow label={t.notesLabel} value={notes} /> : null}
    </EmailLayout>
  );
}
