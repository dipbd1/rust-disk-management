import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

/** A dying page must not send the tab to the plugin's disconnect screen during Vite reloads. */
function keepRemoteUiOnReload() {
  return {
    name: "keep-remote-ui-on-reload",
    transform(code: string, id: string) {
      if (!id.replace(/\\/g, "/").endsWith("tauri-remote-ui/socket.js")) return;
      const patched = code
        .replace(
          "let ws = null;",
          "let ws = null;\nlet pageUnloading = false;\nwindow.addEventListener('pagehide', () => { pageUnloading = true; });",
        )
        .replace(
          "window.location.href = getDisconnectUrl();",
          "if (!pageUnloading) setTimeout(() => { if (!pageUnloading) initWebSocket(); }, 400);",
        );
      if (!patched.includes("setTimeout(() => { if (!pageUnloading) initWebSocket(); }, 400)")) {
        throw new Error("tauri-remote-ui socket.js changed; the browser reconnect patch did not apply");
      }
      return patched;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [keepRemoteUiOnReload(), tailwindcss(), react()],
  optimizeDeps: {
    exclude: ["tauri-remote-ui"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
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
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // Browser sessions reach the Tauri remote-ui server started in lib.rs.
    proxy: {
      "/remote_ui_info": { target: "http://localhost:9090", changeOrigin: true },
      "/remote_ui_disconnect": { target: "http://localhost:9090", changeOrigin: true },
      "/remote_ui_ws": { target: "http://localhost:9090", changeOrigin: true, ws: true },
    },
  },
}));
