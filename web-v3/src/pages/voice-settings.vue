<script setup lang="ts">
/**
 * 自定义音色朗读引擎管理页面
 * 管理音色模型、训练、导入导出等功能
 */
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
  Volume2,
  Plus,
  Upload,
  Download,
  Trash2,
  Play,
  Loader2,
  Star,
  StarOff,
  AlertCircle,
  X,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";
import { useVoiceStore } from "@/stores/voice";
import {
  PageHeader,
  PageToolbar,
  EmptyState,
  LoadingGrid,
} from "@/components/common";
import type { VoiceModel } from "@/types/voice";

const router = useRouter();
const voiceStore = useVoiceStore();
const { success, error } = useMessage();
const { confirm } = useConfirm();
const { handlePromiseError } = useErrorHandler();

// 状态
const isLoading = ref(false);
const voices = ref<VoiceModel[]>([]);
const searchKeyword = ref("");
const selectedVoice = ref<VoiceModel | null>(null);
const isTestingVoice = ref(false);
const showTestPanel = ref(false);

// 获取音色列表
async function loadVoices() {
  isLoading.value = true;
  try {
    await voiceStore.loadVoices();
    voices.value = [...voiceStore.voices];
  } catch (e) {
    handlePromiseError(e, "加载音色列表失败");
  } finally {
    isLoading.value = false;
  }
}

// 计算显示的音色列表
const displayVoices = computed(() => {
  let list = voices.value;

  if (searchKeyword.value.trim()) {
    const query = searchKeyword.value.toLowerCase();
    list = list.filter(
      (v) =>
        v.name.toLowerCase().includes(query) ||
        v.metadata.language.toLowerCase().includes(query) ||
        (v.metadata.description &&
          v.metadata.description.toLowerCase().includes(query))
    );
  }

  return list;
});

// 统计信息
const stats = computed(() => ({
  total: voices.value.length,
  default: voiceStore.defaultVoice.value ? 1 : 0,
}));

// 设置默认音色
async function setDefaultVoice(voiceId: string) {
  try {
    voiceStore.saveDefaultVoiceId(voiceId);
    await loadVoices();
    success("默认音色已设置");
  } catch (e) {
    handlePromiseError(e, "设置默认音色失败");
  }
}

// 删除音色
async function deleteVoice(voiceModel: VoiceModel) {
  const result = await confirm({
    title: "确认删除",
    description: `确定要删除音色 "${voiceModel.name}" 吗？此操作不可恢复。`,
  });

  if (!result) return;

  try {
    await voiceStore.deleteVoice(voiceModel.id);
    await loadVoices();
    success("音色已删除");
  } catch (e) {
    handlePromiseError(e, "删除音色失败");
  }
}

// 导出音色
async function exportVoice(voiceModel: VoiceModel) {
  try {
    const modelData = await voiceStore.getVoiceModel(voiceModel.id);
    if (!modelData) {
      error("无法获取音色模型数据");
      return;
    }
    const data = {
      voice: voiceModel,
      modelData: Array.from(new Uint8Array(modelData)),
      exportedAt: Date.now(),
      version: "1.0",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voice_${voiceModel.name}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success("音色导出成功");
  } catch (e) {
    handlePromiseError(e, "导出音色失败");
  }
}

// 导入音色
async function importVoice(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.voice && data.modelData) {
      const modelBuffer = new Uint8Array(data.modelData).buffer;
      await voiceStore.addVoice(data.voice, modelBuffer);
      await loadVoices();
      success("音色导入成功");
    } else {
      error("文件格式不正确");
    }
  } catch (e) {
    handlePromiseError(e, "导入音色失败");
  } finally {
    input.value = "";
  }
}

// 测试音色
function openTestPanel(voice: VoiceModel) {
  selectedVoice.value = voice;
  showTestPanel.value = true;
}

async function testVoice() {
  if (!selectedVoice.value || isTestingVoice.value) return;

  isTestingVoice.value = true;
  try {
    // TODO: 实际调用 TTS 生成音频
    await new Promise((resolve) => setTimeout(resolve, 1000));
    success("测试功能开发中，请稍后");
  } catch (e) {
    handlePromiseError(e, "测试音色失败");
  } finally {
    isTestingVoice.value = false;
  }
}

