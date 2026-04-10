<script setup lang="ts">
import { computed, ref } from 'vue'
import { BookMarked, Check, Loader2, Radio } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LazyImage } from '@/components/ui'
import type {
  SearchDisplayResult,
  SearchExplain,
  SearchResult,
  SearchResultActionPayload,
} from '@/types/search'
import { getSearchResultIdentity } from '@/utils/searchStore'

const props = defineProps<{
  book: SearchDisplayResult
  openingBook: string | null
  hasBookOnShelf: (book: SearchResult) => boolean
}>()

const emit = defineEmits<{
  open: [payload: SearchResultActionPayload]
  addToShelf: [payload: SearchResultActionPayload]
}>()

const showSourceSheet = ref(false)

const primaryBook = computed<SearchResult>(() => props.book.sourceVariants[0] || props.book)
const isOpeningAnyVariant = computed(() =>
  props.book.sourceVariants.some(variant => getSearchResultIdentity(variant) === props.openingBook)
)

function isPrimaryVariant(variant: SearchResult): boolean {
  return (
    variant.sourceId === primaryBook.value.sourceId && variant.bookUrl === primaryBook.value.bookUrl
  )
}

function isOpeningVariant(variant: SearchResult): boolean {
  return getSearchResultIdentity(variant) === props.openingBook
}

function openVariant(variant: SearchResult) {
  showSourceSheet.value = false
  emit('open', {
    book: variant,
    rememberPreference: true,
  })
}

function getStrategyLabel(explain?: SearchExplain): string | null {
  if (!explain) {
    return null
  }

  if (explain.strategy === 'direct_detail') {
    return '直链解析'
  }

  if (explain.strategy === 'external_discovery') {
    return explain.provider === 'jina_search' ? 'Jina 发现' : '外部发现'
  }

  return '原生搜索'
}

function getRankingHint(explain?: SearchExplain): string | null {
  if (!explain) {
    return null
  }

  const parts: string[] = []

  if (typeof explain.packageRank === 'number' && explain.packageRank > 0) {
    parts.push(`源优先级 ${explain.packageRank}`)
  }

  if (typeof explain.matchScore === 'number' && explain.matchScore > 0) {
    parts.push(`匹配 ${explain.matchScore}`)
  }

  return parts.length > 0 ? parts.join(' · ') : explain.note || null
}
</script>

