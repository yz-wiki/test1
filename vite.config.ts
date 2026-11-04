import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * The rebuilt frontend lives in `web/`.
 *
 * `src/` is the previous React application. It stays in the tree while features
 * are ported, but it is no longer compiled or bundled — so both can coexist
 * until the port is done, and then `src/` is deleted.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./web", import.meta.url)),
  plugins: [svelte()],

  // Treat font files as static binary assets — prevents Vite from processing
  // or re-encoding them, which corrupts woff2/ttf files.
  assetsInclude: ["**/*.woff", "**/*.woff2", "**/*.ttf", "**/*.otf"],

  build: {
    outDir: fileURLToPath(new URL("./dist", import.meta.url)),
    emptyOutDir: true,
    target: "chrome110",
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/src/**"],
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
