import { existsSync, readFileSync } from "node:fs";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "CALENDAR_TOKEN_ENCRYPTION_KEY",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALENDAR_WEBHOOK_TOKEN",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_CALENDAR_WEBHOOK_TOKEN",
];

function parseDotenv(path) {
  if (!existsSync(path)) {
    return {};
  }

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .reduce((values, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return values;
      }

      const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) {
        return values;
      }

      const [, key, rawValue] = match;
      const withoutComment = rawValue.replace(/\s+#.*$/, "").trim();
      values[key] = withoutComment.replace(/^['"]|['"]$/g, "");
      return values;
    }, {});
}

const fileValues = parseDotenv(".env.local");
const values = { ...fileValues, ...process.env };

function isFilled(value) {
  return Boolean(value && value.trim() && !/^changeme|placeholder|todo$/i.test(value.trim()));
}

const missing = required.filter((key) => !isFilled(values[key]));
const issues = [];

if (isFilled(values.NEXT_PUBLIC_APP_URL)) {
  try {
    new URL(values.NEXT_PUBLIC_APP_URL);
  } catch {
    issues.push("NEXT_PUBLIC_APP_URL must be a valid absolute URL.");
  }
}

if (isFilled(values.CALENDAR_TOKEN_ENCRYPTION_KEY)) {
  try {
    const bytes = Buffer.from(values.CALENDAR_TOKEN_ENCRYPTION_KEY, "base64");
    if (bytes.length !== 32) {
      issues.push("CALENDAR_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
    }
  } catch {
    issues.push("CALENDAR_TOKEN_ENCRYPTION_KEY must be valid base64.");
  }
}

if (missing.length || issues.length) {
  console.error("Launch environment is not ready.");
  if (missing.length) {
    console.error(`Missing or placeholder values: ${missing.join(", ")}`);
  }
  for (const issue of issues) {
    console.error(issue);
  }
  process.exit(1);
}

console.log("Launch environment looks complete. Secret values were not printed.");
