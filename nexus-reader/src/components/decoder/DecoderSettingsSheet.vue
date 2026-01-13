<script setup lang="ts">
/**
 * 解密设置底部抽屉组件
 * 显示书籍类型选择、统计信息、词典管理入口
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { BookOpen, Hash, Clock, ExternalLink, Sparkles } from 'lucide-vue-next'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useDecoderStore } from '@/stores/decoder'
import type { BookType } from '@/types/decoder'

interface Props {
  /** 书籍 URL */
  bookUrl: string
  /** 是否打开 */
  open: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const router = useRouter()
const decoderStore = useDecoderStore()

/** 书籍类型选项 */
const bookTypeOptions: { value: BookType; label: string; description: string }[] = [
  { value: 'era', label: '年代文', description: '涉及历史人物、政治事件' },
  { value: 'entertainment', label: '娱乐圈', description: '明星、导演、综艺节目' },
  { value: 'urban', label: '都市', description: '商业大佬、互联网公司' },
  { value: 'history', label: '历史', description: '古代人物、朝代事件' },
  { value: 'business', label: '商战', description: '企业家、商业竞争' },
]

/** 当前书籍设置 */
const settings = computed(() => decoderStore.getBookSettings(props.bookUrl))

/** 格式化时间 */
function formatTime(timestamp: number): string {
  if (!timestamp) return '从未'
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 更新书籍类型 */
function updateBookType(type: BookType) {
  decoderStore.updateBookSettings(props.bookUrl, { bookType: type })
}

/** 跳转到词典管理页面 */
function goToDictionary() {
  emit('update:open', false)
  router.push('/decoder-dictionary')
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="bottom" class="max-h-[80vh] overflow-y-auto">
      <SheetHeader>
        <SheetTitle class="flex items-center gap-2">
          <Sparkles class="w-5 h-5 text-purple-500" />
          解密设置
        </SheetTitle>
        <p class="text-sm text-muted-foreground">
          配置当前书籍的解密选项
        </p>
      </SheetHeader>

      <div class="mt-6 space-y-6">
        <!-- 书籍类型选择 -->
        <div>
          <h3 class="text-sm font-medium mb-3">书籍类型</h3>
          <p class="text-xs text-muted-foreground mb-3">
            选择书籍类型可以提高解密准确度
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="option in bookTypeOptions"
              :key="option.value"
              class="p-3 text-left rounded-lg border transition-colors"
              :class="[
                settings.bookType === option.value
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-border hover:border-purple-500/50',
              ]"
              @click="updateBookType(option.value)"
            >
              <div class="font-medium text-sm">{{ option.label }}</div>
              <div class="text-xs text-muted-foreground mt-0.5">
                {{ option.description }}
              </div>
            </button>
          </div>
        </div>

        <!-- 统计信息 -->
        <div>
          <h3 class="text-sm font-medium mb-3">统计信息</h3>
          <div class="grid grid-cols-3 gap-3">
            <div class="p-3 bg-muted/50 rounded-lg text-center">
              <BookOpen class="w-5 h-5 mx-auto mb-1 opacity-60" />
              <div class="text-lg font-bold">{{ settings.stats.decodedChapters }}</div>
              <div class="text-xs text-muted-foreground">已解码章节</div>
            </div>
            <div class="p-3 bg-muted/50 rounded-lg text-center">
              <Hash class="w-5 h-5 mx-auto mb-1 opacity-60" />
              <div class="text-lg font-bold">{{ settings.stats.totalEntities }}</div>
              <div class="text-xs text-muted-foreground">识别实体</div>
            </div>
            <div class="p-3 bg-muted/50 rounded-lg text-center">
              <Clock class="w-5 h-5 mx-auto mb-1 opacity-60" />
              <div class="text-sm font-medium">{{ formatTime(settings.stats.lastDecoded) }}</div>
              <div class="text-xs text-muted-foreground">上次解码</div>
            </div>
          </div>
        </div>

        <!-- 词典管理入口 -->
        <div>
          <button
            class="w-full p-4 flex items-center justify-between rounded-lg border border-border hover:border-purple-500/50 transition-colors"
            @click="goToDictionary"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <BookOpen class="w-5 h-5 text-purple-500" />
              </div>
              <div class="text-left">
                <div class="font-medium">词典管理</div>
                <div class="text-xs text-muted-foreground">
                  查看和编辑解密词典
                </div>
              </div>
            </div>
            <ExternalLink class="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
