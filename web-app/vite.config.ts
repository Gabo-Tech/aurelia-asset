import { defineConfig, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Linux desktop path: React Native Web build of the tracker.
 * Native llama.rn / sherpa-onnx are unavailable here — NLU + optional browser speech only.
 */
export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [
    {
      name: "treat-js-as-jsx",
      enforce: "pre",
      async transform(code, id) {
        if (!id.includes("node_modules/react-native-markdown-display/") || !id.endsWith(".js")) {
          return null;
        }
        return transformWithEsbuild(code, id, {
          loader: "jsx",
          jsx: "automatic",
        });
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      "react-native": "react-native-web",
      "@": path.resolve(__dirname, "../src"),
      "llama.rn": path.resolve(__dirname, "shims/empty.ts"),
      "@siteed/sherpa-onnx.rn": path.resolve(__dirname, "shims/empty.ts"),
      "react-native-blob-util": path.resolve(__dirname, "shims/empty.ts"),
      "react-native-fs": path.resolve(__dirname, "shims/empty.ts"),
      "react-native-share": path.resolve(__dirname, "shims/empty.ts"),
      "@react-native-documents/picker": path.resolve(__dirname, "shims/empty.ts"),
      "react-native-view-shot": path.resolve(__dirname, "shims/empty.ts"),
      "react-native-live-audio-stream": path.resolve(__dirname, "shims/empty.ts"),
      "react-native-permissions": path.resolve(__dirname, "shims/permissions.ts"),
    },
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".web.js", ".js"],
  },
  define: {
    global: "window",
    __DEV__: JSON.stringify(true),
  },
  optimizeDeps: {
    include: ["react-native-web"],
    esbuildOptions: {
      resolveExtensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".web.js", ".js"],
      loader: { ".js": "jsx" },
    },
  },
  server: { port: 5174 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
