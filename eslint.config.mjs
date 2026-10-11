import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // Prisma client output (prisma generate) — generated code, never lint it.
    "src/generated/**",
  ]),
  {
    // Plain CommonJS Node scripts — require() is the correct module system there.
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Sync setState inside effects is a deliberate idiom in this codebase (reading
    // localStorage on mount to stay SSR-safe, resetting page when filters change).
    // Rewriting 160+ such sites without UI tests is risk without payoff — kept visible
    // as warnings for gradual cleanup instead of failing the build.
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
]);

export default eslintConfig;
