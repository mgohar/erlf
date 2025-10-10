import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    allowedHosts: ["hypnoid-equilibristic-matteo.ngrok-free.dev"],
  },
});
