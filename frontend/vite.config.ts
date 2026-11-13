import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
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
  const apiPort = env.API_PORT?.trim();
  const isTest = mode === "test";

  return {
    plugins: [
      ...(isTest
        ? []
        : [
            tanstackStart({
              spa: {
                enabled: true,
              },
            }),
          ]),
      tailwindcss(),
      viteReact(),
    ],
    test: {
      environment: "jsdom",
    },
    server:
      !isTest && apiPort
        ? {
            proxy: {
              "/api": {
                target: `http://127.0.0.1:${apiPort}`,
                changeOrigin: true,
                timeout: 3_600_000,
                proxyTimeout: 3_600_000,
              },
            },
          }
        : undefined,
  };
});
