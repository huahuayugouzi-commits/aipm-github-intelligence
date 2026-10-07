import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [".next/**", "node_modules/**"],
    env: {
      DATABASE_PATH: "./data/aipm.test.db",
      DATA_MODE: "mock",
      AI_PROVIDER: "mock"
    },
    sequence: { concurrent: false }
  }
});
