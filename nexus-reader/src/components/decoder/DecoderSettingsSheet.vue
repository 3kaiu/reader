<script setup lang="ts">
/**
 * 解密设置底部抽屉组件
 * 显示书籍类型选择、统计信息、词典管理入口
 */
import { useDecoderSettingsView } from '@/composables/useDecoderSettingsView'
import { BookOpen, ExternalLink, Sparkles } from 'lucide-vue-next'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

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

const { bookTypeOptions, settings, updateBookType, goToDictionary } =
  useDecoderSettingsView({
    bookUrl: props.bookUrl,
    close: () => emit('update:open', false),
  })
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
            用于选择更贴近当前书的解密分类上下文
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
                  查看和编辑公共 / 分类 / 书籍词典
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
