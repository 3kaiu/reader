<script setup lang="ts">
/**
 * 首页/书架 - Neo-Modern Redesign
 */
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useDark, useToggle, useStorage } from "@vueuse/core";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { logger } from "@/utils/logger";
import { VIRTUAL_SCROLL_THRESHOLD, VIRTUAL_SCROLL_OVERSCAN } from "@/constants/ui";
import {
  Search,
  Plus,
  Settings,
  Moon,
  Sun,
  BookOpen,
  Library,
  Sparkles,
  CheckSquare,
  Trash2,
  X,
  Server,
  Brain,
  Home,
  Compass,
  Wand2,
} from "lucide-vue-next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bookApi, type Book } from "@/api";
import { Button } from "@/components/ui/button";
import BookCard from "@/components/book/BookCard.vue";
import { SkeletonLoader } from "@/components/ui";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";

const router = useRouter();
const { success, error } = useMessage();
const { confirm } = useConfirm();
const { handleApiError, handlePromiseError } = useErrorHandler();

// 暗色模式
const isDark = useDark();
const toggleDark = useToggle(isDark);

// ====== 状态 ======
const books = ref<Book[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const showProgress = useStorage("bookshelf-progress", true);

// ====== 计算属性 ======
const isManageMode = ref(false);
const selectedBooks = ref<Set<string>>(new Set());

// 按书名+作者去重
const deduplicatedBooks = computed(() => {
  const bookMap = new Map<string, { book: Book; sourceCount: number }>();

  for (const book of books.value) {
    const key = `${book.name}||${book.author || ""}`;
    const existing = bookMap.get(key);

    if (!existing) {
      bookMap.set(key, { book, sourceCount: 1 });
    } else {
      existing.sourceCount++;
      if ((book.durChapterTime || 0) > (existing.book.durChapterTime || 0)) {
        existing.book = book;
      }
    }
  }
  return Array.from(bookMap.values());
});

const sortedBooks = computed(() => {
  return [...deduplicatedBooks.value].sort(
    (a, b) => (b.book.durChapterTime || 0) - (a.book.durChapterTime || 0)
  );
});

const recentBooks = computed(() => {
  // Take top 4 for "Continue Reading"
  return sortedBooks.value.slice(0, 4);
});

const otherBooks = computed(() => {
  // The rest for main bookshelf
  return sortedBooks.value.slice(4);
});

// 虚拟滚动：只在书籍数量超过阈值时启用
const shouldUseVirtualScroll = computed(() => otherBooks.value.length > VIRTUAL_SCROLL_THRESHOLD);
const virtualContainerRef = ref<HTMLElement | null>(null);

// 计算每行显示的列数（响应式）
const getColumnsPerRow = () => {
  if (typeof window === 'undefined') return 6
  const width = window.innerWidth
  if (width >= 1280) return 6 // xl
  if (width >= 1024) return 5 // lg
  if (width >= 768) return 4  // md
  return 3 // sm
}

// 计算行数（响应式）
const rows = computed(() => {
  const cols = getColumnsPerRow()
  return Math.ceil(otherBooks.value.length / cols)
})

// 窗口宽度响应式（用于监听窗口大小变化，触发虚拟滚动更新）
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)

// 监听窗口大小变化
onMounted(() => {
  if (typeof window !== 'undefined') {
    const handleResize = () => {
      windowWidth.value = window.innerWidth
    }
    window.addEventListener('resize', handleResize)
  }
})

// 虚拟滚动器（按行）
// 注意：@tanstack/vue-virtual 的 count 需要是响应式的，但需要确保在数据变化时更新
const virtualizer = useVirtualizer({
  count: () => rows.value, // 使用函数形式确保响应式
  getScrollElement: () => virtualContainerRef.value,
  estimateSize: () => {
    const cols = getColumnsPerRow()
    // 估算每行高度：卡片高度 + gap
    return cols <= 3 ? 280 : cols <= 4 ? 260 : 240
  },
  overscan: VIRTUAL_SCROLL_OVERSCAN, // 预渲染行数
});

// 监听 rows 和 windowWidth 变化，强制虚拟滚动器重新计算
watch([rows, windowWidth], () => {
  // 触发虚拟滚动器重新计算
  if (virtualizer.value) {
    virtualizer.value.measureElement(0)
  }
}, { flush: 'post' })

// ====== 方法 ======

