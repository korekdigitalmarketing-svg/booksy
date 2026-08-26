import { Body, Container, Head, Hr, Html, Preview, Text } from "@react-email/components";
import type { ReactNode } from "react";

// Plain inline styles, not Tailwind — email clients strip external/class
// CSS unreliably, and this template is simple enough that hand-written
// inline styles are more predictable than trusting a Tailwind-to-inline
// compile step for something this brittle.
const colors = {
  ink: "#14171f",
  muted: "#5b6270",
  border: "#e4e2db",
  paper: "#f7f6f2",
  primary: "#1d2a63",
};

const styles = {
  body: {
    backgroundColor: colors.paper,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: "24px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    border: `1px solid ${colors.border}`,
    margin: "0 auto",
    maxWidth: "480px",
    padding: "32px",
  },
  brand: {
    color: colors.primary,
    fontSize: "14px",
    fontWeight: 700,
    letterSpacing: "0.02em",
    margin: "0 0 24px",
    textTransform: "uppercase" as const,
  },
  heading: {
    color: colors.ink,
    fontSize: "22px",
    fontWeight: 700,
    margin: "0 0 16px",
  },
  text: {
    color: colors.ink,
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 12px",
  },
  hr: {
    borderColor: colors.border,
    margin: "24px 0",
  },
  footer: {
    color: colors.muted,
    fontSize: "12px",
    margin: 0,
  },
};

export function EmailLayout({
  previewText,
  heading,
  footerText,
  children,
}: {
  previewText: string;
  heading: string;
  footerText: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>Korek Booking</Text>
          <Text style={styles.heading}>{heading}</Text>
          {children}
          <Hr style={styles.hr} />
          <Text style={styles.footer}>{footerText}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.text}>
      <strong>{label}:</strong> {value}
    </Text>
  );
}

export { styles as emailStyles };
