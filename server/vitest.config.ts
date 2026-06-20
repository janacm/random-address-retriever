import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Integration tests open a real pg pool; give them room and run serially.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
