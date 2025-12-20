<script setup lang="ts">
/**
 * AI 模型设置页面
 * 管理端侧 AI 模型的下载、切换、卸载
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAIStore, RECOMMENDED_MODELS } from '@/stores/ai'
import { ArrowLeft, Brain, Download, Trash2, Check, Loader2, AlertCircle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const router = useRouter()
const aiStore = useAIStore()

// 当前下载的模型 ID
const downloadingModel = ref<string | null>(null)

onMounted(async () => {
  await aiStore.checkSupport()
})

// 下载模型
async function downloadModel(modelId: string) {
  downloadingModel.value = modelId
  await aiStore.loadModel(modelId)
  downloadingModel.value = null
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- 导航栏 -->
    <header class="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
      <div class="container mx-auto flex h-14 max-w-screen-2xl items-center px-4 gap-4">
        <Button variant="ghost" size="icon" @click="router.back()">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <h1 class="font-semibold text-lg flex items-center gap-2">
          <Brain class="h-5 w-5 text-primary" />
          AI 模型管理
        </h1>
      </div>
    </header>

    <main class="container mx-auto max-w-screen-md px-4 py-8">
      <!-- WebGPU 不支持提示 -->
      <div v-if="!aiStore.isSupported.value" class="p-6 rounded-2xl bg-destructive/10 text-destructive mb-8">
        <div class="flex items-start gap-4">
          <AlertCircle class="h-6 w-6 shrink-0 mt-0.5" />
          <div>
            <h3 class="font-semibold mb-1">您的浏览器不支持 WebGPU</h3>
            <p class="text-sm opacity-80">端侧 AI 功能需要 WebGPU 支持。请使用 Chrome 113+、Edge 113+ 或 Safari 17+ 浏览器。</p>
          </div>
        </div>
      </div>

      <!-- 当前模型 -->
      <section v-if="aiStore.isModelLoaded.value" class="mb-8">
        <h2 class="text-sm font-medium text-muted-foreground mb-4">当前使用</h2>
        <div class="p-5 rounded-2xl border bg-card flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain class="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 class="font-medium">{{ aiStore.currentModel.value?.split('-').slice(0, 2).join(' ') }}</h3>
              <p class="text-sm text-muted-foreground">已加载，可在阅读时使用 AI 功能</p>
            </div>
          </div>
          <Button variant="outline" size="sm" @click="aiStore.unloadModel()">
            <Trash2 class="h-4 w-4 mr-2" />
            卸载
          </Button>
        </div>
      </section>

      <!-- 加载进度 -->
      <section v-if="aiStore.isLoading.value" class="mb-8">
        <h2 class="text-sm font-medium text-muted-foreground mb-4">正在下载</h2>
        <div class="p-5 rounded-2xl border bg-card">
          <div class="flex items-center gap-4 mb-4">
            <Loader2 class="w-8 h-8 animate-spin text-primary" />
            <div class="flex-1">
              <p class="font-medium mb-1">{{ aiStore.loadStatus.value }}</p>
              <div class="w-full bg-muted rounded-full h-2">
                <div 
                  class="bg-primary h-2 rounded-full transition-all"
                  :style="{ width: `${aiStore.loadProgress.value}%` }"
                />
              </div>
            </div>
            <span class="text-sm text-muted-foreground font-medium">{{ aiStore.loadProgress.value }}%</span>
          </div>
          <p class="text-xs text-muted-foreground">
            首次下载需要一些时间，模型会缓存到本地，下次打开无需重新下载。
          </p>
        </div>
      </section>

      <!-- 可用模型列表 -->
      <section>
        <h2 class="text-sm font-medium text-muted-foreground mb-4">可用模型</h2>
        <div class="space-y-3">
          <div
            v-for="model in RECOMMENDED_MODELS"
            :key="model.id"
            class="p-5 rounded-2xl border bg-card hover:border-primary/30 transition-colors"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <Brain class="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 class="font-medium flex items-center gap-2">
                    {{ model.name }}
                    <span 
                      v-if="aiStore.currentModel.value === model.id"
                      class="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full"
                    >
                      当前
                    </span>
                  </h3>
                  <p class="text-sm text-muted-foreground">{{ model.description }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-muted-foreground">{{ model.size }}</span>
                <Button 
                  v-if="aiStore.currentModel.value !== model.id"
                  variant="outline" 
                  size="sm"
                  :disabled="aiStore.isLoading.value"
                  @click="downloadModel(model.id)"
                >
                  <Download v-if="downloadingModel !== model.id" class="h-4 w-4 mr-2" />
                  <Loader2 v-else class="h-4 w-4 mr-2 animate-spin" />
                  {{ downloadingModel === model.id ? '下载中' : '下载' }}
                </Button>
                <div v-else class="flex items-center gap-1 text-primary">
                  <Check class="h-4 w-4" />
                  <span class="text-sm font-medium">已加载</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 说明 -->
      <section class="mt-8 p-5 rounded-2xl bg-muted/50">
        <h3 class="font-medium mb-3">关于端侧 AI</h3>
        <ul class="text-sm text-muted-foreground space-y-2">
          <li>• 模型完全运行在您的设备上，数据不会上传到云端</li>
          <li>• 首次下载后会缓存到本地，下次使用无需重新下载</li>
          <li>• 推荐使用 <strong>Qwen 2.5 1.5B</strong>，对中文支持更好</li>
          <li>• 需要较新的浏览器和支持 WebGPU 的显卡</li>
        </ul>
      </section>
    </main>
  </div>
</template>
