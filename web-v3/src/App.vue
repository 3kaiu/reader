<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NDialogProvider, zhCN, dateZhCN, darkTheme, type GlobalThemeOverrides } from 'naive-ui'
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import LoginModal from '@/components/LoginModal.vue'

const settingsStore = useSettingsStore()
const userStore = useUserStore()

// 现代化主题覆盖 - Indigo 色系
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#6366F1',
    primaryColorHover: '#4F46E5',
    primaryColorPressed: '#4338CA',
    primaryColorSuppl: '#818CF8',
    borderRadius: '12px',
    borderRadiusSmall: '8px',
  },
  Button: {
    borderRadiusMedium: '10px',
    borderRadiusLarge: '12px',
  },
  Card: {
    borderRadius: '16px',
  },
  Input: {
    borderRadius: '10px',
  },
}

// 根据设置切换暗色主题
const theme = computed(() => (settingsStore.isDark ? darkTheme : undefined))
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <NMessageProvider>
      <NDialogProvider>
        <router-view />
        
        <!-- 全局登录弹窗 -->
        <LoginModal v-model:show="userStore.showLoginModal" />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style>
html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}
</style>
