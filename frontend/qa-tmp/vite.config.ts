// TEMPORARY QA config — deleted after verification.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

export default defineConfig({
  root: ROOT,
  plugins: [react()],
  resolve: { alias: { "@": path.join(ROOT, "src") } },
  server: {
    port: 5177,
    proxy: { "/api": { target: "http://127.0.0.1:8001", changeOrigin: true } },
  },
});
