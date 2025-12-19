<script setup lang="ts">
/**
 * 书源订阅管理组件
 * 功能：添加订阅源URL、同步订阅、删除订阅
 */
import { ref, onMounted } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  RefreshCw, Plus, Trash2, Link, Check, X, Loader2 
} from 'lucide-vue-next'
import { $get, $post } from '@/api'

interface Subscription {
  name: string
  link: string
  lastSyncTime: number | null
}

const emit = defineEmits<{
  'synced': []
}>()

const message = useMessage()
const loading = ref(false)
const subscriptions = ref<Subscription[]>([])
const newUrl = ref('')
const newName = ref('')
const showAddForm = ref(false)
const syncingUrl = ref<string | null>(null)

// 加载订阅列表
async function loadSubscriptions() {
  loading.value = true
  try {
    const res = await $get<string>('/file/get', { 
      params: { path: 'remoteBookSourceSub.json', home: '__HOME__' } 
    })
    if (res.isSuccess && res.data) {
      subscriptions.value = JSON.parse(res.data)
    }
  } catch {
    // 文件不存在时返回空数组
    subscriptions.value = []
  } finally {
    loading.value = false
  }
}

// 保存订阅列表
async function saveSubscriptions() {
  try {
    await $post('/file/save', { 
      path: 'remoteBookSourceSub.json', 
      content: JSON.stringify(subscriptions.value),
      home: '__HOME__'
    })
  } catch {
    message.error('保存订阅配置失败')
  }
}

// 添加订阅
async function addSubscription() {
  if (!newUrl.value.trim()) {
    message.warning('请输入订阅链接')
    return
  }
  
  // 检查是否已存在
  if (subscriptions.value.some(s => s.link === newUrl.value.trim())) {
    message.warning('该订阅已存在')
    return
  }
  
  subscriptions.value.push({
    name: newName.value.trim() || '',
    link: newUrl.value.trim(),
    lastSyncTime: null
  })
  
  await saveSubscriptions()
  message.success('添加订阅成功')
  
  // 立即同步
  await syncSubscription(subscriptions.value[subscriptions.value.length - 1])
  
  newUrl.value = ''
  newName.value = ''
  showAddForm.value = false
}

// 同步单个订阅
async function syncSubscription(sub: Subscription) {
  syncingUrl.value = sub.link
  try {
    const res = await $post<{ count?: number }>('/saveFromRemoteSource', { url: sub.link })
    if (res.isSuccess) {
      sub.lastSyncTime = Date.now()
      await saveSubscriptions()
      message.success(`同步成功${res.data?.count ? `，共 ${res.data.count} 个书源` : ''}`)
      emit('synced')
    } else {
      message.error(res.errorMsg || '同步失败')
    }
  } catch (err: any) {
    message.error('同步失败: ' + (err.message || '未知错误'))
  } finally {
    syncingUrl.value = null
  }
}

// 同步所有订阅
async function syncAll() {
  if (subscriptions.value.length === 0) {
    message.warning('暂无订阅源')
    return
  }
  
  let successCount = 0
  for (const sub of subscriptions.value) {
    syncingUrl.value = sub.link
    try {
      const res = await $post('/saveFromRemoteSource', { url: sub.link })
      if (res.isSuccess) {
        sub.lastSyncTime = Date.now()
        successCount++
      }
    } catch {
      // 继续下一个
    }
  }
  
  syncingUrl.value = null
  await saveSubscriptions()
  message.success(`同步完成，成功 ${successCount}/${subscriptions.value.length}`)
  emit('synced')
}

// 删除订阅
async function deleteSubscription(index: number) {
  subscriptions.value.splice(index, 1)
  await saveSubscriptions()
  message.success('删除成功')
}

// 格式化时间
function formatTime(ts: number | null): string {
  if (!ts) return '从未同步'
  const date = new Date(ts)
  return date.toLocaleString('zh-CN', { 
    month: 'numeric', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

onMounted(loadSubscriptions)
</script>

<template>
  <div class="space-y-4">
    <!-- 订阅列表 -->
    <div v-if="loading" class="py-8 text-center text-muted-foreground text-sm">
      <Loader2 class="h-5 w-5 animate-spin mx-auto mb-2" />
      加载中...
    </div>
    
    <div v-else-if="subscriptions.length === 0 && !showAddForm" class="py-8 text-center">
      <Link class="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
      <p class="text-sm text-muted-foreground mb-4">暂无订阅源</p>
      <Button size="sm" @click="showAddForm = true">
        <Plus class="h-4 w-4 mr-1" /> 添加订阅
      </Button>
    </div>
    
    <div v-else class="space-y-2">
      <!-- 订阅项 -->
      <div
        v-for="(sub, index) in subscriptions"
        :key="sub.link"
        class="flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors group"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-sm truncate">
              {{ sub.name || `订阅 ${index + 1}` }}
            </span>
            <Badge variant="secondary" class="text-[10px] shrink-0">
              {{ formatTime(sub.lastSyncTime) }}
            </Badge>
          </div>
          <p class="text-xs text-muted-foreground truncate mt-0.5 font-mono">
            {{ sub.link }}
          </p>
        </div>
        
        <div class="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8"
            :disabled="syncingUrl !== null"
            @click="syncSubscription(sub)"
          >
            <Loader2 v-if="syncingUrl === sub.link" class="h-4 w-4 animate-spin" />
            <RefreshCw v-else class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            @click="deleteSubscription(index)"
          >
            <Trash2 class="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <!-- 添加表单 -->
      <div v-if="showAddForm" class="p-3 rounded-lg border-2 border-dashed border-primary/30 space-y-3">
        <Input 
          v-model="newUrl" 
          placeholder="订阅链接 (https://...)" 
          class="text-sm"
        />
        <Input 
          v-model="newName" 
          placeholder="名称 (可选)" 
          class="text-sm"
        />
        <div class="flex gap-2">
          <Button size="sm" @click="addSubscription" :disabled="!newUrl.trim()">
            <Check class="h-4 w-4 mr-1" /> 确认添加
          </Button>
          <Button size="sm" variant="ghost" @click="showAddForm = false; newUrl = ''; newName = ''">
            <X class="h-4 w-4 mr-1" /> 取消
          </Button>
        </div>
      </div>
      
      <!-- 底部操作 -->
      <div v-if="!showAddForm && subscriptions.length > 0" class="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" @click="showAddForm = true">
          <Plus class="h-4 w-4 mr-1" /> 添加
        </Button>
        <Button 
          variant="default" 
          size="sm" 
          @click="syncAll"
          :disabled="syncingUrl !== null"
        >
          <RefreshCw :class="['h-4 w-4 mr-1', syncingUrl !== null && 'animate-spin']" />
          全部同步
        </Button>
      </div>
    </div>
  </div>
</template>
