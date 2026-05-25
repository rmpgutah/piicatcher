import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port and host so the Rust shell can connect to the dev server.
const host = process.env.TAURI_DEV_HOST;
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  // Mirror the `@/*` path alias declared in tsconfig.json so Rollup resolves
  // it during the production build (Vite doesn't read tsconfig paths on its own).
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
