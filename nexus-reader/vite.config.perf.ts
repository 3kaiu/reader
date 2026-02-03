/**
 * Vite 性能优化配置
 * 专门用于生产环境的代码分割和性能优化
 */

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    vue(),
    // 包分析插件（生产环境）
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true
    })
  ],

  build: {
    // 启用代码分割
    rollupOptions: {
      output: {
        // 手动分包策略
        manualChunks: {
          // Vue 生态
          'vue-vendor': ['vue', 'vue-router', 'pinia'],

          // UI 组件库
          'ui-vendor': ['@headlessui/vue', '@heroicons/vue'],

          // 工具库
          'utils-vendor': [
            'axios',
            'dayjs',
            'lodash-es',
            'crypto-js'
          ],

          // AI 功能（单独分包）
          'ai-features': [
            '@/services/ai/',
            '@/utils/aiExport.ts'
          ],

          // 阅读器功能（单独分包）
          'reader-features': [
            '@/components/reader/',
            '@/utils/performanceTesting.ts'
          ],

          // 管理功能（按需加载）
          'admin-features': [
            '@/pages/sources.vue',
            '@/pages/replace-rule.vue',
            '@/components/source/',
            '@/components/replace/'
          ]
        },

        // 分包命名策略
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId.split('/').pop()?.replace('.vue', '')
            : 'chunk'

          return `js/${facadeModuleId}-[hash].js`
        },

        // 入口文件命名
        entryFileNames: 'js/[name]-[hash].js',

        // 资源文件命名
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') || []
          const ext = info[info.length - 1]

          if (/\.(png|jpe?g|gif|svg|ico|webp)$/i.test(assetInfo.name || '')) {
            return `images/[name]-[hash][extname]`
          }

          if (/\.(css)$/i.test(assetInfo.name || '')) {
            return `css/[name]-[hash][extname]`
          }

          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name || '')) {
            return `fonts/[name]-[hash][extname]`
          }

          return `assets/[name]-[hash][extname]`
        }
      },

      // 外部依赖（CDN）
      external: (id) => {
        // 将大库外部化，由CDN提供
        if (process.env.NODE_ENV === 'production') {
          return ['vue', 'vue-router'].includes(id)
        }
        return false
      }
    },

    // 代码压缩
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // 移除console
        drop_debugger: true, // 移除debugger
        pure_funcs: ['console.log'] // 移除特定函数
      },
      mangle: {
        safari10: true // 解决Safari 10 bug
      }
    },

    // 源码映射
    sourcemap: process.env.NODE_ENV === 'development',

    // 包大小警告
    chunkSizeWarningLimit: 1000, // 1MB

    // 依赖预构建
    commonjsOptions: {
      include: [/node_modules/],
      extensions: ['.js', '.cjs']
    }
  },

  // 路径别名
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '~': resolve(__dirname, 'src'),
      'components': resolve(__dirname, 'src/components'),
      'utils': resolve(__dirname, 'src/utils'),
      'services': resolve(__dirname, 'src/services'),
      'stores': resolve(__dirname, 'src/stores'),
      'types': resolve(__dirname, 'src/types')
    }
  },

  // CSS 优化
  css: {
    devSourcemap: true,
    postcss: {
      plugins: []
    }
  },

  // 开发服务器优化
  server: {
    fs: {
      // 限制文件系统访问
      strict: true
    },
    // 预热常用文件
    warmup: [
      'src/main.ts',
      'src/App.vue',
      'src/pages/index.vue'
    ]
  },

  // 依赖优化
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'pinia',
      '@vueuse/core',
      'axios'
    ],
    exclude: [
      // 不预构建的依赖
    ]
  },

  // 插件优化
  esbuild: {
    // 移除console和debugger
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],

    // 压缩标识符
    minifyIdentifiers: process.env.NODE_ENV === 'production',

    // 压缩语法
    minifySyntax: process.env.NODE_ENV === 'production',

    // 压缩空白
    minifyWhitespace: process.env.NODE_ENV === 'production'
  },

  // 环境变量
  define: {
    __DEV__: process.env.NODE_ENV === 'development',
    __PROD__: process.env.NODE_ENV === 'production'
  }
})