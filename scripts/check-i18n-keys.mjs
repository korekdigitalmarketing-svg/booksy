// Fails the build if messages/{en,fr,es}.json don't have identical key sets.
// A missing key silently falls back to the key path at runtime; an orphaned
// key is dead weight a translator will edit for no effect. Both are bugs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const locales = ["en", "fr", "es"];
const messagesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "messages",
);

function flattenKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return flattenKeys(value, fullKey);
    }
    return [fullKey];
  });
}

const keySets = new Map();
for (const locale of locales) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const json = JSON.parse(readFileSync(filePath, "utf-8"));
  keySets.set(locale, new Set(flattenKeys(json)));
}

const [baseLocale, ...otherLocales] = locales;
const baseKeys = keySets.get(baseLocale);
let hasError = false;

for (const locale of otherLocales) {
  const keys = keySets.get(locale);
  const missing = [...baseKeys].filter((k) => !keys.has(k));
  const orphaned = [...keys].filter((k) => !baseKeys.has(k));

  if (missing.length > 0) {
    hasError = true;
    console.error(`\n[i18n] ${locale}.json is missing keys present in ${baseLocale}.json:`);
    for (const key of missing) console.error(`  - ${key}`);
  }
  if (orphaned.length > 0) {
    hasError = true;
    console.error(`\n[i18n] ${locale}.json has orphaned keys not present in ${baseLocale}.json:`);
    for (const key of orphaned) console.error(`  - ${key}`);
  }
}

if (hasError) {
  console.error("\n[i18n] Key parity check failed.\n");
  process.exit(1);
} else {
  console.log(`[i18n] Key parity OK across ${locales.join(", ")} (${baseKeys.size} keys).`);
}
