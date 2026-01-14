import { defineConfig, loadEnv } from "@rsbuild/core";
import { pluginVue } from "@rsbuild/plugin-vue";

// Load environment variables
const { publicVars } = loadEnv({ prefixes: ['VITE_'] });

// Only import bundle analyzer when needed
const getBundleAnalyzerPlugin = async () => {
  if (process.env.ANALYZE === 'true') {
    const { BundleAnalyzerPlugin } = await import('webpack-bundle-analyzer');
    return new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      reportFilename: '../bundle-report.html',
      generateStatsFile: true,
      statsFilename: '../bundle-stats.json',
    });
  }
  return null;
};

// Docs: https://rsbuild.rs/config/
export default defineConfig(async () => {
  const analyzerPlugin = await getBundleAnalyzerPlugin();

  return {
    plugins: [pluginVue()],
    
    // Inject VITE_* environment variables
    source: {
      define: publicVars,
    },

    tools: {
      rspack: {
        ignoreWarnings: [
          /Critical dependency: Accessing import.meta directly is unsupported/,
        ],
        plugins: [
          ...(analyzerPlugin ? [analyzerPlugin] : []),
        ],
        // 将大型 AI / TTS 库外部化，从 CDN 加载以避免构建产物过大（如 Cloudflare Pages 25MB 限制）
        externals: {
          // 通过全局变量使用，从 HTML 或运行时动态插入的 <script> 中注入
          '@huggingface/transformers': 'HuggingFaceTransformers',
          'onnxruntime-web': 'ort',

          // WebLLM：对应 src/config/cdnResources.ts 中的 globalName: 'WebLLM'
          // 在代码里依然可以使用 import('@mlc-ai/web-llm') / import { ... } from '@mlc-ai/web-llm'
          // 打包时不会被内联，只会在运行时从全局 WebLLM 读取
          '@mlc-ai/web-llm': 'WebLLM',

          // Piper TTS：对应 src/config/cdnResources.ts 中的 globalName: 'PiperTTS'
          // 通过 CDN 动态加载后暴露为 window.PiperTTS，这里同样做 external 以避免把 wasm / 模型打进 bundle
          'piper-tts-web': 'PiperTTS',
        },
        optimization: {
          usedExports: true,
          sideEffects: false,
          minimize: process.env.NODE_ENV === 'production',
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
        { tag: "link", attrs: { rel: "preconnect", href: "https://cdn.jsdelivr.net" } },
        { tag: "link", attrs: { rel: "dns-prefetch", href: "https://cdn.jsdelivr.net" } },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/style.css",
            media: "all",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "prefetch",
            href: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/lxgwwenkaiscreen.css",
            as: "style",
          },
        },
        // AI 库从 CDN 加载 (避免超过 Cloudflare Pages 25MB 限制)
        {
          tag: "script",
          attrs: {
            src: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.min.js",
            defer: true,
          },
        },
        {
          tag: "script",
          attrs: {
            src: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js",
            defer: true,
          },
        },
      ],
    },

    performance: {
      removeConsole: process.env.NODE_ENV === "production",
      chunkSplit: {
        strategy: "custom",
        splitChunks: {
          cacheGroups: {
            vue: {
              test: /[\\/]node_modules[\\/](vue|vue-router|pinia|@vueuse)[\\/]/,
              name: "lib-vue",
              chunks: "all",
              priority: 30,
            },
            ui: {
              test: /[\\/]node_modules[\\/](reka-ui|lucide-vue-next)[\\/]/,
              name: "lib-ui",
              chunks: "all",
              priority: 20,
            },
            ai: {
              test: /[\\/]node_modules[\\/](onnxruntime-web|@huggingface|@mlc-ai)[\\/]/,
              name: "lib-ai",
              chunks: "async",
              priority: 50,
              enforce: true,
            },
            tts: {
              test: /[\\/]node_modules[\\/](piper-tts-web)[\\/]/,
              name: "lib-tts",
              chunks: "async",
              priority: 45,
              enforce: true,
            },
            'ai-services': {
              test: /[\\/]src[\\/](stores[\\/]ai|services[\\/](ai|tts)|pages[\\/]ai-)/,
              name: 'ai-services',
              chunks: 'async',
              priority: 40,
              enforce: true,
            },
            utils: {
              test: /[\\/]node_modules[\\/](dayjs|clsx|idb|ofetch)[\\/]/,
              name: "lib-utils",
              chunks: "all",
              priority: 15,
            },
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: "vendor",
              chunks: "all",
              priority: 5,
              minSize: 10000,
              maxSize: 100000,
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
      filename: {
        js: "[name].[contenthash:8].js",
        css: "[name].[contenthash:8].css",
      },
      minify: process.env.NODE_ENV === 'production' ? {
        js: true,
        css: true,
      } : false,
      copy: [],
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
  };
});
