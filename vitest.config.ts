import { defineConfig } from "vitest/config";
import path from "path";

const root = process.cwd();

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
      "@app": path.resolve(root, "src/app"),
      "@auth": path.resolve(root, "src/auth"),
      "@devices": path.resolve(root, "src/devices"),
      "@handlers": path.resolve(root, "src/handlers"),
      "@shared": path.resolve(root, "src/shared"),
    },
  },
});
