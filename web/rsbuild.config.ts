import { defineConfig, loadEnv } from '@rsbuild/core'
import { pluginVue } from '@rsbuild/plugin-vue'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'

// Load environment variables
const { publicVars } = loadEnv({ prefixes: ['VITE_'] })

// Only import bundle analyzer when needed
const getBundleAnalyzerPlugin = async () => {
  if (process.env.ANALYZE === 'true') {
    const { BundleAnalyzerPlugin } = await import('webpack-bundle-analyzer')
    return new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      reportFilename: '../bundle-report.html',
      generateStatsFile: true,
      statsFilename: '../bundle-stats.json',
    })
  }
  return null
}

// Docs: https://rsbuild.rs/config/
export default defineConfig(async () => {
  const analyzerPlugin = await getBundleAnalyzerPlugin()

  return {
    plugins: [pluginVue(), pluginTailwindcss()],

    // Inject VITE_* environment variables
    source: {
      define: publicVars,
    },

    tools: {
      rspack: {
        ignoreWarnings: [/Critical dependency: Accessing import.meta directly is unsupported/],
        plugins: [...(analyzerPlugin ? [analyzerPlugin] : [])],
        optimization: {
          usedExports: true,
          sideEffects: true,
          minimize: process.env.NODE_ENV === 'production',
          concatenateModules: true,
        },
      },
    },

    resolve: {
      alias: {
        '@': './src',
      },
    },

    html: {
      title: 'Nexus',
      meta: {
        viewport: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
        description: 'Self-hosted reading workspace powered by Nexus',
        'theme-color': '#ffffff',
      },
      tags: [
        { tag: 'link', attrs: { rel: 'manifest', href: '/manifest.json' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/favicon.png' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://cdn.jsdelivr.net' } },
        { tag: 'link', attrs: { rel: 'dns-prefetch', href: 'https://cdn.jsdelivr.net' } },
        {
          tag: 'link',
          attrs: {
            rel: 'preload',
            as: 'style',
            href: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/style.css',
            onload: "this.onload=null;this.rel='stylesheet'",
          },
        },
        {
          tag: 'noscript',
          children: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/style.css">`,
        },
      ],
    },

    performance: {
      removeConsole: process.env.NODE_ENV === 'production',
      chunkSplit: {
        strategy: 'custom',
        splitChunks: {
          cacheGroups: {
            vue: {
              test: /[\\/]node_modules[\\/](vue|vue-router|pinia|@vueuse)[\\/]/,
              name: 'lib-vue',
              chunks: 'all',
              priority: 30,
            },
            ui: {
              test: /[\\/]node_modules[\\/](reka-ui|lucide-vue-next)[\\/]/,
              name: 'lib-ui',
              chunks: 'all',
              priority: 20,
            },
            utils: {
              test: /[\\/]node_modules[\\/](dayjs|clsx|idb|ofetch)[\\/]/,
              name: 'lib-utils',
              chunks: 'all',
              priority: 15,
            },
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendor',
              chunks: 'all',
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
        root: 'dist',
      },
      cleanDistPath: true,
      filename: {
        js: '[name].[contenthash:8].js',
        css: '[name].[contenthash:8].css',
      },
      minify:
        process.env.NODE_ENV === 'production'
          ? {
              js: true,
              css: true,
            }
          : false,
      copy: [],
    },

    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          changeOrigin: true,
        },
        '/ws/search': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
