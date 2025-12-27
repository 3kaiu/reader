<script setup lang="ts">
import { 
  NConfigProvider, 
  NMessageProvider, 
  NNotificationProvider, 
  NDialogProvider,
  zhCN, 
  dateZhCN, 
  darkTheme, 
  type GlobalThemeOverrides 
} from 'naive-ui'
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import LoginModal from '@/components/LoginModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

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
      <NNotificationProvider>
        <NDialogProvider>
          <router-view v-slot="{ Component }">
            <Transition name="page-fade" mode="out-in">
              <component :is="Component" />
            </Transition>
          </router-view>
          
          <!-- 全局登录弹窗 -->
          <LoginModal v-model:show="userStore.showLoginModal" />
          <!-- 全局确认对话框 -->
          <ConfirmDialog />
        </NDialogProvider>
      </NNotificationProvider>
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

/* 页面转场动画 - Zoom In + Fade */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-fade-enter-from {
  opacity: 0;
  transform: scale(0.98);
}

.page-fade-leave-to {
  opacity: 0;
  transform: scale(1.02);
}
</style>
