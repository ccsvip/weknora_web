import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

function projectRoot() {
  const pathname = decodeURIComponent(new URL("..", import.meta.url).pathname);
  if (/^\/[A-Za-z]:\//.test(pathname)) {
    return pathname.slice(1);
  }
  return pathname;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot(), "");
  const webPort = env.WEB_PORT?.trim();

  return {
    plugins: [react()],
    test: {
      environment: "jsdom",
    },
    server: webPort
      ? {
          proxy: {
            "/api": {
              target: `http://127.0.0.1:${webPort}`,
              changeOrigin: true,
            },
          },
        }
      : undefined,
  };
});
