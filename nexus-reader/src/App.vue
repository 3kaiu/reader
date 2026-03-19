<script setup lang="ts">
import { Toaster } from '@/components/ui/toast'

import { useUserStore } from '@/stores/user'
import AuthGuard from '@/components/auth/AuthGuard.vue'
import LoginModal from '@/components/LoginModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const userStore = useUserStore()
</script>

<template>
  <AuthGuard>
    <Toaster />
    <router-view v-slot="{ Component, route }">
      <Transition name="page-slide" mode="out-in">
        <component :is="Component" :key="route.fullPath" />
      </Transition>
    </router-view>
    
    <!-- 全局登录弹窗 -->
    <LoginModal v-model:show="userStore.showLoginModal" />
    <!-- 全局确认对话框 -->
    <ConfirmDialog />
  </AuthGuard>
</template>

<style>
:root {
  -webkit-tap-highlight-color: transparent;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
}

::selection {
  background: hsl(var(--primary) / 0.3);
  color: inherit;
}

/* 页面转场动画 - Premium Slide & Scale */
.page-slide-enter-active,
.page-slide-leave-active {
  transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
}

.page-slide-enter-from {
  opacity: 0;
  transform: translateX(20px) scale(0.99);
}

.page-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px) scale(1.01);
}
</style>
