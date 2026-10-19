import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  js.configs.recommended,
  ...ts.configs.recommended,
  reactHooks.configs.flat.recommended,
  { languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } } },
  globalIgnores(["**/.next/**", "**/next-env.d.ts", "**/generated/**"]),
]);
