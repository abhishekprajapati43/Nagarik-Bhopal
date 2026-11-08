import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * This project runs directly from index.html through VS Code Live Server.
 * `npm run build` bundles main.jsx and every imported CSS file into ./assets
 * with stable file names (app.js / app.css), so no Vite dev server and no
 * .jsx loading is needed at runtime.
 */
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "assets",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: `${rootDir}main.jsx`,
      output: {
        entryFileNames: "app.js",
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          const fileName = assetInfo.names?.[0] ?? assetInfo.name ?? "";
          return fileName.endsWith(".css") ? "app.css" : "[name][extname]";
        },
      },
    },
  },
});
