<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { $post, $get } from '@/api'
import { BookSourceSubscription, sourceApi } from '@/api/source'
import { useMessage } from '@/composables/useMessage'
import { useConfirm } from '@/composables/useConfirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, RefreshCw, Clock, Globe, Rss, Terminal, Settings2 } from 'lucide-vue-next'
import { useWebSocketStore } from '@/stores/websocket'

const props = defineProps<{}>()
const subscriptions = ref<BookSourceSubscription[]>([])
const loading = ref(false)
const syncing = ref(false)
const showAdd = ref(false)
const newUrl = ref('')
const newAutoUpdate = ref(true)

// Settings Dialog
const showSettings = ref(false)
const editingSub = ref<BookSourceSubscription | null>(null)
const editInterval = ref('360') // minutes string
const editAutoUpdate = ref(true)

const { success, error } = useMessage()
const { confirm } = useConfirm()
const wsStore = useWebSocketStore()

async function loadSubscriptions() {
    loading.value = true
    try {
        const res = await sourceApi.getSubscriptions()
        if (res.isSuccess) {
            subscriptions.value = res.data || []
        }
    } catch (e) {
        // error('Failed to load subscriptions')
    } finally {
        loading.value = false
    }
}

async function addSubscription() {
    if (!newUrl.value) return
    try {
        const res = await sourceApi.addSubscription(newUrl.value, newAutoUpdate.value)
        if (res.isSuccess) {
            success('订阅成功')
            newUrl.value = ''
            showAdd.value = false
            loadSubscriptions()
        } else {
            error(res.msg || '订阅失败')
        }
    } catch (e) {
        error('订阅失败')
    }
}

function openSettings(sub: BookSourceSubscription) {
    editingSub.value = sub
    editInterval.value = (sub.interval || 360).toString()
    editAutoUpdate.value = sub.autoUpdate
    showSettings.value = true
}

async function saveSettings() {
    if (!editingSub.value) return
    try {
        const interval = parseInt(editInterval.value)
        const res = await sourceApi.updateSubscription(
            editingSub.value.url,
            interval,
            editAutoUpdate.value
        )
        
        if (res.isSuccess) {
            success('设置已更新')
            showSettings.value = false
            loadSubscriptions()
        } else {
            error(res.msg || '更新失败')
        }
    } catch (e) {
        error('更新失败')
    }
}

async function removeSubscription(sub: BookSourceSubscription) {
    const ok = await confirm({
        title: '取消订阅',
        description: '确定要移除该订阅源吗？',
        variant: 'destructive'
    })
    if (!ok) return

    try {
        const res = await sourceApi.deleteSubscription(sub.url)
        if (res.isSuccess) {
            success('已移除')
            loadSubscriptions()
        }
    } catch (e) {
        error('移除失败')
    }
}

async function syncAll() {
    syncing.value = true
    wsStore.clearLogs()
    try {
        const res = await sourceApi.syncSubscriptions()
        if (res.isSuccess) {
            success('后台同步已开始')
            // Refresh list after a delay to show updated time, or rely on WS
            setTimeout(loadSubscriptions, 2000)
        }
    } catch (e) {
        error('同步请求失败')
    } finally {
        setTimeout(() => syncing.value = false, 3000)
    }
}

function formatTime(ts?: number) {
    if (!ts) return '从未'
    return new Date(ts).toLocaleString()
}

function formatInterval(mins: number) {
    if (mins < 60) return `${mins}分钟`
    const hours = mins / 60
    if (hours < 24) return `${hours}小时`
    return `${hours / 24}天`
}

onMounted(() => {
    loadSubscriptions()
})
</script>

