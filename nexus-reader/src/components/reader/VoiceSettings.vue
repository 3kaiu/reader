<script setup lang="ts">
/**
 * 🎙️ VoiceSettings - TTS 语音与引擎设置
 * 支持 切换引擎 (系统/Piper) 与 下载 Piper 语音模型
 */
import { ref, onMounted, computed } from 'vue'
import { Check, Download, Loader2, Volume2, Globe, Zap, Settings2 } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings'
import { useTTS } from '@/composables/useTTS'
import type { PiperVoice } from '@/types/voice'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

const settings = useSettingsStore()
const tts = useTTS()

const piperVoices = ref<PiperVoice[]>([])
const isLoadingVoices = ref(false)

async function loadVoices() {
  isLoadingVoices.value = true
  try {
    // @ts-ignore
    piperVoices.value = await tts.getAvailableVoices()
  } finally {
    isLoadingVoices.value = false
  }
}

const currentEngine = computed({
  get: () => settings.config.ttsEngine,
  set: (val) => settings.updateConfig('ttsEngine', val)
})

const filteredVoices = computed(() => {
  // 默认显示中文
  return piperVoices.value.sort((a, b) => {
    if (a.language.includes('zh') && !b.language.includes('zh')) return -1
    if (!a.language.includes('zh') && b.language.includes('zh')) return 1
    return 0
  })
})

async function selectVoice(voice: PiperVoice) {
  if (!voice.isDownloaded) {
    // 触发下载逻辑 (由 usePiperTTS 处理缓存)
    // 这里简化处理，直接设置并让 speak 触发加载
  }
  settings.updateConfig('piperVoice', voice.key)
}

onMounted(() => {
  loadVoices()
})
</script>

<template>
  <div class="p-4 flex flex-col gap-6">
    <!-- 引擎切换 -->
    <div class="space-y-3">
      <h3 class="text-sm font-semibold opacity-60 flex items-center gap-2">
        <Settings2 class="w-4 h-4" /> 朗读引擎
      </h3>
      <div class="grid grid-cols-2 gap-2 bg-muted/50 p-1 rounded-xl">
        <button 
          class="py-2.5 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
          :class="currentEngine === 'system' ? 'bg-background shadow-sm font-bold' : 'opacity-60 hover:opacity-100'"
          @click="currentEngine = 'system'"
        >
          <Volume2 class="w-4 h-4" /> 系统语音
        </button>
        <button 
          class="py-2.5 px-4 rounded-lg text-sm transition-all flex items-center justify-center gap-2"
          :class="currentEngine === 'piper' ? 'bg-background shadow-sm font-bold' : 'opacity-60 hover:opacity-100'"
          @click="currentEngine = 'piper'"
        >
          <Zap class="w-4 h-4 text-amber-500" /> Piper WASM
        </button>
      </div>
      <p class="text-[10px] opacity-40 px-1">
        {{ currentEngine === 'system' ? '使用浏览器自带引擎，无需下载，但声音较为机械。' : '使用离线神经网络模型，高保真真人音质，首次使用需下载。' }}
      </p>
    </div>

    <!-- 语音列表 -->
    <div class="flex-1 flex flex-col min-h-0 min-w-0">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold opacity-60 flex items-center gap-2">
          <Globe class="w-4 h-4" /> 列表
        </h3>
        <Button variant="ghost" size="sm" class="h-8 text-xs" @click="loadVoices" :disabled="isLoadingVoices">
          <Loader2 v-if="isLoadingVoices" class="w-3 h-3 animate-spin mr-1" />
          刷新
        </Button>
      </div>

      <ScrollArea class="h-[400px] -mx-4 px-4 pr-6">
        <div class="space-y-2 pb-4">
          <div 
            v-for="voice in filteredVoices" 
            :key="voice.key"
            class="flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer hover:bg-muted/30"
            :class="settings.config.piperVoice === voice.key ? 'border-primary bg-primary/5' : 'border-border/50 bg-card'"
            @click="selectVoice(voice)"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-bold truncate">{{ voice.name }}</span>
                <Badge variant="outline" class="text-[9px] h-4 px-1 grayscale opacity-60 uppercase">{{ voice.language }}</Badge>
              </div>
              <div class="flex items-center gap-2 text-[10px] opacity-50 font-medium">
                <span>{{ voice.quality }}</span>
                <span v-if="voice.isDownloaded" class="text-green-500 flex items-center gap-0.5">
                  <Check class="w-2.5 h-2.5" /> 已就绪
                </span>
                <span v-else>待下载</span>
              </div>
            </div>
            
            <div class="shrink-0 flex items-center">
              <div v-if="settings.config.piperVoice === voice.key" class="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                <Check class="w-4 h-4" />
              </div>
              <div v-else-if="!voice.isDownloaded" class="w-8 h-8 rounded-full bg-muted flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity">
                <Download class="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  </div>
</template>
