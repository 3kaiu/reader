<script setup lang="ts">
/**
 * 阅读设置组件 - shadcn 风格
 */
import { useSettingsStore, type FontFamily, type ReaderTheme, type ChineseConvert } from '@/stores/settings'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { NSlider } from 'naive-ui'
import { Settings, RotateCcw, Minus, Plus } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const settingsStore = useSettingsStore()

// 主题选项
const themes: { key: ReaderTheme; label: string; color: string; textColor?: string }[] = [
  { key: 'white', label: '白', color: '#FFFFFF' },
  { key: 'paper', label: '护眼', color: '#FAF7ED' },
  { key: 'sepia', label: '羊皮', color: '#EFE6D5' },
  { key: 'gray', label: '水墨', color: '#F2F3F5' },
  { key: 'green', label: '清新', color: '#E6F0E6' },
  { key: 'night', label: '夜间', color: '#1C1C1E', textColor: '#A1A1AA' },
]

// 字体选项
const fonts: { key: FontFamily; label: string }[] = [
  { key: 'system', label: '系统' },
  { key: 'heiti', label: '黑体' },
  { key: 'kaiti', label: '楷体' },
  { key: 'songti', label: '宋体' },
  { key: 'fangsong', label: '仿宋' },
  { key: 'lxgw', label: '霞鹭文楷' },
]

// 简繁转换
const chineseOptions: { key: ChineseConvert; label: string }[] = [
  { key: 'none', label: '不转换' },
  { key: 'toSimplified', label: '转简体' },
  { key: 'toTraditional', label: '转繁体' },
]

