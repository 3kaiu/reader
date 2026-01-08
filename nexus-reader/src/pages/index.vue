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
  Compass,
  Wand2,
  FolderHeart,
  BarChart3,
} from "lucide-vue-next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { bookApi, groupApi, type Book, type BookGroup } from "@/api";
import { Button } from "@/components/ui/button";
import BookCard from "@/components/book/BookCard.vue";
import { Skeleton } from "@/components/ui";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import { useErrorHandler } from "@/composables/useErrorHandler";
import MoveBookDialog from "@/components/book/MoveBookDialog.vue";
import { manageApi } from "@/api/manage";
import { useOfflineStore } from "@/stores/offlineStorage";

const offlineStore = useOfflineStore();

const router = useRouter();
const { success } = useMessage();
const { confirm } = useConfirm();
const { handleError } = useErrorHandler();

// 暗色模式
const isDark = useDark();
const toggleDark = useToggle(isDark);

const booksWithStatus = computed(() => {
  return deduplicatedBooks.value.map(({ book, sourceCount }) => {
    const cacheStatus = offlineStore.getBookCacheStatus(book.bookUrl, book.totalChapterNum || 0);
    return {
      ...book,
      sourceCount,
      cachePercent: cacheStatus.percentage,
      isFullyCached: cacheStatus.cached >= (book.totalChapterNum || 0) && (book.totalChapterNum || 0) > 0
    };
  });
});

// ====== 观察者与生命周期 ======
const books = ref<Book[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const showProgress = useStorage("bookshelf-progress", true);
const showMoveDialog = ref(false);

// 分组状态
const groups = ref<BookGroup[]>([]);
const currentGroupId = ref<string | number>("all");
const groupLoading = ref(false);

// 快速创建分组
const showCreateGroupDialog = ref(false);
const newGroupName = ref("");

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
      if ((book.lastReadTime || 0) > (existing.book.lastReadTime || 0)) {
        existing.book = book;
      }
    }
  }
  return Array.from(bookMap.values());
});

