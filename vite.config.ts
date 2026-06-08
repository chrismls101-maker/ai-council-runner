import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiSecret = env.GLASS_API_SECRET?.trim();

  return {
    plugins: [react()],
    build: {
      outDir: "dist/client",
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          glassLogoPrototype: path.resolve(__dirname, "prototypes/glass-logo/index.html"),
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
          configure: (proxy) => {
            if (!apiSecret) return;
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("Authorization", `Bearer ${apiSecret}`);
            });
          },
        },
      },
    },
  };
});
