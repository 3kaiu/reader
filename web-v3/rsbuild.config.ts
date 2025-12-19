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
