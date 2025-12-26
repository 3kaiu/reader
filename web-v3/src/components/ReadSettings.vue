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
              class="w-14 h-14 rounded-xl border-2 transition-all hover:scale-105 active:scale-95 flex items-center justify-center text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.theme === theme.key 
                ? 'border-primary scale-105 shadow-md' 
                : 'border-border'"
              :style="{ 
                backgroundColor: theme.color,
                color: theme.textColor || '#333'
              }"
              @click="settingsStore.updateConfig('theme', theme.key)"
              :aria-label="`切换到${theme.label}主题`"
              :aria-pressed="settingsStore.config.theme === theme.key"
            >
              {{ theme.label }}
            </button>
            <!-- 自定义主题按钮 -->
            <button
              class="w-14 h-14 rounded-xl border-2 transition-all hover:scale-105 active:scale-95 flex items-center justify-center text-xs font-medium relative overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.theme === 'custom' 
                ? 'border-primary scale-105 shadow-md' 
                : 'border-border'"
              :style="{ 
                backgroundColor: settingsStore.config.customColors?.background || '#f5f5f5',
                color: settingsStore.config.customColors?.text || '#333'
              }"
              @click="settingsStore.updateConfig('theme', 'custom')"
              aria-label="切换到自定义主题"
              :aria-pressed="settingsStore.config.theme === 'custom'"
            >
              自定
            </button>
          </div>
          
          <!-- 自定义颜色选择器 (仅在选择自定义主题时显示) -->
          <div v-if="settingsStore.config.theme === 'custom'" class="mt-4 p-4 rounded-xl bg-muted/50 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-sm">背景色</span>
              <div class="flex items-center gap-2">
                <input 
                  type="color" 
                  :value="settingsStore.config.customColors?.background || '#FAF7ED'"
                  class="w-10 h-10 rounded-lg cursor-pointer border-0"
                  @input="(e: Event) => settingsStore.updateConfig('customColors', { 
                    ...settingsStore.config.customColors, 
                    background: (e.target as HTMLInputElement).value 
                  })"
                />
                <span class="text-xs text-muted-foreground font-mono">
                  {{ settingsStore.config.customColors?.background || '#FAF7ED' }}
                </span>
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm">文字色</span>
              <div class="flex items-center gap-2">
                <input 
                  type="color" 
                  :value="settingsStore.config.customColors?.text || '#333333'"
                  class="w-10 h-10 rounded-lg cursor-pointer border-0"
                  @input="(e: Event) => settingsStore.updateConfig('customColors', { 
                    ...settingsStore.config.customColors, 
                    text: (e.target as HTMLInputElement).value 
                  })"
                />
                <span class="text-xs text-muted-foreground font-mono">
                  {{ settingsStore.config.customColors?.text || '#333333' }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- 字体设置 -->
        <section>
          <h3 class="text-sm font-medium mb-3">正文字体</h3>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="font in fonts"
              :key="font.key"
              class="px-4 py-2 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.fontFamily === font.key 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('fontFamily', font.key)"
              :aria-label="`切换到${font.label}字体`"
              :aria-pressed="settingsStore.config.fontFamily === font.key"
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
              class="px-4 py-2 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.chineseConvert === opt.key 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('chineseConvert', opt.key)"
              :aria-label="`${opt.label}简繁转换`"
              :aria-pressed="settingsStore.config.chineseConvert === opt.key"
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
              class="flex-1 py-2 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.fontWeight === weight 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              :style="{ fontWeight: weight }"
              @click="settingsStore.updateConfig('fontWeight', weight)"
              :aria-label="`字重${weight}`"
              :aria-pressed="settingsStore.config.fontWeight === weight"
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
              class="flex-1 py-3 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.readingMode === 'scroll' 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('readingMode', 'scroll')"
              aria-label="上下滚动模式"
              :aria-pressed="settingsStore.config.readingMode === 'scroll'"
            >
              上下滚动
            </button>
            <button
              class="flex-1 py-3 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.readingMode === 'swipe' 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('readingMode', 'swipe')"
              aria-label="左右翻页模式"
              :aria-pressed="settingsStore.config.readingMode === 'swipe'"
            >
              左右翻页
            </button>
          </div>
        </section>

        <!-- 翻页动画 (仅左右翻页模式) -->
        <section v-if="settingsStore.config.readingMode === 'swipe'">
          <h3 class="text-sm font-medium mb-3">翻页动画</h3>
          <div class="flex gap-2">
            <button
              class="flex-1 py-3 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.pageAnimation === 'slide' 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('pageAnimation', 'slide')"
              aria-label="滑动动画"
              :aria-pressed="settingsStore.config.pageAnimation === 'slide'"
            >
              滑动
            </button>
            <button
              class="flex-1 py-3 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.pageAnimation === 'fade' 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('pageAnimation', 'fade')"
              aria-label="淡入淡出动画"
              :aria-pressed="settingsStore.config.pageAnimation === 'fade'"
            >
              淡入淡出
            </button>
            <button
              class="flex-1 py-3 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.pageAnimation === 'none' 
                ? 'border-primary bg-primary/10 text-primary' 
                : 'border-border hover:border-primary/50'"
              @click="settingsStore.updateConfig('pageAnimation', 'none')"
              aria-label="无动画"
              :aria-pressed="settingsStore.config.pageAnimation === 'none'"
            >
              无动画
            </button>
          </div>
        </section>

        <!-- 点击翻页 -->
        <section>
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium">全屏点击翻页</h3>
            <button
              class="w-12 h-6 rounded-full transition-all relative focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.clickToNextPage 
                ? 'bg-primary' 
                : 'bg-muted'"
              @click="settingsStore.updateConfig('clickToNextPage', !settingsStore.config.clickToNextPage)"
              :aria-label="settingsStore.config.clickToNextPage ? '关闭点击翻页' : '开启点击翻页'"
              :aria-checked="settingsStore.config.clickToNextPage"
              role="switch"
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
              class="w-12 h-6 rounded-full transition-all relative focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="settingsStore.config.autoNightMode 
                ? 'bg-primary' 
                : 'bg-muted'"
              @click="settingsStore.toggleAutoNightMode(!settingsStore.config.autoNightMode)"
              :aria-label="settingsStore.config.autoNightMode ? '关闭自动夜间模式' : '开启自动夜间模式'"
              :aria-checked="settingsStore.config.autoNightMode"
              role="switch"
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
