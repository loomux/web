import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Production serves the client and API from the same loomuxd origin
    // (docs/design/web-client-design.md "Hosting / serving integration"),
    // so the app code never needs an API base URL. In dev, this proxy
    // stands in for that same-origin setup against a local loomuxd
    // (default LOOMUX_HTTP_ADDR :8080).
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // e2e/ is Playwright's (npm run e2e), against a real server.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
