import { defineConfig } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginVue()],

  tools: {
    rspack: {
      ignoreWarnings: [
        /Critical dependency: Accessing import.meta directly is unsupported/,
      ],
      plugins: [
        // Bundle analyzer - 只在分析模式下启用
        ...(process.env.ANALYZE === 'true' ? [
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: false,
            reportFilename: '../bundle-report.html',
            generateStatsFile: true,
            statsFilename: '../bundle-stats.json',
          })
        ] : []),
      ],
      // 外部化大型AI库 - 关键优化
      externals: process.env.NODE_ENV === 'production' ? {
        // AI相关库外部化
        '@mlc-ai/web-llm': 'WebLLM',
        '@huggingface/transformers': 'HuggingFaceTransformers', 
        'onnxruntime-web': 'ort',
        'piper-tts-web': 'PiperTTS'
      } : {},
      optimization: {
        // 启用 tree shaking
        usedExports: true,
        sideEffects: false,
        // 生产环境启用压缩
        minimize: process.env.NODE_ENV === 'production',
        // 模块连接优化
        concatenateModules: true,
      },
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
            priority: 30,
          },
          // UI 库单独打包
          ui: {
            test: /[\\/]node_modules[\\/](reka-ui|lucide-vue-next)[\\/]/,
            name: "lib-ui",
            chunks: "all",
            priority: 20,
          },
          // AI 运行时 - 完全异步加载，强制分离
          ai: {
            test: /[\\/]node_modules[\\/](onnxruntime-web|@huggingface|@mlc-ai)[\\/]/,
            name: "lib-ai",
            chunks: "async", // 强制异步加载
            priority: 50,
            enforce: true, // 强制分离
          },
          // TTS 库 - 完全异步加载，强制分离
          tts: {
            test: /[\\/]node_modules[\\/](piper-tts-web)[\\/]/,
            name: "lib-tts",
            chunks: "async", // 强制异步加载
            priority: 45,
            enforce: true, // 强制分离
          },
          // AI服务相关代码 - 强制异步加载
          'ai-services': {
            test: /[\\/]src[\\/](stores[\\/]ai|services[\\/](ai|tts)|pages[\\/]ai-)/,
            name: 'ai-services',
            chunks: 'async', // 强制异步加载
            priority: 40,
            enforce: true, // 强制分离
          },
          // 工具库单独打包
          utils: {
            test: /[\\/]node_modules[\\/](dayjs|clsx|idb|ofetch)[\\/]/,
            name: "lib-utils",
            chunks: "all",
            priority: 15,
          },
          // 默认 vendor 包 - 限制大小
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendor",
            chunks: "all",
            priority: 5,
            minSize: 10000,
            maxSize: 100000, // 限制单个chunk最大100KB
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
    // 启用压缩
    minify: process.env.NODE_ENV === 'production' ? {
      js: true,
      css: true,
    } : false,
    copy: [
      // 端侧AI优化：不再预复制大型WASM和模型文件
      // 改为运行时按需加载以减少构建产物大小
      // 
      // 移除的配置：
      // - piper-tts-web/dist/onnx (23MB WASM文件)
      // - piper-tts-web/dist/piper (18MB 数据文件)  
      // - piper-tts-web/dist/worker (Worker脚本)
      //
      // 这些文件现在通过DynamicLoader在运行时加载
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
