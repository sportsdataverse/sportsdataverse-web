// Next 16 removed `next lint`; this is the flat ESLint config. `nextPlugin.configs["core-web-vitals"]`
// is a bare object with no `files`/parser, so ESLint 9 silently skipped every .ts/.tsx ("File
// ignored because no matching configuration was supplied", exit 0) — `eslint-config-next`'s own
// flat exports (already installed) carry the TS parser + `files` globs that were missing.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "@next/next/no-img-element": "off" } },
  {
    // ratchet: pre-existing `any` at data boundaries when TS lint was first enabled
    // (20 findings, 2026-09-26). Narrow these files as they're touched; never add
    // a path to this list.
    files: [
      "app/(site)/packages/page.tsx",
      "app/api/packages/route.ts",
      "app/api/projects/route.ts",
    ],
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
  globalIgnores([".next/**", "out/**", "public/**", "next-env.d.ts"]),
]);

export default eslintConfig;
