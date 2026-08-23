import { setRequestLocale } from "next-intl/server";
import { SuccessPoller } from "./success-poller";

type Props = {
  params: Promise<{ locale: string; accessToken: string }>;
};

export default async function BookingSuccessPage({ params }: Props) {
  const { locale, accessToken } = await params;
  setRequestLocale(locale);

  return <SuccessPoller locale={locale} accessToken={accessToken} />;
}
