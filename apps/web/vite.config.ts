import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // predictable dev port (3000 is often already in use)
    proxy: {
      // Proxy all /api/* requests to the Hono backend during development.
      // The prefix is stripped so GET /api/health → GET /health on the API.
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