async function loadBookshelf() {
  try {
    const res = await bookApi.getBookshelf();
    if (res.isSuccess) {
      books.value = res.data;
    } else {
      error(res.errorMsg || "加载书架失败");
    }
  } catch (e) {
    logger.error("加载书架失败", e as Error, { function: "loadBookshelf" });
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  await loadBookshelf();
  success("刷新成功");
}

function handleBookClick(book: Book) {
  if (isManageMode.value) {
    toggleSelection(book);
  } else {
    router.push({ name: "reader", query: { url: book.bookUrl } });
  }
}

function toggleManageMode() {
  isManageMode.value = !isManageMode.value;
  selectedBooks.value.clear();
}

function toggleSelection(book: Book) {
  if (selectedBooks.value.has(book.bookUrl)) {
    selectedBooks.value.delete(book.bookUrl);
  } else {
    selectedBooks.value.add(book.bookUrl);
  }
}

function selectAll() {
  if (selectedBooks.value.size === deduplicatedBooks.value.length) {
    selectedBooks.value.clear();
  } else {
    deduplicatedBooks.value.forEach(({ book }) =>
      selectedBooks.value.add(book.bookUrl)
    );
  }
}

async function batchDelete() {
  if (selectedBooks.value.size === 0) return;
  const result = await confirm({
    title: "确认删除",
    description: `确定要删除选中的 ${selectedBooks.value.size} 本书籍吗？此操作不可恢复。`,
    variant: "destructive",
  });
  if (!result) return;

  const booksToDelete = books.value.filter((b: Book) =>
    selectedBooks.value.has(b.bookUrl)
  );
  try {
    for (const book of booksToDelete) {
      await bookApi.deleteBook(book.bookUrl);
    }
    books.value = books.value.filter(
      (b: Book) => !selectedBooks.value.has(b.bookUrl)
    );
    selectedBooks.value.clear();
    isManageMode.value = false;
    success("删除成功");
  } catch (e) {
    handlePromiseError(e, "删除失败");
  }
}

async function deleteBook(book: Book) {
  const result = await confirm({
    title: "确认删除",
    description: `确定要删除《${book.name}》吗？此操作不可恢复。`,
    variant: "destructive",
  });
  if (!result) return;

  try {
    const res = await bookApi.deleteBook(book.bookUrl);
    if (res.isSuccess) {
      books.value = books.value.filter((b: Book) => b.bookUrl !== book.bookUrl);
      success("删除成功");
    } else {
      handleApiError(res, "删除失败");
    }
  } catch (e) {
    handlePromiseError(e, "删除失败");
  }
}

function goSearch() {
  router.push("/search");
}

function getCoverUrl(url?: string) {
  if (!url) return "";
  return `/reader3/cover?path=${encodeURIComponent(url)}`;
}

onMounted(() => {
  loadBookshelf();
});
</script>

<template>
  <div
    class="min-h-screen bg-background text-foreground pb-24 selection:bg-primary/20"
  >
    <!-- 顶部状态栏占位 (iOS style) -->
    <div class="h-safe-top" />

    <!-- 头部区域 -->
    <header
      class="sticky top-0 z-40 bg-background/80 backdrop-blur-xl transition-all duration-300"
    >
      <div
        class="px-6 h-14 sm:h-16 flex items-center justify-between max-w-7xl mx-auto relative"
      >
        <!-- 左侧：品牌 (Left Brand - Minimal Icon) -->
        <div
          class="flex items-center gap-2.5 shrink-0 animate-in fade-in slide-in-from-left-2 duration-500"
        >
          <div
            class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"
          >
            <Library class="h-4 w-4 text-primary" />
          </div>
          <span class="font-semibold text-lg hidden sm:inline">阅读</span>
        </div>

        <!-- 中间：胶囊导航 (Center Pill Nav) - Desktop Only -->
        <nav
          class="hidden lg:flex items-center justify-center absolute left-1/2 -translate-x-1/2"
        >
          <div
            class="flex items-center p-1 bg-muted rounded-md border border-border"
          >
            <button
              v-for="item in ['书架', '发现']"
              :key="item"
              class="relative px-3 py-1.5 rounded-sm text-xs font-medium transition-all"
              :class="
                item === '书架' && !isManageMode && $route.path === '/'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent active:scale-[0.98]'
              "
              @click="
                item === '书架'
                  ? ((isManageMode = false), refresh())
                  : goSearch()
              "
            >
              {{ item }}
            </button>
            <button
              v-if="deduplicatedBooks.length > 0"
              class="relative px-3 py-1.5 rounded-sm text-xs font-medium transition-all"
              :class="
                isManageMode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent active:scale-[0.98]'
              "
              @click="toggleManageMode()"
            >
              管理
            </button>
          </div>
        </nav>

        <!-- 右侧：功能区 (Right Actions) -->
        <div class="flex items-center gap-3 sm:gap-4 min-w-[60px] justify-end">
          <!-- 搜索 (Desktop Expandable) -->
          <div class="hidden lg:flex items-center group relative">
            <div
              class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
            >
              <Search
                class="h-3.5 w-3.5 text-muted-foreground group-focus-within:text-foreground transition-colors"
              />
            </div>
            <input
              type="text"
              placeholder="Search..."
              class="h-8 w-28 focus:w-40 bg-background border border-input hover:border-accent-foreground/20 focus:border-ring focus:bg-background transition-all duration-200 rounded-md pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              @keydown.enter="goSearch"
            />
          </div>

          <!-- 移动端搜索按钮 -->
          <button
            class="lg:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground flex items-center justify-center transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            @click="goSearch"
            aria-label="搜索"
          >
            <Search class="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          <!-- 主题切换 -->
          <button
            class="relative w-9 h-9 sm:w-10 sm:h-10 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground flex items-center justify-center transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            @click="toggleDark()"
            aria-label="切换主题"
          >
            <Sun v-if="!isDark" class="h-4 w-4" />
            <Moon v-else class="h-4 w-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                class="hidden lg:flex w-9 h-9 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground items-center justify-center transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 outline-none"
                aria-label="设置"
              >
                <Settings class="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              class="w-64 p-2 rounded-xl border bg-popover/95 backdrop-blur-xl shadow-lg"
            >
              <div class="space-y-0.5">
                <!-- 内容管理组 -->
                <DropdownMenuItem
                  @click="router.push('/sources')"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/item"
                >
                  <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover/item:bg-primary/20 transition-colors">
                    <Server class="h-4 w-4 text-primary" />
                  </div>
                  <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span class="text-sm font-medium text-foreground">书源管理</span>
                    <span class="text-xs text-muted-foreground truncate"
                      >管理及导入书源</span
                    >
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                  @click="router.push('/replace-rule')"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/item"
                >
                  <div class="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 group-hover/item:bg-purple-500/20 transition-colors">
                    <Wand2 class="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span class="text-sm font-medium text-foreground">替换规则</span>
                    <span class="text-xs text-muted-foreground truncate"
                      >净化与替换文本内容</span
                    >
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator class="my-1.5" />

                <!-- AI 功能组 -->
                <DropdownMenuItem
                  @click="router.push('/ai-settings')"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/item"
                >
                  <div class="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 group-hover/item:bg-blue-500/20 transition-colors">
                    <Brain class="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span class="text-sm font-medium text-foreground">AI 模型</span>
                    <span class="text-xs text-muted-foreground truncate"
                      >配置 LLM 助手</span
                    >
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator class="my-1.5" />

                <!-- 系统设置 -->
                <DropdownMenuItem
                  @click="router.push('/settings')"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/item"
                >
                  <div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover/item:bg-muted/80 transition-colors">
                    <Settings class="h-4 w-4 text-muted-foreground group-hover/item:text-foreground transition-colors" />
                  </div>
                  <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span class="text-sm font-medium text-foreground">系统设置</span>
                    <span class="text-xs text-muted-foreground truncate"
                      >偏好与通用设置</span
                    >
                  </div>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>

    <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8">
      <!-- 骨架屏 -->
      <div
        v-if="loading"
        class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4"
      >
        <SkeletonLoader
          v-for="i in 12"
          :key="i"
          type="card"
          class="rounded-2xl"
        />
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="books.length === 0"
        class="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-500"
      >
        <div class="flex items-center gap-3 mb-2">
          <BookOpen class="h-6 w-6 text-muted-foreground/60" />
          <h2 class="text-xl font-bold">开启阅读之旅</h2>
        </div>
        <p
          class="text-muted-foreground/80 text-center max-w-xs mb-8 leading-relaxed"
        >
          书架空空如也，去探索一些有趣的故事吧
        </p>
        <Button size="lg" @click="goSearch">
          <Plus class="h-4 w-4 mr-2" />
          添加书籍
        </Button>
      </div>

      <template v-else>
        <!-- 最近阅读 (Hero Card) - Optimized Layout -->
        <!-- 最近阅读 (Hero Card) - Web Novel Digital Style -->
        <!-- "继续阅读" 区域 (Grid Layout) -->
        <section
          v-if="recentBooks.length > 0"
          class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
        >
          <div class="flex items-center gap-2 mb-4 px-1">
            <Sparkles class="w-4 h-4 text-primary" />
            <h2
              class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
            >
              继续阅读
            </h2>
          </div>

          <div
            class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6"
          >
            <div
              v-for="{ book, sourceCount } in recentBooks"
              :key="book.bookUrl"
              class="relative"
            >
              <BookCard
                :book="book"
                :show-progress="showProgress"
                :manage-mode="isManageMode"
                :selected="selectedBooks.has(book.bookUrl)"
                @click="handleBookClick"
                @delete="deleteBook"
              />
              <!-- 多源标记 -->
              <div
                v-if="sourceCount > 1 && !isManageMode"
                class="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary/20 backdrop-blur text-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-background z-10 scale-90 sm:scale-100"
              >
                {{ sourceCount }}
              </div>
            </div>
          </div>
        </section>

        <!-- 书架网格 (剩余书籍) -->
        <div
          class="mb-4 px-1 flex items-center gap-2"
          v-if="otherBooks.length > 0"
        >
          <Library class="w-4 h-4 text-muted-foreground" />
          <h2
            class="text-sm font-bold text-muted-foreground uppercase tracking-wider"
          >
            全部书籍
            <span class="text-xs font-normal text-muted-foreground/60 normal-case ml-1">
              ({{ otherBooks.length }})
            </span>
          </h2>
        </div>

        <!-- 虚拟滚动（书籍数量多时） -->
        <div
          v-if="shouldUseVirtualScroll"
          ref="virtualContainerRef"
          class="h-[600px] overflow-auto mb-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 scrollbar-hide pb-32"
        >
          <div
            :style="{
              height: `${virtualizer.getTotalSize()}px`,
              position: 'relative',
            }"
          >
            <div
              v-for="virtualRow in virtualizer.getVirtualItems()"
              :key="virtualRow.key"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }"
            >
              <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 px-1">
                <template
                  v-for="col in getColumnsPerRow()"
                  :key="col"
                >
                  <div
                    v-if="virtualRow.index * getColumnsPerRow() + col - 1 < otherBooks.length"
                    class="relative"
                  >
                    <BookCard
                      :book="otherBooks[virtualRow.index * getColumnsPerRow() + col - 1].book"
                      :show-progress="showProgress"
                      :manage-mode="isManageMode"
                      :selected="selectedBooks.has(otherBooks[virtualRow.index * getColumnsPerRow() + col - 1].book.bookUrl)"
                      @click="handleBookClick"
                      @delete="deleteBook"
                    />
                    <div
                      v-if="otherBooks[virtualRow.index * getColumnsPerRow() + col - 1].sourceCount > 1 && !isManageMode"
                      class="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary/20 backdrop-blur text-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-background z-10 scale-90 sm:scale-100"
                    >
                      {{ otherBooks[virtualRow.index * getColumnsPerRow() + col - 1].sourceCount }}
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 普通网格渲染（书籍数量少时） -->
        <div
          v-else
          class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 pb-32"
        >
          <div
            v-for="{ book, sourceCount } in otherBooks"
            :key="book.bookUrl"
            class="relative"
          >
            <BookCard
              :book="book"
              :show-progress="showProgress"
              :manage-mode="isManageMode"
              :selected="selectedBooks.has(book.bookUrl)"
              @click="handleBookClick"
              @delete="deleteBook"
            />
            <!-- 简单的多源标记 -->
            <div
              v-if="sourceCount > 1 && !isManageMode"
              class="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary/20 backdrop-blur text-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-background z-10 scale-90 sm:scale-100"
            >
              {{ sourceCount }}
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- 底部浮动导航岛 (Floating Dynamic Island Dock) - 仅移动端/平板显示 -->
    <div
      class="fixed bottom-6 sm:bottom-8 left-0 right-0 z-50 flex justify-center pointer-events-none px-4 lg:hidden"
    >
      <div
        class="pointer-events-auto flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 bg-background/80 backdrop-blur-2xl border border-white/20 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] dark:shadow-black/50 rounded-full transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/5 dark:ring-white/10"
      >
        <button
          class="relative group w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all hover:bg-muted active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          @click="refresh"
          title="刷新书架"
          aria-label="刷新书架"
        >
          <Home
            class="h-5 w-5 sm:h-5.5 sm:w-5.5 text-foreground/80 group-hover:text-foreground group-hover:scale-110 transition-transform"
          />
          <span
            class="absolute -bottom-10 bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md whitespace-nowrap hidden sm:block"
          >
            刷新书架
          </span>
        </button>

        <button
          class="relative group w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all hover:bg-muted active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          @click="goSearch"
          title="发现书籍"
          aria-label="发现书籍"
        >
          <Compass
            class="h-5 w-5 sm:h-5.5 sm:w-5.5 text-muted-foreground group-hover:text-primary group-hover:scale-110 transition-transform"
          />
          <span
            class="absolute -bottom-10 bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md whitespace-nowrap hidden sm:block"
          >
            发现书籍
          </span>
        </button>

        <!-- 主操作按钮 (AI/Magic) -->
        <button
          class="relative group w-10 h-10 sm:w-11 sm:h-11 -mt-5 sm:-mt-6 mb-1 rounded-xl sm:rounded-xl bg-foreground text-background shadow-lg shadow-foreground/20 flex items-center justify-center transition-transform hover:scale-110 active:scale-95 ring-4 ring-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          @click="goSearch"
          aria-label="添加书籍"
        >
          <Plus class="h-4 w-4 sm:h-5 sm:w-5" />
          <div
            class="absolute inset-0 rounded-xl sm:rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </button>

        <button
          v-if="deduplicatedBooks.length > 0"
          class="relative group w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all hover:bg-muted active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          :class="{ 'text-primary bg-primary/10': isManageMode }"
          @click="toggleManageMode"
          title="管理模式"
          aria-label="管理模式"
          :aria-pressed="isManageMode"
        >
          <CheckSquare
            class="h-5 w-5 sm:h-5.5 sm:w-5.5 transition-transform"
            :class="
              isManageMode
                ? 'scale-110'
                : 'text-muted-foreground group-hover:scale-110'
            "
          />
          <span
            class="absolute -bottom-10 bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md whitespace-nowrap hidden sm:block"
          >
            管理模式
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              class="relative group w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all hover:bg-muted active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 outline-none"
              title="设置"
              aria-label="设置"
            >
              <Settings
                class="h-5 w-5 sm:h-5.5 sm:w-5.5 text-muted-foreground group-hover:rotate-90 transition-transform duration-500"
              />
              <span
                class="absolute -bottom-10 bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md whitespace-nowrap hidden sm:block"
              >
                设置
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="top"
            class="w-64 mb-4 p-2 rounded-xl border bg-popover/95 backdrop-blur-xl shadow-lg"
          >
            <div class="space-y-0.5">
              <!-- 内容管理组 -->
              <DropdownMenuItem
                @click="router.push('/sources')"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/item"
              >
                <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover/item:bg-primary/20 transition-colors">
                  <Server class="h-4 w-4 text-primary" />
                </div>
                <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span class="text-sm font-medium text-foreground">书源管理</span>
                  <span class="text-xs text-muted-foreground truncate"
                    >管理及导入书源</span
                  >
                </div>
              </DropdownMenuItem>

              <DropdownMenuItem
                @click="router.push('/replace-rule')"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/item"
              >
                <div class="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 group-hover/item:bg-purple-500/20 transition-colors">
                  <Wand2 class="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span class="text-sm font-medium text-foreground">替换规则</span>
                  <span class="text-xs text-muted-foreground truncate"
                    >净化与替换文本内容</span
                  >
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator class="my-1.5" />

              <!-- AI 功能组 -->
              <DropdownMenuItem
                @click="router.push('/ai-settings')"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/item"
              >
                <div class="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 group-hover/item:bg-blue-500/20 transition-colors">
                  <Brain class="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span class="text-sm font-medium text-foreground">AI 模型</span>
                  <span class="text-xs text-muted-foreground truncate"
                    >配置 LLM 助手</span
                  >
                </div>
              </DropdownMenuItem>

              <DropdownMenuSeparator class="my-1.5" />

              <!-- 系统设置 -->
              <DropdownMenuItem
                @click="router.push('/settings')"
                class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/item"
              >
                <div class="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover/item:bg-muted/80 transition-colors">
                  <Settings class="h-4 w-4 text-muted-foreground group-hover/item:text-foreground transition-colors" />
                </div>
                <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span class="text-sm font-medium text-foreground">系统设置</span>
                  <span class="text-xs text-muted-foreground truncate"
                    >偏好与通用设置</span
                  >
                </div>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>

    <!-- 批量操作浮层 -->
    <div
      v-if="isManageMode"
      class="fixed top-24 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-300"
    >
      <div
        class="bg-foreground/90 backdrop-blur text-background px-6 py-3 rounded-full shadow-2xl flex items-center gap-6"
      >
        <span class="font-medium text-sm"
          >已选 {{ selectedBooks.size }} 本</span
        >
        <div class="h-4 w-px bg-background/20"></div>
        <button
          class="text-sm font-medium hover:opacity-80 transition-opacity"
          @click="selectAll"
        >
          {{
            selectedBooks.size === deduplicatedBooks.length ? "取消" : "全选"
          }}
        </button>
        <button
          class="text-sm font-medium text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
          @click="batchDelete"
        >
          <Trash2 class="h-3.5 w-3.5" />
          删除
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 隐藏滚动条但保留功能 */
.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
