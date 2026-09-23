import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: that file loads @vitejs/plugin-react
// and the PostHog plugin, built for Vite 8, while Vitest 3 runs on Vite 6 (see
// the vitest>vite override in the root package.json). esbuild's automatic JSX
// runtime is all the tests need.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // main.tsx (React bootstrap) is untested and deliberately still counted.
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/**/*.d.ts"],
      reporter: ["text", "text-summary"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