// 格式化文件大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// 格式化时长
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}分${secs}秒`;
}

onMounted(() => {
  loadVoices();
});
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20">
    <div class="h-safe-top" />

    <!-- 主内容区 -->
    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
      <!-- 页面头部 -->
      <PageHeader
        :search-value="searchKeyword"
        search-placeholder="搜索音色..."
        :actions="[
          {
            label: '导入',
            icon: Upload,
            onClick: () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json';
              input.onchange = importVoice;
              input.click();
            },
            variant: 'outline',
            hideLabelOnMobile: true,
          },
          {
            label: '训练音色',
            icon: Plus,
            onClick: () => {},
            variant: 'default',
          },
        ]"
        @update:search-value="searchKeyword = $event"
        @back="router.push('/settings')"
      />

      <!-- 页面工具栏 -->
      <PageToolbar
        title="全部音色"
        :icon="Volume2"
        :count="stats.total"
        :stats="[
          {
            label: '默认',
            value: stats.default,
            color: '#f59e0b',
          },
        ]"
        :show-manage-button="false"
      />

      <!-- 加载状态 -->
      <LoadingGrid v-if="isLoading" />

      <!-- 空状态 -->
      <EmptyState
        v-else-if="displayVoices.length === 0"
        :icon="Volume2"
        :title="searchKeyword ? '未找到匹配的音色' : '暂无音色'"
        :description="
          searchKeyword
            ? '尝试更换搜索关键词'
            : '导入或训练你的第一个自定义音色'
        "
        :actions="[
          searchKeyword
            ? {
                label: '查看全部',
                onClick: () => (searchKeyword = ''),
                variant: 'outline',
              }
            : {
                label: '导入音色',
                icon: Upload,
                onClick: () => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json';
                  input.onchange = importVoice;
                  input.click();
                },
              },
        ]"
      />

      <!-- 音色列表 (网格布局) -->
      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <div
          v-for="voice in displayVoices"
          :key="voice.id"
          class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden"
          :class="{
            'border-border/50 hover:border-border hover:shadow-md': true,
            'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50':
              voiceStore.defaultVoice.value?.id === voice.id,
          }"
          @click="openTestPanel(voice)"
        >
          <div class="p-4 h-full flex flex-col gap-3">
            <!-- 顶部: 图标 + 标题 + 操作 -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <!-- 图标 -->
                <div
                  class="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
                >
                  <Volume2 class="h-5 w-5" />
                </div>

                <!-- 标题 & 标签 -->
                <div class="flex-1 min-w-0">
                  <h3
                    class="font-semibold text-sm leading-tight mb-1 text-foreground line-clamp-2"
                  >
                    {{ voice.name }}
                  </h3>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      v-if="voiceStore.defaultVoice.value?.id === voice.id"
                      class="rounded-md px-2 py-0.5 text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 font-normal"
                    >
                      <Star class="h-3 w-3 mr-1" />
                      默认
                    </Badge>
                    <Badge
                      variant="secondary"
                      class="rounded-md px-2 py-0.5 text-xs bg-secondary/60 text-muted-foreground font-normal"
                    >
                      {{ voice.metadata.language }}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <!-- 描述 -->
            <p
              v-if="voice.metadata.description"
              class="text-xs text-muted-foreground line-clamp-2 flex-1"
            >
              {{ voice.metadata.description }}
            </p>

            <!-- 底部: 信息 + 操作 -->
            <div class="space-y-2 pt-2 border-t border-border/50">
              <!-- 信息 -->
              <div
                class="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span>{{ formatBytes(voice.modelSize) }}</span>
                <span>{{ formatDuration(voice.sampleDuration) }}</span>
              </div>

              <!-- 操作按钮 -->
              <div class="flex items-center gap-1.5">
                <Button
                  v-if="voiceStore.defaultVoice.value?.id !== voice.id"
                  variant="ghost"
                  size="sm"
                  class="flex-1 h-7 text-xs"
                  @click.stop="setDefaultVoice(voice.id)"
                >
                  <StarOff class="h-3 w-3 mr-1" />
                  设为默认
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2"
                  @click.stop="openTestPanel(voice)"
                  title="测试"
                >
                  <Play class="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2"
                  @click.stop="exportVoice(voice)"
                  title="导出"
                >
                  <Download class="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  @click.stop="deleteVoice(voice)"
                  title="删除"
                >
                  <Trash2 class="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 使用提示 -->
      <div class="mt-8 p-4 rounded-xl bg-muted/50 border border-border">
        <div class="flex items-start gap-3">
          <AlertCircle class="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div class="flex-1 space-y-1 text-sm text-muted-foreground">
            <p class="font-medium text-foreground">使用提示</p>
            <ul class="list-disc list-inside space-y-0.5 ml-1">
              <li>自定义音色可以在阅读器中使用，提供个性化的朗读体验</li>
              <li>支持导出音色模型以便在其他设备使用</li>
              <li>设置默认音色后，朗读功能将优先使用该音色</li>
            </ul>
          </div>
        </div>
      </div>
    </main>

    <!-- 测试面板 -->
    <div
      v-if="showTestPanel && selectedVoice"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      @click.self="showTestPanel = false"
    >
      <div
        class="w-full max-w-md rounded-t-2xl sm:rounded-2xl border-t sm:border border-border bg-card shadow-xl p-6 space-y-4 animate-in slide-in-from-bottom sm:slide-in-from-top"
        @click.stop
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold">测试音色</h3>
            <p class="text-sm text-muted-foreground">
              {{ selectedVoice.name }}
            </p>
          </div>
          <button
            @click="showTestPanel = false"
            class="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-sm font-medium mb-2 block">测试文本</label>
            <input
              type="text"
              value="这是一段测试文本，用于测试音色效果。"
              class="w-full px-4 py-2 rounded-xl border border-input bg-background text-sm"
              disabled
            />
          </div>

          <Button
            @click="testVoice"
            :disabled="isTestingVoice"
            class="w-full gap-2"
          >
            <Loader2 v-if="isTestingVoice" class="h-4 w-4 animate-spin" />
            <Play v-else class="h-4 w-4" />
            {{ isTestingVoice ? "生成中..." : "播放测试" }}
          </Button>
        </div>

        <p class="text-xs text-center text-muted-foreground">
          测试功能开发中，请稍后
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
