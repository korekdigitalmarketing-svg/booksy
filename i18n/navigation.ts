import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware wrappers around Next.js navigation APIs — always import
// these instead of next/link or next/navigation directly in localized
// (app/[locale]/**) code, so links and redirects keep the /{locale} prefix
// and the current path/query string automatically.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