<template>
  <div
    class="group relative flex bg-card rounded-2xl border border-border/40 hover:border-border hover:shadow-md cursor-pointer overflow-hidden transition-all duration-200 ease-out hover:bg-muted/30 active:scale-[0.98]"
    @click="emit('open', { book: primaryBook })"
  >
    <div class="relative w-24 shrink-0 bg-muted">
      <LazyImage
        v-if="primaryBook.coverUrl"
        :src="primaryBook.coverUrl"
        class="w-full h-full object-cover"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center text-muted-foreground/20 bg-secondary"
      >
        <BookMarked class="h-8 w-8" />
      </div>
    </div>

    <div class="flex-1 p-3 flex flex-col min-w-0">
      <h3
        class="font-medium text-sm text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors mb-1"
      >
        {{ book.name }}
      </h3>

      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs text-muted-foreground truncate">{{
          primaryBook.author || '未知作者'
        }}</span>
        <span class="text-xs text-muted-foreground/30">•</span>
        <span class="text-[10px] text-muted-foreground/70 truncate max-w-24">{{
          primaryBook.sourceName
        }}</span>
        <Badge
          v-if="book.sourceCount > 1"
          variant="outline"
          class="h-5 rounded-full px-1.5 text-[10px] leading-none"
        >
          +{{ book.sourceCount - 1 }} 源
        </Badge>
      </div>

      <div
        v-if="getStrategyLabel(primaryBook.searchExplain)"
        class="mb-2 flex flex-wrap items-center gap-1.5"
      >
        <Badge variant="secondary" class="h-5 rounded-full px-1.5 text-[10px] leading-none">
          {{ getStrategyLabel(primaryBook.searchExplain) }}
        </Badge>
        <span
          v-if="getRankingHint(primaryBook.searchExplain)"
          class="text-[10px] text-muted-foreground/60 truncate"
        >
          {{ getRankingHint(primaryBook.searchExplain) }}
        </span>
      </div>

      <div class="flex-1 relative mb-2">
        <p
          v-if="primaryBook.intro"
          class="text-xs text-muted-foreground/60 line-clamp-2 leading-relaxed"
        >
          {{ primaryBook.intro.trim() }}
        </p>
        <p
          v-else-if="primaryBook.latestChapterTitle"
          class="text-[10px] text-muted-foreground/50 truncate"
        >
          {{ primaryBook.latestChapterTitle }}
        </p>
        <p
          v-if="book.sourceCount > 1"
          class="mt-2 text-[10px] text-muted-foreground/50 line-clamp-1"
        >
          同书来源: {{ book.matchedSources.map(source => source.name).join(' / ') }}
        </p>
      </div>

      <div class="flex items-center justify-end gap-2">
        <Button
          v-if="book.sourceCount > 1"
          size="sm"
          variant="ghost"
          class="h-7 px-2.5 text-xs rounded-md text-muted-foreground hover:bg-secondary"
          @click.stop="showSourceSheet = true"
        >
          选源
        </Button>
        <Button
          size="sm"
          variant="ghost"
          class="h-7 px-3 text-xs rounded-md hover:bg-secondary"
          :class="hasBookOnShelf(primaryBook) ? 'text-green-600' : 'text-muted-foreground'"
          @click.stop="emit('addToShelf', { book: primaryBook })"
        >
          <Check v-if="hasBookOnShelf(primaryBook)" class="h-3 w-3 mr-1" />
          <span v-else class="mr-1 text-[10px]">+</span>
          {{ hasBookOnShelf(primaryBook) ? '已添加' : '收藏' }}
        </Button>
      </div>
    </div>

    <div
      v-if="isOpeningAnyVariant"
      class="absolute inset-0 bg-background/80 backdrop-blur-sm z-30 flex items-center justify-center"
    >
      <Loader2 class="h-5 w-5 animate-spin text-primary" />
    </div>
  </div>

  <Sheet :open="showSourceSheet" @update:open="showSourceSheet = $event">
    <SheetContent
      side="bottom"
      class="h-[70vh] md:max-w-2xl md:mx-auto md:rounded-t-3xl flex flex-col p-0 rounded-t-2xl"
    >
      <div class="flex justify-center py-3">
        <div class="w-10 h-1 rounded-full bg-muted-foreground/20" />
      </div>

      <SheetHeader class="px-5 pb-3">
        <SheetTitle>选择阅读来源</SheetTitle>
        <p class="text-sm text-muted-foreground">
          当前已聚合同名结果，默认使用质量更高的来源。你也可以手动切换。
        </p>
      </SheetHeader>

      <div class="px-5 pb-4 flex items-start gap-4">
        <div class="w-12 h-16 rounded-lg bg-muted shrink-0 overflow-hidden shadow-sm">
          <LazyImage
            v-if="primaryBook.coverUrl"
            :src="primaryBook.coverUrl"
            aspect-ratio="3/4"
            class="w-full h-full"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <BookMarked class="h-5 w-5 text-muted-foreground/40" />
          </div>
        </div>
        <div class="min-w-0">
          <h3 class="font-semibold text-base truncate">{{ primaryBook.name }}</h3>
          <p class="text-sm text-muted-foreground mt-0.5">
            {{ primaryBook.author || '未知作者' }}
          </p>
          <p class="text-xs text-muted-foreground/70 mt-1">
            共命中 {{ book.sourceCount }} 个候选来源
          </p>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-5 pb-6 space-y-3">
        <div
          v-for="variant in book.sourceVariants"
          :key="`${variant.sourceId}-${variant.bookUrl}`"
          class="w-full rounded-2xl border border-border/60 bg-card px-4 py-3 text-left hover:border-border hover:bg-muted/30 transition-colors"
          role="button"
          tabindex="0"
          @click="openVariant(variant)"
          @keydown.enter.prevent="openVariant(variant)"
          @keydown.space.prevent="openVariant(variant)"
        >
          <div class="flex items-start gap-3">
            <div
              class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              :class="
                isPrimaryVariant(variant)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              "
            >
              <Check v-if="isPrimaryVariant(variant)" class="h-4 w-4" />
              <Radio v-else class="h-4 w-4" />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium text-foreground truncate">
                  {{ variant.sourceName }}
                </span>
                <Badge
                  v-if="isPrimaryVariant(variant)"
                  variant="secondary"
                  class="h-5 px-1.5 text-[10px]"
                >
                  当前主源
                </Badge>
                <Badge
                  v-if="hasBookOnShelf(variant)"
                  variant="outline"
                  class="h-5 px-1.5 text-[10px]"
                >
                  已在书架
                </Badge>
                <Badge
                  v-if="getStrategyLabel(variant.searchExplain)"
                  variant="outline"
                  class="h-5 px-1.5 text-[10px]"
                >
                  {{ getStrategyLabel(variant.searchExplain) }}
                </Badge>
              </div>

              <p
                v-if="getRankingHint(variant.searchExplain)"
                class="mt-1 text-xs text-muted-foreground truncate"
              >
                {{ getRankingHint(variant.searchExplain) }}
              </p>
              <p
                v-else-if="variant.latestChapterTitle"
                class="mt-1 text-xs text-muted-foreground truncate"
              >
                {{ variant.latestChapterTitle }}
              </p>
              <p v-else-if="variant.intro" class="mt-1 text-xs text-muted-foreground line-clamp-2">
                {{ variant.intro.trim() }}
              </p>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                :disabled="isOpeningVariant(variant)"
                class="h-8 px-3 text-xs"
                @click.stop="openVariant(variant)"
              >
                <Loader2 v-if="isOpeningVariant(variant)" class="mr-1 h-3.5 w-3.5 animate-spin" />
                {{ isOpeningVariant(variant) ? '打开中' : '阅读' }}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="h-8 px-3 text-xs"
                :class="hasBookOnShelf(variant) ? 'text-green-600' : 'text-muted-foreground'"
                @click.stop="
                  emit('addToShelf', {
                    book: variant,
                    rememberPreference: true,
                  })
                "
              >
                {{ hasBookOnShelf(variant) ? '已收藏' : '收藏' }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
