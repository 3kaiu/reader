<script setup lang="ts">
/**
 * 认证守卫组件
 * 只允许 GitHub 仓库 owner 或 Cloudflare 账户 owner 访问
 */
import { ref, onMounted } from 'vue'
import { Github, Loader2, ShieldAlert, Cloud } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const AUTH_WORKER_URL = import.meta.env.VITE_AUTH_WORKER_URL || ''

const isChecking = ref(true)
const isAuthenticated = ref(false)
const user = ref<{ provider: string; id: string; name: string; avatar?: string } | null>(null)
const error = ref<string | null>(null)

function checkUrlError() {
  const params = new URLSearchParams(window.location.search)
  const urlError = params.get('error')
  if (urlError) {
    if (urlError === 'unauthorized') {
      error.value = '你的账号未被授权访问'
    } else {
      error.value = `登录失败: ${urlError}`
    }
    window.history.replaceState({}, '', window.location.pathname)
  }
}

async function checkAuth() {
  // 没有配置认证 Worker，跳过认证
  if (!AUTH_WORKER_URL) {
    isAuthenticated.value = true
    isChecking.value = false
    return
  }

  try {
    const res = await fetch(`${AUTH_WORKER_URL}/verify`, { credentials: 'include' })
    const data = await res.json()
    
    isAuthenticated.value = data.authenticated
    if (data.authenticated && data.user) {
      user.value = data.user
    }
  } catch (e) {
    console.error('Auth check failed:', e)
    isAuthenticated.value = true // 网络错误时降级允许访问
  } finally {
    isChecking.value = false
  }
}

function loginWithGitHub() {
  if (AUTH_WORKER_URL) {
    window.location.href = `${AUTH_WORKER_URL}/login/github`
  }
}

function loginWithCloudflare() {
  if (AUTH_WORKER_URL) {
    window.location.href = `${AUTH_WORKER_URL}/login/cloudflare`
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
        
        <Button size="lg" variant="outline" class="w-full gap-2" @click="loginWithCloudflare">
          <Cloud class="h-5 w-5" />
          使用 Cloudflare 登录
        </Button>
      </div>

      <p class="text-xs text-muted-foreground">
        仅项目 Owner 可访问
      </p>
    </div>
  </div>
</template>
