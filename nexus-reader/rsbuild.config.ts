import { defineConfig } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';

// 性能预算插件
class PerformanceBudgetPlugin {
  apply(compiler: any) {
    compiler.hooks.done.tapAsync('PerformanceBudgetPlugin', async (stats: any, callback: any) => {
      try {
        // 动态导入预算执行器
        const { buildTimeBudgetEnforcer } = await import('./src/utils/budgetEnforcement')
        
        // 分析构建结果
        const report = await buildTimeBudgetEnforcer.analyzeBuild(stats)
        
        if (!report.passed) {
          console.warn(`⚠️ Performance budget violations detected: ${report.violations.length} violations`)
          
          // 在开发模式下只警告，生产模式下可以选择失败构建
          if (process.env.NODE_ENV === 'production' && process.env.FAIL_ON_BUDGET_VIOLATION === 'true') {
            callback(new Error('Build failed due to performance budget violations'))
            return
          }
        } else {
          console.log('✅ All performance budgets passed')
        }
        
        callback()
      } catch (error) {
        console.error('Performance budget check failed:', error)
        callback() // 不因为预算检查失败而中断构建
      }
    })
  }
}

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
        
        // 性能预算插件
        new PerformanceBudgetPlugin(),
      ],
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
            priority: 20,
          },
          // UI 库单独打包
          ui: {
            test: /[\\/]node_modules[\\/](reka-ui|lucide-vue-next)[\\/]/,
            name: "lib-ui",
            chunks: "all",
            priority: 10,
          },
          // AI 运行时（较大）单独打包 - 异步加载
          onnx: {
            test: /[\\/]node_modules[\\/](onnxruntime-web|@huggingface)[\\/]/,
            name: "lib-ai",
            chunks: "async", // 改为异步加载
            priority: 30,
          },
          // TTS 库单独打包 - 异步加载
          tts: {
            test: /[\\/]node_modules[\\/](piper-tts-web)[\\/]/,
            name: "lib-tts",
            chunks: "async", // 异步加载
            priority: 25,
          },
          // 工具库单独打包
          utils: {
            test: /[\\/]node_modules[\\/](lodash|date-fns|crypto-js)[\\/]/,
            name: "lib-utils",
            chunks: "all",
            priority: 15,
          },
          // 默认 vendor 包
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendor",
            chunks: "all",
            priority: 5,
            minSize: 20000,
            maxSize: 200000,
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
      html: true,
    } : false,
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
