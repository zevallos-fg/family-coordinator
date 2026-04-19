import { defineConfig } from "vitest/config";
import path from "path";
import { config } from "dotenv";

// Load .env.local for test runs
config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/tests.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/__mocks__/server-only.ts"),
    },
  },
});
