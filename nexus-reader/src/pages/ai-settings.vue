<script setup lang="ts">
/**
 * AI 模型设置页面
 * 管理端侧 AI 模型的下载、切换、卸载
 */
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
  useAIStore,
  getAllModels,
} from "@/stores/ai";
import { useSettingsStore } from "@/stores/settings";
import {
  ArrowLeft,
  Brain,
  Download,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  HardDrive,
  Settings,
  ChevronDown,
  Sparkles,
  Zap,
  Infinity as InfinityIcon,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";
import type { IconComponent } from '@/types/components'

const router = useRouter();
const aiStore = useAIStore();
const settingsStore = useSettingsStore();
const { success, error } = useMessage();
const { confirm } = useConfirm();
const { handlePromiseError } = useErrorHandler();

// 状态
const downloadingModel = ref<string | null>(null);
const storageUsage = ref<{ used: number; quota: number } | null>(null);
const showParamsConfig = ref(false);

// 模型系列图标映射
const modelSeriesIcons: Record<string, IconComponent> = {
  Qwen: Sparkles,
  Llama: InfinityIcon,
  Phi: Brain,
  Gemma: Zap,
  Mistral: Sparkles, 
};

// 获取模型系列图标
function getModelSeriesIcon(modelId: string) {
  if (modelId.toLowerCase().includes('qwen')) return Sparkles;
  if (modelId.toLowerCase().includes('llama')) return InfinityIcon;
  return Brain;
}

// 格式化存储大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// 获取模型列表（已在 store 中严格过滤）
const models = computed(() => getAllModels());

onMounted(async () => {
  await aiStore.checkSupport();

  // 获取存储使用情况
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    storageUsage.value = {
      used: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
});

// 下载模型
async function downloadModel(modelId: string) {
  downloadingModel.value = modelId;
  await aiStore.loadModel(modelId);
  downloadingModel.value = null;
}

// 清理缓存
async function clearCache() {
  const result = await confirm({
    title: '确认清理缓存',
    description: '确定要清理所有 AI 模型缓存吗？这将需要重新下载模型。',
    variant: 'destructive',
  });
  if (!result) return;

  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (name.includes("webllm") || name.includes("mlc")) {
        await caches.delete(name);
      }
    }
    aiStore.unloadModel();
    success("缓存已清理");
    // 刷新存储状态
    if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        storageUsage.value = { used: estimate.usage || 0, quota: estimate.quota || 0 };
    }
  } catch (e) {
    handlePromiseError(e, "清理失败");
  }
}
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 顶部导航 -->
    <header class="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/40">
      <div class="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <button
            class="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center transition-colors"
            @click="router.back()"
          >
            <ArrowLeft class="h-4 w-4 text-muted-foreground" />
          </button>
          <span class="font-medium text-sm">AI 模型管理</span>
        </div>
        
        <Button
          v-if="storageUsage && storageUsage.used > 0"
          variant="ghost"
          size="sm"
          class="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          @click="clearCache"
        >
          <Trash2 class="h-3.5 w-3.5 mr-1.5" />
          清理缓存
        </Button>
      </div>
    </header>

    <main class="max-w-3xl mx-auto px-4 py-6 space-y-8">
      
      <!-- 错误提示 -->
      <div
        v-if="!aiStore.isSupported"
        class="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-destructive flex gap-3 text-sm animate-in fade-in slide-in-from-top-2"
      >
        <AlertCircle class="h-5 w-5 shrink-0" />
        <div>
            <p class="font-medium">WebGPU 不受支持</p>
            <p class="opacity-80 mt-0.5 text-xs">请使用 Chrome 113+、Edge 113+ 或 Safari 17+ 浏览器。</p>
        </div>
      </div>

      <!-- 当前状态 / 下载进度 -->
      <div v-if="aiStore.isLoading" class="bg-card rounded-xl border border-border/50 p-4 animate-in fade-in zoom-in-95">
         <div class="flex items-center gap-3 mb-3">
            <Loader2 class="h-5 w-5 text-primary animate-spin" />
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">正在下载模型...</p>
                <p class="text-xs text-muted-foreground truncate">{{ aiStore.loadStatus }}</p>
            </div>
            <span class="text-xs font-mono font-medium">{{ aiStore.loadProgress }}%</span>
         </div>
         <div class="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div class="h-full bg-primary transition-all duration-300" :style="{ width: `${aiStore.loadProgress}%` }" />
         </div>
      </div>

      <!-- 可用模型列表 -->
      <div class="space-y-4">
        <div class="px-1 space-y-1">
             <h2 class="text-xs font-medium text-muted-foreground uppercase tracking-wider">精选模型 (5GB - 10GB)</h2>
             <p class="text-[10px] text-muted-foreground/60">适合网文深度分析、角色扮演与朗读情感驱动</p>
        </div>
        
        <div class="grid gap-3">
          <div
            v-for="model in models"
            :key="model.id"
            class="group relative bg-card hover:bg-muted/40 rounded-xl border border-border/40 hover:border-border transition-all duration-200 overflow-hidden"
            :class="aiStore.currentModel === model.id ? 'ring-1 ring-primary/20 bg-primary/5' : ''"
          >
            <div class="p-4 flex items-center gap-4">
              <!-- 图标 -->
              <div 
                class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                :class="aiStore.currentModel === model.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground/60'"
              >
                <component :is="getModelSeriesIcon(model.id)" class="h-5 w-5" />
              </div>

              <!-- 信息 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                   <h3 class="text-sm font-medium text-foreground truncate">{{ model.name }}</h3>
                   <Badge v-if="aiStore.currentModel === model.id" variant="secondary" class="bg-primary/10 text-primary h-5 px-1.5 text-[10px] font-normal rounded">当前使用</Badge>
                </div>
                <div class="flex items-center gap-3 text-xs text-muted-foreground/60 font-mono">
                    <span>{{ model.params }}</span>
                    <span class="w-px h-2.5 bg-border/60"></span>
                    <span>{{ model.quantization }}</span>
                    <span class="w-px h-2.5 bg-border/60"></span>
                    <span>{{ model.size }}</span>
                </div>
              </div>

              <!-- 操作 -->
              <div class="shrink-0">
                 <Button
                    v-if="aiStore.currentModel !== model.id"
                    variant="outline"
                    size="sm"
                    class="h-8 px-3 text-xs font-medium rounded-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                    :disabled="aiStore.isLoading"
                    @click="downloadModel(model.id)"
                 >
                    <Download v-if="downloadingModel !== model.id" class="h-3.5 w-3.5 mr-1.5" />
                    <Loader2 v-else class="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    {{ downloadingModel === model.id ? '下载中' : '使用' }}
                 </Button>
                 
                 <Button
                    v-else
                    variant="ghost"
                    size="sm"
                    class="h-8 px-3 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    @click="aiStore.unloadModel()"
                 >
                    卸载
                 </Button>
              </div>
            </div>
          </div>
          
          <!-- 空状态 -->
          <div v-if="models.length === 0" class="py-12 text-center">
            <p class="text-sm text-muted-foreground">未找到符合条件的推荐模型</p>
          </div>
        </div>
      </div>

      <!-- 高级设置 -->
      <div v-if="aiStore.isModelLoaded" class="space-y-3 pt-4 border-t border-border/40">
        <button 
            @click="showParamsConfig = !showParamsConfig"
            class="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider px-1"
        >
            <span>高级设置</span>
            <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="{ 'rotate-180': showParamsConfig }" />
        </button>

        <div v-show="showParamsConfig" class="bg-card rounded-xl border border-border/50 divide-y divide-border/30 animate-in slide-in-from-top-2">
            <!-- 自动摘要 -->
             <div class="p-4 flex items-center justify-between">
                <div>
                    <div class="text-sm font-medium mb-0.5">自动生成摘要</div>
                    <div class="text-xs text-muted-foreground">每章开始时自动提炼核心内容</div>
                </div>
                <Switch
                  :checked="settingsStore.config.autoSummary"
                  @update:checked="(v: boolean) => settingsStore.updateConfig('autoSummary', v)"
                  class="data-[state=checked]:bg-primary scale-90"
                />
            </div>
            
             <!-- Temperature -->
            <div class="p-4 space-y-3">
                <div class="flex items-center justify-between">
                    <label class="text-xs font-medium">随机性 (Temperature)</label>
                    <span class="text-xs font-mono text-muted-foreground">{{ settingsStore.config.aiParams.temperature }}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  :value="settingsStore.config.aiParams.temperature"
                  @input="(e: Event) => settingsStore.updateConfig('aiParams', { ...settingsStore.config.aiParams, temperature: parseFloat((e.target as HTMLInputElement).value) })"
                  class="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                />
                 <div class="flex justify-between text-[10px] text-muted-foreground">
                  <span>精确</span>
                  <span>均衡</span>
                  <span>创造性</span>
                </div>
            </div>

            <!-- Max Tokens -->
             <div class="p-4 flex items-center justify-between">
                 <div class="flex-1 mr-4">
                    <label class="text-xs font-medium block mb-0.5">单次回复长度</label>
                    <p class="text-[10px] text-muted-foreground">限制 AI 单次回复的最大字数</p>
                 </div>
                 <Input
                    type="number"
                    :model-value="settingsStore.config.aiParams.maxTokens"
                    @update:model-value="(v: string) => settingsStore.updateConfig('aiParams', { ...settingsStore.config.aiParams, maxTokens: parseInt(v) || 2048 })"
                    class="w-20 h-7 text-xs text-center"
                  />
            </div>
        </div>
      </div>
      
      <!-- 存储信息 Footer -->
      <div v-if="storageUsage" class="flex items-center justify-between px-1 pt-4 text-[10px] text-muted-foreground/50">
        <div class="flex items-center gap-1.5">
            <HardDrive class="h-3 w-3" />
            <span>存储已用 {{ formatBytes(storageUsage.used) }} / {{ formatBytes(storageUsage.quota) }}</span>
        </div>
      </div>

    </main>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top);
}
</style>
