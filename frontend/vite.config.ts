import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The `server` block only affects the Vite dev server (`vite dev`); the
// production build (`vite build`, served by Nginx) ignores it. In the dev
// container, VITE_PORT and VITE_API_PROXY are provided by compose.dev.yaml so
// `/api` calls are proxied to the backend just like Nginx does in production.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
