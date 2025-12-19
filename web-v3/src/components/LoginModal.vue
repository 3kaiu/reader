<script setup lang="ts">
import { ref } from 'vue'
import {
  NModal,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NSpace,
  NTabs,
  NTabPane,
  useMessage,
} from 'naive-ui'
import { $post } from '@/api'
import { useUserStore } from '@/stores/user'

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
  <NModal 
    :show="show"
    @update:show="emit('update:show', $event)"
    :mask-closable="true"
  >
    <NCard
      style="width: 400px"
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="rounded-2xl"
    >
      <template #header>
        <div class="text-center">
          <h2 class="text-xl font-bold">用户登录</h2>
        </div>
      </template>

      <NTabs v-model:value="activeTab" type="segment" animated>
        <!-- 登录 -->
        <NTabPane name="login" tab="登录">
          <NForm class="mt-4">
            <NFormItem label="用户名">
              <NInput
                v-model:value="loginForm.username"
                placeholder="请输入用户名"
                @keyup.enter="handleLogin"
              />
            </NFormItem>
            <NFormItem label="密码">
              <NInput
                v-model:value="loginForm.password"
                type="password"
                show-password-on="click"
                placeholder="请输入密码"
                @keyup.enter="handleLogin"
              />
            </NFormItem>
            <NButton
              type="primary"
              block
              :loading="loading"
              @click="handleLogin"
            >
              登录
            </NButton>
          </NForm>
        </NTabPane>

        <!-- 注册 -->
        <NTabPane name="register" tab="注册">
          <NForm class="mt-4">
            <NFormItem label="用户名">
              <NInput
                v-model:value="registerForm.username"
                placeholder="请输入用户名"
              />
            </NFormItem>
            <NFormItem label="密码">
              <NInput
                v-model:value="registerForm.password"
                type="password"
                show-password-on="click"
                placeholder="请输入密码"
              />
            </NFormItem>
            <NFormItem label="确认密码">
              <NInput
                v-model:value="registerForm.confirmPassword"
                type="password"
                show-password-on="click"
                placeholder="请再次输入密码"
                @keyup.enter="handleRegister"
              />
            </NFormItem>
            <NButton
              type="primary"
              block
              :loading="loading"
              @click="handleRegister"
            >
              注册
            </NButton>
          </NForm>
        </NTabPane>
      </NTabs>

      <template #footer>
        <div class="text-center text-sm text-gray-400">
          登录后可同步阅读进度和书架
        </div>
      </template>
    </NCard>
  </NModal>
</template>
