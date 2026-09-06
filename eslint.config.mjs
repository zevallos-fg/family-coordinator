import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noFloatingSupabaseError from "./eslint-rules/no-floating-supabase-error.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // A PostgREST call returns { data, error }. Dropping the error half is how a
  // dead API key became 200s, a missing column became "no shifts this week", and
  // every trip's prep tasks became nothing at all — four times in one week.
  // Warning rather than error for now: the existing count is large and fixing
  // them needs a decision each, not a codemod. Turn it up once that is done.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "skills/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    plugins: { local: { rules: { "no-floating-supabase-error": noFloatingSupabaseError } } },
    rules: { "local/no-floating-supabase-error": "warn" },
  },
]);

export default eslintConfig;
