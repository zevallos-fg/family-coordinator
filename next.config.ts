import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Allow photo uploads up to 10MB (default is 1MB)
      bodySizeLimit: "10mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  org: "zevallos-fg",
  project: "family-coordinator",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});