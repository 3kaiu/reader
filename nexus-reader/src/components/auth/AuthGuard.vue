<script setup lang="ts">
/**
 * 认证守卫组件
 * 包裹需要登录才能访问的内容
 */
import { ref, onMounted } from 'vue'
import { Github, Loader2, ShieldAlert } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const AUTH_WORKER_URL = import.meta.env.VITE_AUTH_WORKER_URL || ''

const isChecking = ref(true)
const isAuthenticated = ref(false)
const user = ref<{ login: string; avatar: string } | null>(null)
const error = ref<string | null>(null)

// 检查 URL 参数中的错误
function checkUrlError() {
  const params = new URLSearchParams(window.location.search)
  const urlError = params.get('error')
  if (urlError) {
    if (urlError === 'unauthorized') {
      error.value = '你的 GitHub 账号未被授权访问'
    } else {
      error.value = `登录失败: ${urlError}`
    }
    // 清除 URL 参数
    window.history.replaceState({}, '', window.location.pathname)
  }
}

// 验证登录状态
async function checkAuth() {
  // 如果没有配置认证 Worker，跳过认证
  if (!AUTH_WORKER_URL) {
    isAuthenticated.value = true
    isChecking.value = false
    return
  }

  try {
    const res = await fetch(`${AUTH_WORKER_URL}/verify`, {
      credentials: 'include',
    })
    const data = await res.json()
    
    isAuthenticated.value = data.authenticated
    if (data.authenticated && data.user) {
      user.value = data.user
    }
  } catch (e) {
    console.error('Auth check failed:', e)
    // 网络错误时允许访问（降级处理）
    isAuthenticated.value = true
  } finally {
    isChecking.value = false
  }
}

// GitHub 登录
function login() {
  if (AUTH_WORKER_URL) {
    window.location.href = `${AUTH_WORKER_URL}/login`
  }
}

onMounted(() => {
  checkUrlError()
  checkAuth()
})
</script>

<template>
  <!-- 加载中 -->
  <div v-if="isChecking" class="min-h-screen flex items-center justify-center bg-background">
    <div class="text-center space-y-4">
      <Loader2 class="h-8 w-8 animate-spin text-primary mx-auto" />
      <p class="text-sm text-muted-foreground">验证登录状态...</p>
    </div>
  </div>

  <!-- 已登录，显示内容 -->
  <slot v-else-if="isAuthenticated" />

  <!-- 未登录，显示登录页 -->
  <div v-else class="min-h-screen flex items-center justify-center bg-background">
    <div class="max-w-sm w-full mx-4 space-y-8 text-center">
      <!-- Logo -->
      <div class="space-y-2">
        <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <ShieldAlert class="h-8 w-8 text-primary" />
        </div>
        <h1 class="text-2xl font-bold">Nexus Reader</h1>
        <p class="text-sm text-muted-foreground">需要登录才能访问</p>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
        {{ error }}
      </div>

      <!-- 登录按钮 -->
      <Button 
        size="lg" 
        class="w-full gap-2"
        @click="login"
      >
        <Github class="h-5 w-5" />
        使用 GitHub 登录
      </Button>

      <p class="text-xs text-muted-foreground">
        仅限授权用户访问
      </p>
    </div>
  </div>
</template>