// 字重选项
const fontWeights = [300, 400, 500, 600, 700]
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-[380px] sm:w-[420px] overflow-y-auto">
      <SheetHeader class="mb-6">
        <div class="flex items-center justify-between">
          <SheetTitle class="flex items-center gap-2">
            <Settings class="h-5 w-5" />
            阅读设置
          </SheetTitle>
          <Button variant="ghost" size="sm" @click="settingsStore.resetConfig()">
            <RotateCcw class="h-4 w-4 mr-1" />
            重置
          </Button>
        </div>
      </SheetHeader>

      <div class="space-y-8">
        <!-- 阅读主题 -->
        <section>
          <h3 class="text-sm font-medium mb-3">阅读主题</h3>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="theme in themes"
              :key="theme.key"
              class="w-14 h-14 rounded-xl border-2 transition-all hover:scale-105 flex items-center justify-center text-xs font-medium"
              :class="settingsStore.config.theme === theme.key 
                ? 'border-primary scale-105 shadow-md' 
                : 'border-border'"
              :style="{ 
                backgroundColor: theme.color,
                color: theme.textColor || '#333'
              }"
              @click="settingsStore.updateConfig('theme', theme.key)"
            >
              {{ theme.label }}
            </button>
          </div>
        </section>

        <!-- 字体设置 -->
        <section>
          <h3 class="text-sm font-medium mb-3">正文字体</h3>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="font in fonts"
              :key="font.key"
              class="px-4 py-2 rounded-lg border transition-all text-sm"
              :class="settingsStore.config.fontFamily === font.key 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('fontFamily', font.key)"
            >
              {{ font.label }}
            </button>
          </div>
        </section>

        <!-- 简繁转换 -->
        <section>
          <h3 class="text-sm font-medium mb-3">简繁转换</h3>
          <div class="flex gap-2">
            <button
              v-for="opt in chineseOptions"
              :key="opt.key"
              class="px-4 py-2 rounded-lg border transition-all text-sm"
              :class="settingsStore.config.chineseConvert === opt.key 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('chineseConvert', opt.key)"
            >
              {{ opt.label }}
            </button>
          </div>
        </section>

        <!-- 字号 -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium">字号</h3>
            <span class="text-sm text-muted-foreground">{{ settingsStore.config.fontSize }}px</span>
          </div>
          <div class="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="icon" 
              class="h-9 w-9"
              @click="settingsStore.decreaseFontSize()"
            >
              <Minus class="h-4 w-4" />
            </Button>
            <NSlider
              :value="settingsStore.config.fontSize"
              :min="12"
              :max="32"
              :step="1"
              class="flex-1"
              @update:value="(v: number) => settingsStore.updateConfig('fontSize', v)"
            />
            <Button 
              variant="outline" 
              size="icon"
              class="h-9 w-9"
              @click="settingsStore.increaseFontSize()"
            >
              <Plus class="h-4 w-4" />
            </Button>
          </div>
        </section>

        <!-- 字重 -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium">字重</h3>
            <span class="text-sm text-muted-foreground">{{ settingsStore.config.fontWeight }}</span>
          </div>
          <div class="flex gap-2">
            <button
              v-for="weight in fontWeights"
              :key="weight"
              class="flex-1 py-2 rounded-lg border transition-all text-sm"
              :class="settingsStore.config.fontWeight === weight 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              :style="{ fontWeight: weight }"
              @click="settingsStore.updateConfig('fontWeight', weight)"
            >
              {{ weight }}
            </button>
          </div>
        </section>

        <!-- 行高 -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium">行高</h3>
            <span class="text-sm text-muted-foreground">{{ settingsStore.config.lineHeight.toFixed(1) }}</span>
          </div>
          <div class="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="icon"
              class="h-9 w-9"
              @click="settingsStore.decreaseLineHeight()"
            >
              <Minus class="h-4 w-4" />
            </Button>
            <NSlider
              :value="settingsStore.config.lineHeight"
              :min="1.2"
              :max="3"
              :step="0.1"
              class="flex-1"
              @update:value="(v: number) => settingsStore.updateConfig('lineHeight', v)"
            />
            <Button 
              variant="outline" 
              size="icon"
              class="h-9 w-9"
              @click="settingsStore.increaseLineHeight()"
            >
              <Plus class="h-4 w-4" />
            </Button>
          </div>
        </section>

        <!-- 段落间距 -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium">段落间距</h3>
            <span class="text-sm text-muted-foreground">{{ settingsStore.config.paragraphSpacing.toFixed(1) }}em</span>
          </div>
          <NSlider
            :value="settingsStore.config.paragraphSpacing"
            :min="0.5"
            :max="3"
            :step="0.1"
            @update:value="(v: number) => settingsStore.updateConfig('paragraphSpacing', v)"
          />
        </section>

        <!-- 页面宽度 -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium">页面宽度</h3>
            <span class="text-sm text-muted-foreground">{{ settingsStore.config.pageWidth }}px</span>
          </div>
          <NSlider
            :value="settingsStore.config.pageWidth"
            :min="400"
            :max="1200"
            :step="50"
            @update:value="(v: number) => settingsStore.updateConfig('pageWidth', v)"
          />
        </section>

        <!-- 阅读方式 -->
        <section>
          <h3 class="text-sm font-medium mb-3">阅读方式</h3>
          <div class="flex gap-2">
            <button
              class="flex-1 py-3 rounded-lg border transition-all text-sm"
              :class="settingsStore.config.readingMode === 'scroll' 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('readingMode', 'scroll')"
            >
              上下滚动
            </button>
            <button
              class="flex-1 py-3 rounded-lg border transition-all text-sm"
              :class="settingsStore.config.readingMode === 'swipe' 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('readingMode', 'swipe')"
            >
              左右翻页
            </button>
          </div>
        </section>

        <!-- 点击翻页 -->
        <section>
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium">全屏点击翻页</h3>
            <button
              class="w-12 h-6 rounded-full transition-all relative"
              :class="settingsStore.config.clickToNextPage 
                ? 'bg-primary' 
                : 'bg-muted'"
              @click="settingsStore.updateConfig('clickToNextPage', !settingsStore.config.clickToNextPage)"
            >
              <span 
                class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                :class="settingsStore.config.clickToNextPage ? 'left-6' : 'left-0.5'"
              />
            </button>
          </div>
        </section>

        <!-- 自动夜间模式 -->
        <section>
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-sm font-medium">自动夜间模式</h3>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ settingsStore.config.nightModeStartHour }}:00 - {{ settingsStore.config.nightModeEndHour }}:00 自动切换
              </p>
            </div>
            <button
              class="w-12 h-6 rounded-full transition-all relative"
              :class="settingsStore.config.autoNightMode 
                ? 'bg-primary' 
                : 'bg-muted'"
              @click="settingsStore.toggleAutoNightMode(!settingsStore.config.autoNightMode)"
            >
              <span 
                class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                :class="settingsStore.config.autoNightMode ? 'left-6' : 'left-0.5'"
              />
            </button>
          </div>
        </section>
      </div>
    </SheetContent>
  </Sheet>
</template>
