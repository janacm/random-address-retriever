import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname, "../..")],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/healthz": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
