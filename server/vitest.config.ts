import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integration tests open a real pg pool; give them room and run serially.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Applies to `vitest run --coverage` (pnpm test:coverage, used by CI).
    // index.ts (process bootstrap) is untested and deliberately still counted.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
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
