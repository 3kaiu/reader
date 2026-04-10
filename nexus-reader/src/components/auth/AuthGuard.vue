<script setup lang="ts">
/**
 * 认证守卫组件
 * 只允许 GitHub 仓库 owner 或 Cloudflare 账户 owner 访问
 */
import { useAuthGuardView } from '@/composables/useAuthGuardView'
import { Github, Loader2, ShieldAlert } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const { isChecking, isAuthenticated, error, loginWithGitHub } = useAuthGuardView()
</script>

<template>
  <!-- 加载中 -->
  <div v-if="isChecking" class="min-h-screen flex items-center justify-center bg-background">
    <div class="text-center space-y-4">
      <Loader2 class="h-8 w-8 animate-spin text-primary mx-auto" />
      <p class="text-sm text-muted-foreground">验证登录状态...</p>
    </div>
  </div>

  <!-- 已登录 -->
  <slot v-else-if="isAuthenticated" />

  <!-- 未登录 -->
  <div v-else class="min-h-screen flex items-center justify-center bg-background">
    <div class="max-w-sm w-full mx-4 space-y-8 text-center">
      <div class="space-y-2">
        <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <ShieldAlert class="h-8 w-8 text-primary" />
        </div>
        <h1 class="text-2xl font-bold">Nexus Reader</h1>
        <p class="text-sm text-muted-foreground">仅限授权用户访问</p>
      </div>

      <div v-if="error" class="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
        {{ error }}
      </div>

      <div class="space-y-3">
        <Button size="lg" class="w-full gap-2" @click="loginWithGitHub">
          <Github class="h-5 w-5" />
          使用 GitHub 登录
        </Button>
      </div>

      <p class="text-xs text-muted-foreground">仅项目 Owner 可访问</p>
    </div>
  </div>
</template>
