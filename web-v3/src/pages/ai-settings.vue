<script setup lang="ts">
/**
 * AI 模型设置页面
 * 管理端侧 AI 模型的下载、切换、卸载
 */
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
  useAIStore,
  getRecommendedModels,
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
  Search,
  Sparkles,
  Info,
  X,
  Zap,
  Settings,
  ChevronDown,
  ChevronUp,
  Infinity,
  Sparkles as SparklesIcon,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";

const router = useRouter();
const aiStore = useAIStore();
const settingsStore = useSettingsStore();
const { success, error } = useMessage();
const { confirm } = useConfirm();
const { handlePromiseError } = useErrorHandler();

// 状态
const downloadingModel = ref<string | null>(null);
const storageUsage = ref<{ used: number; quota: number } | null>(null);
const searchKeyword = ref("");
const showParamsConfig = ref(false);
const showRecommendedOnly = ref(false);

// 模型系列图标映射
const modelSeriesIcons: Record<string, any> = {
  Qwen: SparklesIcon,
  Llama: Infinity,
  Phi: Brain,
  Gemma: Zap,
  Mistral: SparklesIcon,
  SmolLM: Zap,
  TinyLlama: Infinity,
  RedPajama: Brain,
  Hermes: Infinity,
  WizardMath: SparklesIcon,
  DeepSeek: Brain,
  StableLM: Zap,
};

// 获取模型系列图标
function getModelSeriesIcon(series: string) {
  return modelSeriesIcons[series] || Brain;
}


// 计算显示的模型列表（支持搜索和推荐筛选）
const displayModels = computed(() => {
  let models = getAllModels();

  // 按推荐筛选
  if (showRecommendedOnly.value) {
    models = models.filter((m: any) => m.recommended === true);
  }

  // 按搜索词筛选
  if (searchKeyword.value.trim()) {
    const query = searchKeyword.value.toLowerCase();
    models = models.filter(
      (m: any) =>
        m.id.toLowerCase().includes(query) ||
        m.name.toLowerCase().includes(query) ||
        (m.vendor && m.vendor.toLowerCase().includes(query))
    );
  }

  return models;
});

// 格式化存储大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

const stats = computed(() => {
  const recommended = getRecommendedModels();
  return {
    total: getAllModels().length,
    recommended: recommended.length,
    filtered: displayModels.value.length,
    loaded: aiStore.isModelLoaded ? 1 : 0,
  };
});


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

