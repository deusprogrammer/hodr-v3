import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        playground: fileURLToPath(new URL("./index.html", import.meta.url)),
        help: fileURLToPath(new URL("./help.html", import.meta.url)),
      },
    },
  },
});
