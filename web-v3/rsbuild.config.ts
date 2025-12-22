import { defineConfig } from '@rsbuild/core';
import { pluginVue } from '@rsbuild/plugin-vue';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [pluginVue()],

  source: {
    alias: {
      '@': './src',
    },
  },

  html: {
    title: 'Reader',
    meta: {
      viewport: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
      description: 'Web Reader Application',
      'theme-color': '#ffffff'
    },
    tags: [
      { tag: 'link', attrs: { rel: 'manifest', href: '/manifest.json' } },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/favicon.png' } },
      { tag: 'link', attrs: { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.1.0/style.css' } },
    ],
  },

  output: {
    distPath: {
      root: '../src/main/resources/web',
    },
    cleanDistPath: true,
  },

  server: {
    port: 5173,
    proxy: {
      '/reader3': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
