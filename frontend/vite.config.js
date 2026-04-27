const { defineConfig } = require("vite");
const vue = require("@vitejs/plugin-vue");
const path = require("path");

module.exports = defineConfig({
  root: __dirname,
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
  },
});
