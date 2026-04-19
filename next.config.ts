import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {};

export default withSentryConfig(nextConfig, {
  org: "zevallos-fg",
  project: "family-coordinator",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
