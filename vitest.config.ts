import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "src/app"),
      "@auth": path.resolve(__dirname, "src/auth"),
      "@devices": path.resolve(__dirname, "src/devices"),
      "@handlers": path.resolve(__dirname, "src/handlers"),
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
});
