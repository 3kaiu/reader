<script setup lang="ts">
import { ref } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Loader2 } from 'lucide-vue-next'
import { $post } from '@/api'
import { useUserStore } from '@/stores/user'
import { useMessage } from '@/composables/useMessage'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const message = useMessage()
const userStore = useUserStore()

// ====== 状态 ======
const activeTab = ref<'login' | 'register'>('login')
const loading = ref(false)
const showPassword = ref({ login: false, register: false, confirm: false })

const loginForm = ref({
  username: '',
  password: '',
})

const registerForm = ref({
  username: '',
  password: '',
  confirmPassword: '',
})

// ====== 方法 ======

// 关闭弹窗
function close() {
  emit('update:show', false)
}

// 登录
async function handleLogin() {
  if (!loginForm.value.username || !loginForm.value.password) {
    message.warning('请输入用户名和密码')
    return
  }

  loading.value = true
  try {
    const res = await $post<{ accessToken: string }>('/login', {
      username: loginForm.value.username,
      password: loginForm.value.password,
    })
    
    if (res.isSuccess && res.data.accessToken) {
      userStore.setToken(res.data.accessToken)
      userStore.setUserInfo({ username: loginForm.value.username })
      message.success('登录成功')
      close()
    } else {
      message.error(res.errorMsg || '登录失败')
    }
  } catch (error) {
    message.error('登录请求失败')
  } finally {
    loading.value = false
  }
}

// 注册
async function handleRegister() {
  if (!registerForm.value.username || !registerForm.value.password) {
    message.warning('请填写完整信息')
    return
  }
  
  if (registerForm.value.password !== registerForm.value.confirmPassword) {
    message.warning('两次密码输入不一致')
    return
  }

  loading.value = true
  try {
    const res = await $post('/register', {
      username: registerForm.value.username,
      password: registerForm.value.password,
    })
    
    if (res.isSuccess) {
      message.success('注册成功，请登录')
      activeTab.value = 'login'
      loginForm.value.username = registerForm.value.username
    } else {
      message.error(res.errorMsg || '注册失败')
    }
  } catch (error) {
    message.error('注册请求失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog :open="show" @update:open="(val) => emit('update:show', val)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="text-center text-xl">用户登录</DialogTitle>
        <DialogDescription class="text-center">
          登录后可同步阅读进度和书架
        </DialogDescription>
      </DialogHeader>

      <!-- Tabs 切换 -->
      <div class="grid grid-cols-2 p-1 bg-muted rounded-lg mb-6">
        <button
          class="px-4 py-2 text-sm font-medium rounded-md transition-all"
          :class="activeTab === 'login' 
            ? 'bg-background shadow-sm text-foreground' 
            : 'text-muted-foreground hover:bg-background/50'"
          @click="activeTab = 'login'"
        >
          登录
        </button>
        <button
          class="px-4 py-2 text-sm font-medium rounded-md transition-all"
          :class="activeTab === 'register' 
            ? 'bg-background shadow-sm text-foreground' 
            : 'text-muted-foreground hover:bg-background/50'"
          @click="activeTab = 'register'"
        >
          注册
        </button>
      </div>

      <!-- 登录表单 -->
      <div v-if="activeTab === 'login'" class="space-y-4">
        <div class="space-y-2">
          <Label for="login-username">用户名</Label>
          <Input
            id="login-username"
            v-model="loginForm.username"
            placeholder="请输入用户名"
            @keyup.enter="handleLogin"
            :disabled="loading"
          />
        </div>
        
        <div class="space-y-2">
          <Label for="login-password">密码</Label>
          <div class="relative">
            <Input
              id="login-password"
              v-model="loginForm.password"
              :type="showPassword.login ? 'text' : 'password'"
              placeholder="请输入密码"
              @keyup.enter="handleLogin"
              :disabled="loading"
              class="pr-10"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              @click="showPassword.login = !showPassword.login"
            >
              <EyeOff v-if="showPassword.login" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </button>
          </div>
        </div>

        <Button
          class="w-full"
          :disabled="loading"
          @click="handleLogin"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          登录
        </Button>
      </div>

      <!-- 注册表单 -->
      <div v-else class="space-y-4">
        <div class="space-y-2">
          <Label for="register-username">用户名</Label>
          <Input
            id="register-username"
            v-model="registerForm.username"
            placeholder="请输入用户名"
            :disabled="loading"
          />
        </div>
        
        <div class="space-y-2">
          <Label for="register-password">密码</Label>
          <div class="relative">
            <Input
              id="register-password"
              v-model="registerForm.password"
              :type="showPassword.register ? 'text' : 'password'"
              placeholder="请输入密码"
              :disabled="loading"
              class="pr-10"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              @click="showPassword.register = !showPassword.register"
            >
              <EyeOff v-if="showPassword.register" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="register-confirm">确认密码</Label>
          <div class="relative">
            <Input
              id="register-confirm"
              v-model="registerForm.confirmPassword"
              :type="showPassword.confirm ? 'text' : 'password'"
              placeholder="请再次输入密码"
              @keyup.enter="handleRegister"
              :disabled="loading"
              class="pr-10"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              @click="showPassword.confirm = !showPassword.confirm"
            >
              <EyeOff v-if="showPassword.confirm" class="h-4 w-4" />
              <Eye v-else class="h-4 w-4" />
            </button>
          </div>
        </div>

        <Button
          class="w-full"
          :disabled="loading"
          @click="handleRegister"
        >
          <Loader2 v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          注册
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