<template>
    <div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <!-- Header Section -->
        <div class="flex items-center justify-between">
            <div class="space-y-1">
                <h2 class="text-lg font-semibold tracking-tight">订阅列表</h2>
                <p class="text-sm text-muted-foreground">
                    管理远程书源订阅，支持自动同步更新
                </p>
            </div>
            <div class="flex items-center gap-2">
                <Button 
                    variant="outline" 
                    size="sm"
                    @click="syncAll" 
                    :disabled="syncing"
                    class="h-9"
                >
                    <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': syncing }" />
                    {{ syncing ? '同步中...' : '立即同步' }}
                </Button>
                <Button size="sm" class="h-9" @click="showAdd = true">
                    <Plus class="w-4 h-4 mr-2" />
                    添加订阅
                </Button>
            </div>
        </div>

        <!-- Subscription List -->
        <div class="space-y-4">
            <!-- Loading State -->
            <div v-if="loading && subscriptions.length === 0" class="flex flex-col gap-3">
                <div v-for="i in 3" :key="i" class="h-20 w-full rounded-xl bg-muted/20 animate-pulse" />
            </div>

            <!-- Empty State -->
            <div v-else-if="subscriptions.length === 0" class="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-muted/5 border-dashed">
                <div class="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4 text-muted-foreground">
                    <Rss class="w-6 h-6" />
                </div>
                <h3 class="font-medium text-foreground">暂无订阅</h3>
                <p class="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                    添加订阅源 URL，自动获取最新的书源更新
                </p>
                <Button variant="outline" class="mt-4" @click="showAdd = true">
                    添加第一个订阅
                </Button>
            </div>

            <!-- List Items -->
            <div v-else class="grid gap-3">
                <div 
                    v-for="sub in subscriptions" 
                    :key="sub.url" 
                    class="group relative flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-muted/30 transition-all duration-300 hover:shadow-sm"
                >
                    <div class="flex items-center gap-4 min-w-0 flex-1">
                        <!-- Icon -->
                        <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary group-hover:scale-110 transition-transform duration-300">
                            <Globe class="w-5 h-5" />
                        </div>
                        
                        <!-- Info -->
                        <div class="min-w-0 space-y-1">
                            <div class="flex items-center gap-2">
                                <h3 class="font-medium truncate text-sm" :title="sub.url">{{ sub.url }}</h3>
                                <Badge variant="secondary" class="text-[10px] h-5 px-1.5 font-normal bg-secondary/50 text-muted-foreground" v-if="!sub.autoUpdate">
                                    手动
                                </Badge>
                                <Badge variant="outline" class="text-[10px] h-5 px-1.5 font-normal text-muted-foreground" v-else>
                                    每{{ formatInterval(sub.interval || 360) }}
                                </Badge>
                            </div>
                            <div class="flex items-center gap-3 text-xs text-muted-foreground">
                                <span class="flex items-center gap-1">
                                    <Clock class="w-3 h-3" />
                                    {{ formatTime(sub.lastSync) }}
                                </span>
                                <span v-if="syncing" class="text-primary flex items-center gap-1 animate-pulse">
                                    <RefreshCw class="w-3 h-3 animate-spin" />
                                    同步中
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-1 pl-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            class="text-muted-foreground hover:text-foreground transition-colors"
                            @click="openSettings(sub)"
                            title="设置"
                        >
                            <Settings2 class="w-4 h-4" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            @click="removeSubscription(sub)"
                            title="删除"
                        >
                            <Trash2 class="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Add Subscription Dialog -->
        <Dialog :open="showAdd" @update:open="showAdd = $event">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>添加新订阅</DialogTitle>
                    <DialogDescription>
                        输入订阅源的 URL 地址 (通常以 .json 结尾)
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div class="grid gap-2">
                        <Label htmlFor="url">订阅地址</Label>
                        <Input
                            id="url"
                            v-model="newUrl"
                            placeholder="https://example.com/booksource.json"
                            class="col-span-3 font-mono text-sm"
                        />
                    </div>
                    <div class="flex items-center justify-between">
                         <Label htmlFor="auto-update" class="text-sm font-normal text-muted-foreground">自动同步更新 (默认6小时)</Label>
                         <Switch id="auto-update" :checked="newAutoUpdate" @update:checked="newAutoUpdate = $event" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showAdd = false">取消</Button>
                    <Button @click="addSubscription">添加订阅</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Update Settings Dialog -->
        <Dialog :open="showSettings" @update:open="showSettings = $event">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>订阅设置</DialogTitle>
                    <DialogDescription>
                        配置 {{ editingSub?.url }} 的更新策略
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-6 py-4">
                    <div class="flex items-center justify-between">
                         <div class="space-y-0.5">
                            <Label class="text-base">自动更新</Label>
                            <p class="text-xs text-muted-foreground">定期检查并同步最新内容</p>
                         </div>
                         <Switch :checked="editAutoUpdate" @update:checked="editAutoUpdate = $event" />
                    </div>
                    
                    <div class="space-y-3" :class="{ 'opacity-50 pointer-events-none': !editAutoUpdate }">
                        <Label>更新频率</Label>
                        <Select v-model="editInterval">
                            <SelectTrigger>
                                <SelectValue placeholder="选择更新频率" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="60">每 1 小时</SelectItem>
                                <SelectItem value="360">每 6 小时</SelectItem>
                                <SelectItem value="720">每 12 小时</SelectItem>
                                <SelectItem value="1440">每 1 天</SelectItem>
                                <SelectItem value="10080">每 7 天</SelectItem>
                            </SelectContent>
                        </Select>
                        <p class="text-[10px] text-muted-foreground">
                            系统将以后台任务形式定期检查更新，需保持服务运行。
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showSettings = false">取消</Button>
                    <Button @click="saveSettings">保存设置</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- Sync Log Terminal -->
        <div 
            v-if="wsStore.syncLogs.length > 0" 
            class="rounded-xl border bg-black/90 text-green-400 p-4 font-mono text-xs overflow-hidden shadow-lg"
        >
            <div class="flex items-center justify-between pb-2 mb-2 border-b border-white/10 opacity-70">
                <span class="flex items-center gap-2">
                    <Terminal class="w-3.5 h-3.5" />
                    Sync Logs
                </span>
                <button class="hover:text-white transition-colors" @click="wsStore.clearLogs()">Clear</button>
            </div>
            <div class="h-32 overflow-y-auto space-y-1 custom-scrollbar">
                <div v-for="(log, i) in wsStore.syncLogs" :key="i" class="break-all opacity-90">
                    <span class="opacity-50 mr-2">$</span>{{ log }}
                </div>
            </div>
        </div>
    </div>
</template>