// 返回
function goBack() {
  router.back();
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
  } catch (e) {
    handlePromiseError(e, "清理失败");
  }
}
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <!-- 第一行：返回、搜索（居中）、清理缓存（居右） -->
      <div class="flex items-center gap-3 mb-4">
        <!-- 返回按钮 -->
        <button
          class="w-10 h-10 rounded-full hover:bg-secondary/80 flex items-center justify-center transition-colors shrink-0"
          @click="goBack"
          title="返回书架"
          aria-label="返回书架"
        >
          <ArrowLeft class="h-5 w-5 text-muted-foreground" />
        </button>

        <!-- 搜索框（居中） -->
        <div class="flex-1 flex justify-center">
          <div class="relative group w-full max-w-md">
            <div
              class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10"
            >
              <Search
                class="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors"
              />
            </div>
            <Input
              v-model="searchKeyword"
              class="pl-10 pr-10 h-10 rounded-full bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0"
              placeholder="搜索模型名称、厂商..."
            />
            <button
              v-if="searchKeyword"
              class="absolute inset-y-0 right-0 pr-3 flex items-center z-10"
              @click="searchKeyword = ''"
              aria-label="清除"
            >
              <X
                class="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
              />
            </button>
          </div>
        </div>

        <!-- 操作按钮组（居右） -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- 清理缓存 -->
          <Button
            v-if="storageUsage"
            variant="outline"
            size="sm"
            @click="clearCache"
          >
            <Trash2 class="h-4 w-4 mr-2" />
            <span class="hidden sm:inline">清理缓存</span>
          </Button>
        </div>
      </div>

      <!-- 第二行：全部模型标题、统计信息 -->
      <div class="flex items-center justify-between mb-6">
        <!-- 全部模型标题 -->
        <div class="flex items-center gap-2 shrink-0">
          <component
            :is="showRecommendedOnly ? SparklesIcon : Brain"
            class="w-4 h-4 text-primary"
          />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"
          >
            {{ showRecommendedOnly ? "推荐模型" : "全部模型" }}
            <span
              class="text-xs font-normal text-muted-foreground/60 normal-case"
              >({{ stats.filtered }})</span
            >
          </h2>
        </div>

        <!-- 统计信息 -->
        <button
          class="flex items-center gap-2 text-sm font-medium bg-muted px-3 py-1.5 rounded-md border shrink-0 transition-all cursor-pointer"
          :class="
            showRecommendedOnly
              ? 'bg-primary/10 border-primary/50 text-primary hover:bg-primary/20'
              : 'text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
          "
          @click="showRecommendedOnly = !showRecommendedOnly"
          :title="showRecommendedOnly ? '显示全部模型' : '只显示推荐模型'"
        >
          <SparklesIcon
            class="h-3.5 w-3.5 shrink-0"
            :class="showRecommendedOnly ? 'text-primary' : 'text-muted-foreground'"
          />
          <span>{{ stats.recommended }} 推荐</span>
          <span class="opacity-50">/</span>
          <span>{{ stats.total }} 总计</span>
        </button>
      </div>

      <!-- WebGPU 不支持提示 -->
      <div
        v-if="!aiStore.isSupported"
        class="p-6 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div class="flex items-start gap-4">
          <AlertCircle class="h-6 w-6 shrink-0 mt-0.5" />
          <div>
            <h3 class="font-semibold mb-1">您的浏览器不支持 WebGPU</h3>
            <p class="text-sm opacity-80">
              端侧 AI 功能需要 WebGPU 支持。请使用 Chrome 113+、Edge 113+ 或
              Safari 17+ 浏览器。
            </p>
          </div>
        </div>
      </div>

      <!-- 当前模型 -->
      <section
        v-if="aiStore.isModelLoaded"
        class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div class="flex items-center gap-2 mb-4 px-1">
          <Check class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            当前使用
          </h2>
        </div>
        <div
          class="p-5 rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 flex items-center justify-between"
        >
          <div class="flex items-center gap-4">
            <div
              class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"
            >
              <Brain class="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 class="font-semibold text-base">
                {{ aiStore.currentModel?.split("-").slice(0, 2).join(" ") }}
              </h3>
              <p class="text-sm text-muted-foreground mt-0.5">
                已加载，可在阅读时使用 AI 功能
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="rounded-full"
            @click="aiStore.unloadModel()"
          >
            <Trash2 class="h-4 w-4 mr-2" />
            卸载
          </Button>
        </div>
      </section>

      <!-- 加载进度 -->
      <section
        v-if="aiStore.isLoading"
        class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100"
      >
        <div class="flex items-center gap-2 mb-4 px-1">
          <Loader2 class="w-4 h-4 text-primary animate-spin" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            正在下载
          </h2>
        </div>
        <div class="p-5 rounded-2xl border border-border/50 bg-card">
          <div class="flex items-center gap-4 mb-4">
            <Loader2 class="w-8 h-8 animate-spin text-primary" />
            <div class="flex-1">
              <p class="font-semibold mb-2">{{ aiStore.loadStatus }}</p>
              <div class="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  class="bg-primary h-2.5 rounded-full transition-all duration-300"
                  :style="{ width: `${aiStore.loadProgress}%` }"
                />
              </div>
            </div>
            <span
              class="text-sm text-muted-foreground font-semibold tabular-nums"
              >{{ aiStore.loadProgress }}%</span
            >
          </div>
          <p class="text-xs text-muted-foreground">
            首次下载需要一些时间，模型会缓存到本地，下次打开无需重新下载。
          </p>
        </div>
      </section>

      <!-- 功能设置 -->
      <section
        v-if="aiStore.isModelLoaded"
        class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200"
      >
        <div class="flex items-center gap-2 mb-4 px-1">
          <Sparkles class="w-4 h-4 text-primary" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            功能设置
          </h2>
        </div>
        <div
          class="rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-all duration-300 hover:shadow-lg hover:shadow-black/5 overflow-hidden"
        >
          <!-- 自动摘要 -->
          <div class="p-5 flex items-center justify-between border-b border-border/40">
            <div class="flex items-center gap-4">
              <div
                class="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center"
              >
                <Sparkles class="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <h3 class="font-semibold text-base">自动生成摘要</h3>
                <p class="text-sm text-muted-foreground mt-0.5">
                  每章开始时自动提炼核心内容
                </p>
              </div>
            </div>
            <Switch
              :checked="settingsStore.config.autoSummary"
              @update:checked="(v: boolean) => settingsStore.updateConfig('autoSummary', v)"
              class="data-[state=checked]:bg-primary"
            />
          </div>

          <!-- 模型参数配置 -->
          <div class="border-b border-border/40">
            <button
              class="w-full p-5 flex items-center justify-between hover:bg-muted/50 transition-colors"
              @click="showParamsConfig = !showParamsConfig"
            >
              <div class="flex items-center gap-4">
                <div
                  class="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center"
                >
                  <Settings class="h-6 w-6 text-blue-500" />
                </div>
                <div class="text-left">
                  <h3 class="font-semibold text-base">模型参数</h3>
                  <p class="text-sm text-muted-foreground mt-0.5">
                    调整温度、采样等参数
                  </p>
                </div>
              </div>
              <ChevronDown
                class="h-5 w-5 text-muted-foreground transition-transform"
                :class="{ 'rotate-180': showParamsConfig }"
              />
            </button>

            <!-- 参数配置面板 -->
            <div
              v-show="showParamsConfig"
              class="px-5 pb-5 pt-2 space-y-4 animate-in slide-in-from-top-2 duration-200"
            >
              <!-- 随机性 (Temperature) -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">
                    随机性 (Temperature)
                  </label>
                  <span class="text-sm text-muted-foreground font-mono">
                    {{ settingsStore.config.aiParams.temperature.toFixed(1) }}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground">
                  值越大，回复越随机
                </p>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  :value="settingsStore.config.aiParams.temperature"
                  @input="(e: any) => settingsStore.updateConfig('aiParams', { ...settingsStore.config.aiParams, temperature: parseFloat(e.target.value) })"
                  class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div class="flex justify-between text-xs text-muted-foreground">
                  <span>保守</span>
                  <span>平衡</span>
                  <span>创意</span>
                </div>
              </div>

              <!-- 核采样 (Top-p) -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">核采样 (Top-p)</label>
                  <span class="text-sm text-muted-foreground font-mono">
                    {{ settingsStore.config.aiParams.topP.toFixed(2) }}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground">
                  与随机性类似，但不要和随机性一起更改
                </p>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  :value="settingsStore.config.aiParams.topP"
                  @input="(e: any) => settingsStore.updateConfig('aiParams', { ...settingsStore.config.aiParams, topP: parseFloat(e.target.value) })"
                  class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <!-- 单次回复限制 (Max Tokens) -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">
                    单次回复限制 (Max Tokens)
                  </label>
                  <Input
                    type="number"
                    :model-value="settingsStore.config.aiParams.maxTokens"
                    @update:model-value="(v: string) => settingsStore.updateConfig('aiParams', { ...settingsStore.config.aiParams, maxTokens: parseInt(v) || 2048 })"
                    class="w-24 h-8 text-sm"
                    min="128"
                    max="8192"
                    step="128"
                  />
                </div>
                <p class="text-xs text-muted-foreground">
                  单次交互所用的最大 Token 数
                </p>
              </div>

              <!-- 上下文窗口 (Context Window) -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">
                    上下文窗口 (Context Window)
                  </label>
                  <Input
                    type="number"
                    :model-value="settingsStore.config.aiParams.contextWindow"
                    @update:model-value="(v: string) => settingsStore.updateConfig('aiParams', { ...settingsStore.config.aiParams, contextWindow: parseInt(v) || 4096 })"
                    class="w-24 h-8 text-sm"
                    min="1024"
                    max="32768"
                    step="1024"
                  />
                </div>
                <p class="text-xs text-muted-foreground">
                  上下文窗口的最大 Token 数
                </p>
              </div>

              <!-- 话题新鲜度 (Presence Penalty) -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">
                    话题新鲜度 (Presence Penalty)
                  </label>
                  <span class="text-sm text-muted-foreground font-mono">
                    {{ settingsStore.config.aiParams.presencePenalty.toFixed(1) }}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground">
                  值越大，越有可能扩展到新话题
                </p>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  :value="settingsStore.config.aiParams.presencePenalty"
                  @input="(e: any) => settingsStore.updateConfig('aiParams', { ...settingsStore.config.aiParams, presencePenalty: parseFloat(e.target.value) })"
                  class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <!-- 频率惩罚度 (Frequency Penalty) -->
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <label class="text-sm font-medium">
                    频率惩罚度 (Frequency Penalty)
                  </label>
                  <span class="text-sm text-muted-foreground font-mono">
                    {{ settingsStore.config.aiParams.frequencyPenalty.toFixed(1) }}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground">
                  值越大，越有可能降低重复字词
                </p>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  :value="settingsStore.config.aiParams.frequencyPenalty"
                  @input="(e: any) => settingsStore.updateConfig('aiParams', { ...settingsStore.config.aiParams, frequencyPenalty: parseFloat(e.target.value) })"
                  class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 可用模型列表 -->
      <section class="animate-in fade-in slide-in-from-bottom-4 duration-500">

        <!-- 空状态 -->
        <div
          v-if="displayModels.length === 0"
          class="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500"
        >
          <div
            class="w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center mb-6"
          >
            <Brain class="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 class="text-lg font-semibold mb-2 text-foreground">
            未找到匹配的模型
          </h3>
          <p
            class="text-muted-foreground text-sm mb-8 max-w-xs mx-auto leading-relaxed"
          >
            尝试更换搜索关键词或选择其他厂商
          </p>
          <Button variant="outline" @click="searchKeyword = ''; selectedVendor = '全部'">
            清除筛选
          </Button>
        </div>

        <!-- 模型列表 -->
        <div
          v-else
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
        >
          <div
            v-for="model in displayModels"
            :key="model.id"
            class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden"
            :class="{
              'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50':
                aiStore.currentModel === model.id,
              'border-border/50 hover:border-border hover:shadow-md':
                aiStore.currentModel !== model.id,
            }"
          >
            <div class="p-4 h-full flex flex-col gap-3">
              <!-- 顶部: 图标 + 标题 + 标签 -->
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-start gap-3 min-w-0 flex-1">
                  <!-- 图标 -->
                  <div
                    class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                    :class="
                      aiStore.currentModel === model.id
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted/50 text-muted-foreground'
                    "
                  >
                    <component
                      :is="getModelSeriesIcon(model.series)"
                      class="h-5 w-5"
                    />
                  </div>

                  <!-- 标题 & 标签 -->
                  <div class="flex-1 min-w-0">
                    <h3
                      class="font-semibold text-sm leading-tight mb-1.5 text-foreground line-clamp-2"
                    >
                      {{ model.name }}
                    </h3>
                    <div class="flex items-center gap-1.5 flex-wrap mb-1.5">
                      <Badge
                        v-if="aiStore.currentModel === model.id"
                        variant="secondary"
                        class="rounded-md px-2 py-0.5 text-xs bg-primary/10 text-primary font-normal"
                      >
                        当前使用
                      </Badge>
                      <Badge
                        v-if="model.recommended"
                        variant="secondary"
                        class="rounded-md px-2 py-0.5 text-xs bg-green-500/10 text-green-600 dark:text-green-400 font-normal"
                      >
                        推荐
                      </Badge>
                      <span
                        v-if="model.vendor"
                        class="text-xs text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded"
                      >
                        {{ model.vendor }}
                      </span>
                    </div>
                    <!-- 模型规格信息 -->
                    <div class="flex items-center gap-2 flex-wrap text-xs text-muted-foreground/70">
                      <span v-if="model.params && model.params !== '未知'">
                        {{ model.params }}
                      </span>
                      <span v-if="model.quantization && model.quantization !== '未知'">
                        {{ model.quantization }}
                      </span>
                      <span>{{ model.size }}</span>
                      <span v-if="model.contextWindow">
                        {{ Math.round(model.contextWindow / 1024) }}K 上下文
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 底部: 操作按钮 -->
              <div
                class="flex items-center justify-between pt-2 border-t border-border/40"
              >
                <div
                  v-if="aiStore.currentModel === model.id"
                  class="flex items-center gap-1.5 text-primary text-xs font-medium"
                >
                  <Check class="h-3.5 w-3.5" />
                  <span>已加载</span>
                </div>
                <div v-else class="text-xs text-muted-foreground/60">
                  <template v-if="model.recommended">
                    <span v-if="model.id.includes('Qwen2.5-3B')">
                      推荐用于中文网文推理、剧情理解与朗读文案生成
                    </span>
                    <span v-else-if="model.id.includes('Qwen2.5-7B')">
                      高配推荐：更强推理与长文理解能力，适合显存充足设备
                    </span>
                    <span v-else-if="model.id.includes('Llama-3.2-3B')">
                      轻量推荐：通用中文推理与阅读理解表现较好
                    </span>
                    <span v-else>
                      推荐使用
                    </span>
                  </template>
                  <template v-else>
                    点击下载
                  </template>
                </div>

                <!-- 下载按钮 -->
                <Button
                  v-if="aiStore.currentModel !== model.id"
                  variant="outline"
                  size="sm"
                  class="rounded-md h-7 px-3 text-xs"
                  :disabled="aiStore.isLoading"
                  @click.stop="downloadModel(model.id)"
                >
                  <Download
                    v-if="downloadingModel !== model.id"
                    class="h-3.5 w-3.5 mr-1.5"
                  />
                  <Loader2
                    v-else
                    class="h-3.5 w-3.5 mr-1.5 animate-spin"
                  />
                  {{ downloadingModel === model.id ? "下载中" : "下载" }}
                </Button>
                <Button
                  v-else
                  variant="outline"
                  size="sm"
                  class="rounded-md h-7 px-3 text-xs"
                  @click.stop="aiStore.unloadModel()"
                >
                  <Trash2 class="h-3.5 w-3.5 mr-1.5" />
                  卸载
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 存储管理（简化版） -->
      <section
        v-if="storageUsage"
        class="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div
          class="p-4 rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-all duration-300"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <HardDrive class="h-5 w-5 text-muted-foreground" />
              <div>
                <p class="text-sm font-medium">存储使用</p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ formatBytes(storageUsage.used) }} /
                  {{ formatBytes(storageUsage.quota) }}
                </p>
              </div>
            </div>
          </div>
          <div class="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              class="bg-primary h-2 rounded-full transition-all duration-300"
              :style="{
                width: `${Math.min(
                  (storageUsage.used / storageUsage.quota) * 100,
                  100
                )}%`,
              }"
            />
          </div>
        </div>
      </section>

      <!-- 说明 -->
      <section
        class="mt-8 p-6 rounded-2xl bg-muted/50 border border-border/30 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <h3 class="font-semibold text-base mb-3 flex items-center gap-2">
          <Info class="h-5 w-5 text-primary" />
          关于端侧 AI
        </h3>
        <ul class="text-sm text-muted-foreground space-y-2.5">
          <li class="flex items-start gap-2">
            <span class="text-primary mt-0.5">•</span>
            <span>模型完全运行在您的设备上，数据不会上传到云端</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-primary mt-0.5">•</span>
            <span>首次下载后会缓存到本地，下次使用无需重新下载</span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-primary mt-0.5">•</span>
            <span>
              推荐优先使用
              <strong class="text-foreground">Qwen 2.5 3B</strong>
              或
              <strong class="text-foreground">Llama 3.2 3B</strong>
              做网文内容推理与改写；显存充足时可选择
              <strong class="text-foreground">Qwen 2.5 7B</strong>
              获取更强推理能力
            </span>
          </li>
          <li class="flex items-start gap-2">
            <span class="text-primary mt-0.5">•</span>
            <span>使用 Web Worker 多线程，AI 推理不会卡顿界面</span>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}

/* 滑块样式 */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

input[type="range"]::-webkit-slider-track {
  background: hsl(var(--muted));
  height: 8px;
  border-radius: 4px;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  background: hsl(var(--primary));
  height: 18px;
  width: 18px;
  border-radius: 50%;
  margin-top: -5px;
  transition: all 0.2s;
}

input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 0 0 4px hsl(var(--primary) / 0.2);
}

input[type="range"]::-moz-range-track {
  background: hsl(var(--muted));
  height: 8px;
  border-radius: 4px;
}

input[type="range"]::-moz-range-thumb {
  background: hsl(var(--primary));
  height: 18px;
  width: 18px;
  border-radius: 50%;
  border: none;
  transition: all 0.2s;
}

input[type="range"]::-moz-range-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 0 0 4px hsl(var(--primary) / 0.2);
}
</style>
