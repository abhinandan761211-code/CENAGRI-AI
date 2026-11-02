import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * QA-only harness config (temporary). Mounts the real app with the data layer
 * swapped for fixtures (`src/lib/creator.qa-stub.ts`, `src/qa/adminApi.qa.ts`)
 * and a signed-in auth provider, so the Kisan Video Hub, Creator Studio and
 * Admin Panel render without Supabase credentials. Not used by `vite` or
 * `vite build`.
 */
const src = path.resolve(__dirname, "./src");

function qaSwaps(): Plugin {
  return {
    name: "cenagri-qa-swaps",
    enforce: "pre",
    /**
     * Map the ADMIN PREFIX, never the bare "@": aliasing "@" itself makes Vite
     * treat every "@/…" import as an external id, and the swaps then never run.
     */
    resolveId(source) {
      if (source === "@/lib/creator" || source.endsWith("/lib/creator")) return path.resolve(src, "lib/creator.qa-stub.ts");
      if (source === "@/hooks/useAuth" || source.endsWith("/hooks/useAuth")) return path.resolve(src, "qa/useAuth.qa.tsx");
      if (source === "@/lib/admin/api" || source.endsWith("/lib/admin/api")) return path.resolve(src, "qa/adminApi.qa.ts");
      return null;
    },
  };
}

export default defineConfig({
  root: __dirname,
  plugins: [qaSwaps(), react()],
  resolve: {
    // The real alias does the "@/…" → src/… mapping, exactly as production.
    // The swap plugin runs first (`enforce: "pre"`) and only hijacks the three
    // modules it replaces, so it never has to re-implement alias resolution.
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // Separate cache dir: the swaps differ from the normal build, and a shared
  // optimize cache would serve pre-bundled modules resolved without them.
  cacheDir: path.resolve(__dirname, "./node_modules/.vite-qa"),
  server: { port: 5210, strictPort: true },
});