const sortedBooks = computed(() => {
  let filtered = booksWithStatus.value; // Use booksWithStatus here
  
  if (currentGroupId.value !== "all") {
    filtered = filtered.filter((book) => book.groupId === currentGroupId.value);
  }

  return [...filtered].sort(
    (a, b) => (b.lastReadTime || 0) - (a.lastReadTime || 0)
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
  if (width >= 480) return 3  // sm
  return 2 // xs
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

async function getBooks() {
  try {
    const res = await bookApi.getBookshelf();
    if (res.isSuccess) {
      books.value = res.data;
    }
  } catch (e) {
    logger.error("加载书架失败", e as Error, { function: "getBooks" });
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function getGroups() {
  groupLoading.value = true;
  try {
    const res = await groupApi.getBookGroups();
    if (res.isSuccess) {
      groups.value = res.data || [];
    }
  } catch (e) {
    logger.error("加载分组失败", e as Error);
  } finally {
    groupLoading.value = false;
  }
}

async function init() {
  loading.value = true;
  await Promise.all([getBooks(), getGroups()]);
}

async function refresh() {
  refreshing.value = true;
  await getBooks();
}

function openBook(book: Book) {
  if (isManageMode.value) {
    toggleSelection(book);
  } else {
    router.push({ name: "reader", query: { url: book.bookUrl, source: book.sourceId } });
  }
}

function toggleManageMode() {
  isManageMode.value = !isManageMode.value;
  selectedBooks.value.clear();
}

function toggleSelection(book: Book) {
  if (!book.id) return;
  if (selectedBooks.value.has(book.id)) {
    selectedBooks.value.delete(book.id);
  } else {
    selectedBooks.value.add(book.id);
  }
}

function selectAll() {
  if (selectedBooks.value.size === booksWithStatus.value.length) {
    selectedBooks.value.clear();
  } else {
    booksWithStatus.value.forEach((book) => {
      if (book.id) selectedBooks.value.add(book.id);
    });
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
    b.id && selectedBooks.value.has(b.id)
  );
  try {
    for (const book of booksToDelete) {
      if (book.id) await bookApi.deleteBook(book.id);
    }
    books.value = books.value.filter(
      (b: Book) => !b.id || !selectedBooks.value.has(b.id)
    );
    selectedBooks.value.clear();
    isManageMode.value = false;
    success("删除成功");
  } catch (e) {
    // 全局拦截器会处理报错
  }
}

async function handleMoveConfirm(groupId: string | null) {
  if (selectedBooks.value.size === 0) return;
  
  const booksToMove = books.value.filter(b => b.id && selectedBooks.value.has(b.id));
  
  try {
    const res = await manageApi.addBookGroupMulti(groupId, booksToMove);
    if (res.isSuccess) {
      success("移动成功");
      await getBooks();
      isManageMode.value = false;
      selectedBooks.value.clear();
    }
  } catch (e) {
    // 全局拦截器处理
  }
}

async function handleDelete(book: Book) {
  const result = await confirm({
    title: "确认删除",
    description: `确定要删除《${book.name}》吗？此操作不可恢复。`,
    variant: "destructive",
  });
  if (!result) return;

  try {
    if (book.id) {
      const res = await bookApi.deleteBook(book.id);
      if (res.isSuccess) {
        success("删除成功");
        books.value = books.value.filter((b: Book) => b.id !== book.id);
      }
    }
  } catch (e) {
    // 拦截器处理
  }
}

function goSearch() {
  router.push("/search");
}

// 快速创建分组
async function createGroup() {
  if (!newGroupName.value.trim()) return;
  try {
    const res = await groupApi.saveBookGroup({
      groupName: newGroupName.value.trim(),
      order: groups.value.length,
      show: true,
    });
    if (res.isSuccess) {
      success("分组创建成功");
      await getGroups();
      showCreateGroupDialog.value = false;
      newGroupName.value = "";
    }
  } catch (e) {
    // 拦截器处理
  }
}

function getCoverUrl(url?: string) {
  if (!url) return "";
  // Nexus-lite doesn't have a /cover endpoint yet, or it's different.
  // Assuming frontend handles standard URLs, or proxy handles it.
  return url;
}


onMounted(() => {
  getBooks();
  getGroups();
  offlineStore.loadCacheIndex();
});
</script>

<template>
  <div>
    <!-- 精致背景装饰 (Subtle background aura) -->
    <div class="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      <div class="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
      <div class="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px]" />
    </div>

    <!-- 顶部状态栏占位 (iOS style) -->
    <div class="h-safe-top" />

    <!-- 浮动导航组件 (Floating Nav Elements - No bar) -->
    <div class="fixed top-0 left-0 right-0 z-40 pointer-events-none pt-safe-top">
      <div class="px-4 sm:px-6 h-[60px] flex items-center justify-between max-w-7xl mx-auto">
        
        <!-- 左侧：品牌 (inline text style) -->
        <div
          class="flex items-center gap-1.5 shrink-0 pointer-events-auto"
        >
          <Library class="h-4 w-4 text-primary" />
          <span class="font-semibold text-sm text-foreground/80">阅读</span>
        </div>

        <!-- 中间：胶囊导航 (Center Pill Nav) -->
        <nav
          class="flex items-center justify-center absolute left-1/2 -translate-x-1/2 pointer-events-auto"
        >
          <div
            class="flex items-center p-1 bg-background/70 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/10 shadow-lg whitespace-nowrap"
          >
            <button
              v-for="item in [
                { id: 'all', label: '书架', path: '/' },
                { id: 'discovery', label: '发现', path: '/discovery' },
                { id: 'statistics', label: '统计', path: '/statistics' }
              ]"
              :key="item.id"
              class="relative px-3 sm:px-5 py-1 sm:py-1.5 rounded-lg sm:rounded-[10px] text-[11px] sm:text-[13px] font-bold transition-all"
              :class="
                $route.path === item.path && !isManageMode
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground active:scale-[0.98]'
              "
              @click="
                item.id === 'all'
                  ? ((isManageMode = false), refresh())
                  : $router.push(item.path)
              "
            >
              {{ item.label }}
            </button>
            <button
              v-if="booksWithStatus.length > 0"
              class="relative px-3 sm:px-5 py-1 sm:py-1.5 rounded-lg sm:rounded-[10px] text-[11px] sm:text-[13px] font-bold transition-all"
              :class="
                isManageMode
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground active:scale-[0.98]'
              "
              @click="toggleManageMode()"
            >
              管理
            </button>
          </div>
        </nav>

        <!-- 右侧：功能区 (floating) -->
        <div class="flex items-center gap-1.5 shrink-0 pointer-events-auto">
          <button
            class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-background/70 backdrop-blur-xl border border-white/10 shadow-sm flex items-center justify-center transition-all hover:bg-background/90 active:scale-90"
            @click="toggleDark()"
            aria-label="切换主题"
          >
            <Sun v-if="!isDark" class="h-4 w-4 text-muted-foreground" />
            <Moon v-else class="h-4 w-4 text-muted-foreground" />
          </button>
            
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <button
                class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-background/70 backdrop-blur-xl border border-white/10 shadow-sm flex items-center justify-center transition-all hover:bg-background/90 active:scale-90 outline-none"
                aria-label="设置"
              >
                <Settings class="h-4 w-4 text-muted-foreground" />
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
    </div>

    <main class="px-4 sm:px-6 max-w-7xl mx-auto pt-[62px] pb-12">
      <!-- 分组导航栏 -->
      <section class="mb-3 -mx-1 px-1 overflow-x-auto scrollbar-hide flex items-center gap-2 py-1">
        <button
          class="shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
          :class="currentGroupId === 'all' 
            ? 'bg-primary text-primary-foreground shadow-md' 
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="currentGroupId = 'all'"
        >
          全部
        </button>
        <button
          v-for="group in groups"
          :key="group.groupId"
          class="shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
          :class="currentGroupId === group.groupId 
            ? 'bg-primary text-primary-foreground shadow-md' 
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'"
          @click="currentGroupId = group.groupId"
        >
          {{ group.groupName }}
        </button>
      </section>

      <!-- 骨架屏 -->
      <div
        v-if="loading"
        class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 sm:gap-6"
      >
        <div v-for="i in 12" :key="i" class="space-y-3">
          <Skeleton width="100%" aspect-ratio="2/3" class-name="rounded-xl" />
          <div class="space-y-2">
            <Skeleton width="100%" height="14px" />
            <Skeleton width="60%" height="12px" />
          </div>
        </div>
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
          <div class="flex items-center gap-2 mb-3 px-1">
            <Sparkles class="w-3.5 h-3.5 text-primary" />
            <h2
              class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest"
            >
              继续阅读
            </h2>
          </div>

          <div
            class="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6"
          >
            <div
              v-for="book in recentBooks"
              :key="book.id"
              class="relative"
            >
              <BookCard
                :book="book"
                :show-progress="showProgress"
                :manage-mode="isManageMode"
                :selected="selectedBooks.has(book.id || '')"
                :cache-percent="book.cachePercent"
                :is-fully-cached="book.isFullyCached"
                @click="openBook"
                @delete="handleDelete"
              />
              <!-- 多源标记 -->
              <div
                v-if="book.sourceCount > 1 && !isManageMode"
                class="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary/20 backdrop-blur text-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-background z-10 scale-90 sm:scale-100"
              >
                {{ book.sourceCount }}
              </div>
            </div>
          </div>
        </section>

        <!-- 书架网格 (剩余书籍) -->
        <div
          class="mb-4 px-1 flex items-center gap-2"
          v-if="otherBooks.length > 0"
        >
          <Library class="w-3.5 h-3.5 text-muted-foreground" />
          <h2
            class="text-[11px] font-bold text-muted-foreground uppercase tracking-widest"
          >
            全部书籍
            <span class="text-[10px] font-normal text-muted-foreground/60 normal-case ml-1">
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
              <div class="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 px-1">
                <template
                  v-for="col in getColumnsPerRow()"
                  :key="col"
                >
                  <div
                    v-if="virtualRow.index * getColumnsPerRow() + col - 1 < otherBooks.length"
                    class="relative"
                  >
                    <BookCard
                      :book="otherBooks[virtualRow.index * getColumnsPerRow() + col - 1]"
                      :show-progress="showProgress"
                      :manage-mode="isManageMode"
                      :selected="selectedBooks.has(otherBooks[virtualRow.index * getColumnsPerRow() + col - 1].id || '')"
                      :cache-percent="otherBooks[virtualRow.index * getColumnsPerRow() + col - 1].cachePercent"
                      :is-fully-cached="otherBooks[virtualRow.index * getColumnsPerRow() + col - 1].isFullyCached"
                      @click="openBook"
                      @delete="handleDelete"
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
          class="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200"
        >
          <div
            v-for="book in otherBooks"
            :key="book.id"
            class="relative"
          >
            <BookCard
              :book="book"
              :show-progress="showProgress"
              :manage-mode="isManageMode"
              :selected="selectedBooks.has(book.id || '')"
              :cache-percent="book.cachePercent"
              :is-fully-cached="book.isFullyCached"
              @click="openBook"
              @delete="handleDelete"
            />
            <!-- 简单的多源标记 -->
            <div
              v-if="book.sourceCount > 1 && !isManageMode"
              class="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary/20 backdrop-blur text-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-background z-10 scale-90 sm:scale-100"
            >
              {{ book.sourceCount }}
            </div>
          </div>
        </div>
      </template>
    </main>


    <!-- 批量操作浮层 -->
    <div
      v-if="isManageMode"
      class="fixed left-4 right-4 z-[60] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-none"
      :class="isManageMode ? 'bottom-8 lg:bottom-auto lg:top-24 lg:left-1/2 lg:-translate-x-1/2 lg:w-max' : ''"
    >
      <div
        class="bg-foreground/95 backdrop-blur-2xl text-background px-4 sm:px-6 py-3.5 rounded-2xl sm:rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-between pointer-events-auto border border-white/10 max-w-2xl mx-auto"
      >
        <div class="flex items-center gap-2 sm:gap-4">
          <span class="font-bold text-[12px] sm:text-sm whitespace-nowrap"
            >已选 {{ selectedBooks.size }} 本</span
          >
          <div class="h-4 w-px bg-background/20 hidden sm:block"></div>
          <button
            class="h-8 px-3 rounded-lg flex items-center justify-center text-[11px] sm:text-sm font-bold hover:bg-background/10 transition-all active:scale-95 whitespace-nowrap"
            @click="selectAll"
          >
            {{
              selectedBooks.size === deduplicatedBooks.length ? "取消" : "全选"
            }}
          </button>
        </div>

        <div class="flex items-center gap-2 sm:gap-6">
          <button
            class="h-9 px-3 rounded-xl flex items-center gap-1.5 text-[11px] sm:text-sm font-bold text-primary hover:bg-primary/10 transition-all active:scale-95"
            @click="showMoveDialog = true"
          >
            <FolderHeart class="h-4 w-4" />
            <span class="hidden sm:inline">移动</span>
          </button>
          <button
            class="h-9 px-3 rounded-xl flex items-center gap-1.5 text-[11px] sm:text-sm font-bold text-red-400 hover:bg-red-400/10 transition-all active:scale-95"
            @click="batchDelete"
          >
            <Trash2 class="h-4 w-4" />
            <span class="hidden sm:inline">删除</span>
          </button>
          <button 
            class="lg:hidden h-8 px-3 rounded-lg text-[11px] font-bold opacity-60 active:bg-background/10"
            @click="isManageMode = false"
          >
            退出
          </button>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <MoveBookDialog 
      v-model:open="showMoveDialog"
      :groups="groups"
      :selected-count="selectedBooks.size"
      @confirm="handleMoveConfirm"
    />
    
    <!-- 创建分组对话框 -->
    <Dialog v-model:open="showCreateGroupDialog">
      <DialogContent class="sm:max-w-[350px]">
        <DialogHeader>
          <DialogTitle>创建分组</DialogTitle>
        </DialogHeader>
        <div class="py-4">
          <Input 
            v-model="newGroupName" 
            placeholder="输入分组名称" 
            @keyup.enter="createGroup"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreateGroupDialog = false">取消</Button>
          <Button @click="createGroup" :disabled="!newGroupName.trim()">创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

.pb-safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>
