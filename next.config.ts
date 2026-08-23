import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: {
    // Pins the workspace root to this project — without it, Turbopack
    // searches upward for the nearest lockfile/git root and can land on a
    // parent directory (e.g. a OneDrive- or user-profile-level checkout).
    root: __dirname,
  },
};

export default withNextIntl(nextConfig);
