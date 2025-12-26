import { defineConfig } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginVue()],

  resolve: {
    alias: {
      "@": "./src",
    },
  },

  html: {
    title: "Reader",
    meta: {
      viewport:
        "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
      description: "Web Reader Application",
      "theme-color": "#ffffff",
    },
    tags: [
      { tag: "link", attrs: { rel: "manifest", href: "/manifest.json" } },
      { tag: "link", attrs: { rel: "apple-touch-icon", href: "/favicon.png" } },
      {
        tag: "link",
        attrs: {
          rel: "stylesheet",
          href: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/style.css",
        },
      },
    ],
  },

  // 性能优化：代码分割（使用默认策略，rsbuild 会自动优化）
  performance: {
    chunkSplit: {
      strategy: "split-by-experience",
    },
  },

  output: {
    distPath: {
      root: "../src/main/resources/web",
    },
    cleanDistPath: true,
    // 文件名包含 hash，便于缓存
    filename: {
      js: "[name].[contenthash:8].js",
      css: "[name].[contenthash:8].css",
    },
    // 压缩配置（rsbuild 会根据 NODE_ENV 自动处理，生产环境默认启用）
    // terserOptions 会在生产构建时自动应用
  },

  server: {
    port: 5173,
    proxy: {
      "/reader3": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
