import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { localRelayPlugin } from "./vite-plugin-relay";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localRelayPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: true,
  },
});
