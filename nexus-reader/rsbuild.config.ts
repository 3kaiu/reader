import { defineConfig } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginVue()],

  tools: {
    rspack: {
      ignoreWarnings: [
        /Critical dependency: Accessing import.meta directly is unsupported/,
      ],
    },
  },


  resolve: {
    alias: {
      "@": "./src",
    },
  },

  html: {
    title: "Nexus Reader",
    meta: {
      viewport:
        "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no",
      description: "AI-powered novel reader for self-hosted NAS",
      "theme-color": "#ffffff",
    },
    tags: [
      { tag: "link", attrs: { rel: "manifest", href: "/manifest.json" } },
      { tag: "link", attrs: { rel: "apple-touch-icon", href: "/favicon.png" } },
      // 预解析 CDN 域名，加快字体加载
      { tag: "link", attrs: { rel: "preconnect", href: "https://cdn.jsdelivr.net" } },
      { tag: "link", attrs: { rel: "dns-prefetch", href: "https://cdn.jsdelivr.net" } },
      {
        tag: "link",
        attrs: {
          rel: "stylesheet",
          href: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/style.css",
          // 预加载策略
          media: "all",
        },
      },
      // 预取核心字体子集 (ASCII/常用符号通常在 subset 0 或 1)
      {
        tag: "link",
        attrs: {
          rel: "prefetch",
          href: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/lxgwwenkaiscreen.css",
          as: "style",
        },
      },
    ],
  },

  // 性能优化：代码分割
  performance: {
    removeConsole: process.env.NODE_ENV === "production",
    chunkSplit: {
      strategy: "custom",
      splitChunks: {
        cacheGroups: {
          // 核心框架单独打包
          vue: {
            test: /[\\/]node_modules[\\/](vue|vue-router|pinia|@vueuse)[\\/]/,
            name: "lib-vue",
            chunks: "all",
            priority: 20,
          },
          // UI 库单独打包
          ui: {
            test: /[\\/]node_modules[\\/](reka-ui|lucide-vue-next)[\\/]/,
            name: "lib-ui",
            chunks: "all",
            priority: 10,
          },
          // AI 运行时（较大）单独打包
          onnx: {
            test: /[\\/]node_modules[\\/](onnxruntime-web|@huggingface)[\\/]/,
            name: "lib-ai",
            chunks: "all",
            priority: 30,
          },
        },
      },
    },
  },

  output: {
    distPath: {
      root: "dist",
    },
    cleanDistPath: true,
    // 文件名包含 hash，便于缓存
    filename: {
      js: "[name].[contenthash:8].js",
      css: "[name].[contenthash:8].css",
    },
    // 压缩配置（rsbuild 会根据 NODE_ENV 自动处理，生产环境默认启用）
    // terserOptions 会在生产构建时自动应用
    copy: [
      { from: './node_modules/piper-tts-web/dist/onnx', to: 'onnx' },
      { from: './node_modules/piper-tts-web/dist/piper', to: 'piper' },
      { from: './node_modules/piper-tts-web/dist/worker', to: 'worker' },
    ],
  },

  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws/search": {
        target: "http://localhost:8080",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
