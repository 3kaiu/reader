<script setup lang="ts">
/**
 * 首页/书架 - Neo-Modern Redesign
 */
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useDark, useToggle, useStorage } from "@vueuse/core";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { logger } from "@/utils/logger";
import {
  VIRTUAL_SCROLL_THRESHOLD,
  VIRTUAL_SCROLL_OVERSCAN,
} from "@/constants/ui";
import {
  Search,
  Plus,
  Settings,
  Moon,
  Sun,
  BookOpen,
  Library,
  Sparkles,
  Trash2,
  Server,
  Brain,
  Compass,
  Wand2,
  FolderHeart,
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useBreakpoints, breakpointsTailwind } from "@vueuse/core";
import { Input } from "@/components/ui/input";
import { bookApi, groupApi, type Book, type BookGroup } from "@/api/unified";
import { Button } from "@/components/ui/button";
import BookCard from "@/components/book/BookCard.vue";
import { Skeleton } from "@/components/ui";
import { useMessage } from "@/composables/useMessage";
import { useConfirm } from "@/composables/useConfirm";
import MoveBookDialog from "@/components/book/MoveBookDialog.vue";

const offlineStore = useOfflineStore();

const router = useRouter();
const { success } = useMessage();
const { confirm } = useConfirm();

const isDark = useDark();
const toggleDark = useToggle(isDark);

// 响应式断点
const breakpoints = useBreakpoints(breakpointsTailwind);
const isDesktop = breakpoints.greater("sm");
const menuOpen = ref(false);

// 菜单配置
const menuGroups = [
  {
    title: "发现",
    items: [
      {
        label: "探索发现",
        desc: "发现新书与阅读周报",
        icon: Compass,
        path: "/discovery",
        color: "text-orange-500",
        bg: "bg-orange-500/10",
      },
    ],
  },
  {
    title: "内容管理",
    items: [
      {
        label: "书源管理",
        desc: "管理接入的书源站点",
        icon: Server,
        path: "/sources",
        color: "text-blue-500",
        bg: "bg-blue-500/10",
      },
      {
        label: "替换规则",
        desc: "净化与替换文本内容",
        icon: Wand2,
        path: "/replace-rule",
        color: "text-purple-500",
        bg: "bg-purple-500/10",
      },
    ],
  },
  {
    title: "智能助理",
    items: [
      {
        label: "AI 模型",
        desc: "配置 LLM 助手",
        icon: Brain,
        path: "/ai-settings",
        color: "text-green-500",
        bg: "bg-green-500/10",
      },
    ],
  },
  {
    title: "系统",
    items: [
      {
        label: "系统设置",
        desc: "偏好与通用设置",
        icon: Settings,
        path: "/settings",
        color: "text-slate-500",
        bg: "bg-slate-500/10",
      },
    ],
  },
];

const booksWithStatus = computed(() => {
  return deduplicatedBooks.value.map(({ book, sourceCount }) => {
    const cacheStatus = offlineStore.getBookCacheStatus(
      book.bookUrl,
      book.totalChapterNum || 0
    );
    return {
      ...book,
      sourceCount,
      cachePercent: cacheStatus.percentage,
      isFullyCached:
        cacheStatus.cached >= (book.totalChapterNum || 0) &&
        (book.totalChapterNum || 0) > 0,
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

// 过滤掉空分组（没有书籍的分组）
const nonEmptyGroups = computed(() => {
  const bookGroupIds = new Set(
    books.value.map((b) => b.groupId).filter(Boolean)
  );
  return groups.value.filter((g) => bookGroupIds.has(String(g.groupId)));
});

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
const shouldUseVirtualScroll = computed(
  () => otherBooks.value.length > VIRTUAL_SCROLL_THRESHOLD
);
const virtualContainerRef = ref<HTMLElement | null>(null);

// 计算每行显示的列数（响应式）
const getColumnsPerRow = () => {
  if (typeof window === "undefined") return 6;
  const width = window.innerWidth;
  if (width >= 1280) return 6; // xl
  if (width >= 1024) return 5; // lg
  if (width >= 768) return 4; // md
  if (width >= 480) return 3; // sm
  return 2; // xs
};

// 计算行数（响应式）
const rows = computed(() => {
  const cols = getColumnsPerRow();
  return Math.ceil(otherBooks.value.length / cols);
});

// 窗口宽度响应式（用于监听窗口大小变化，触发虚拟滚动更新）
const windowWidth = ref(
  typeof window !== "undefined" ? window.innerWidth : 1280
);

// 监听窗口大小变化
onMounted(() => {
  if (typeof window !== "undefined") {
    const handleResize = () => {
      windowWidth.value = window.innerWidth;
    };
    window.addEventListener("resize", handleResize);
  }
});

// 虚拟滚动器（按行）
// 注意：@tanstack/vue-virtual 的 count 需要是响应式的，但需要确保在数据变化时更新
const virtualizer = useVirtualizer({
  count: rows.value,
  getScrollElement: () => virtualContainerRef.value,
  estimateSize: () => {
    const cols = getColumnsPerRow();
    // 估算每行高度：卡片高度 + gap
    return cols <= 3 ? 280 : cols <= 4 ? 260 : 240;
  },
  overscan: VIRTUAL_SCROLL_OVERSCAN, // 预渲染行数
});

// 监听 rows 和 windowWidth 变化，强制虚拟滚动器重新计算
watch(
  rows,
  (newCount) => {
    if (virtualizer.value) {
      virtualizer.value.setOptions({
        ...virtualizer.value.options,
        count: newCount,
      });
      virtualizer.value.measure();
    }
  },
  { flush: "post" }
);

watch(
  windowWidth,
  () => {
    if (virtualizer.value) {
      virtualizer.value.measure();
    }
  },
  { flush: "post" }
);

// ====== 方法 ======

async function getBooks() {
  try {
    const res = await bookApi.getBookshelf();
    if (res.isSuccess && Array.isArray(res.data)) {
      books.value = res.data;
    } else {
      books.value = [];
    }
  } catch (e) {
    logger.error("加载书架失败", e as Error, { function: "getBooks" });
    books.value = [];
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function getGroups() {
  groupLoading.value = true;
  try {
    const res = await groupApi.getBookGroups();
    if (res.isSuccess && Array.isArray(res.data)) {
      groups.value = res.data;
    } else {
      groups.value = [];
    }
  } catch (e) {
    logger.error("加载分组失败", e as Error);
    groups.value = [];
  } finally {
    groupLoading.value = false;
  }
}

function openBook(book: Book) {
  if (isManageMode.value) {
    toggleSelection(book);
  } else {
    router.push({
      name: "reader",
      query: { url: book.bookUrl, source: book.sourceId },
    });
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

  const booksToDelete = books.value.filter(
    (b: Book) => b.id && selectedBooks.value.has(b.id)
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

  const booksToMove = books.value.filter(
    (b) => b.id && selectedBooks.value.has(b.id)
  );

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
      <div
        class="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]"
      />
      <div
        class="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px]"
      />
    </div>

    <!-- 顶部状态栏占位 (iOS style) -->
    <div class="h-safe-top" />

    <!-- 浮动导航组件 (Floating Nav Elements - No bar) -->
    <div
      class="fixed top-0 left-0 right-0 z-40 pointer-events-none pt-safe-top"
    >
      <div
        class="px-4 sm:px-6 h-[60px] flex items-center justify-between max-w-7xl mx-auto"
      >
        <!-- 左侧：品牌 -->
        <div class="flex items-center gap-2 shrink-0 pointer-events-auto">
          <Library class="h-5 w-5 text-primary" />
          <span class="font-bold text-lg text-foreground tracking-tight"
            >阅读</span
          >
        </div>

        <!-- 右侧：功能区 -->
        <div class="flex items-center gap-3 shrink-0 pointer-events-auto">
          <button
            class="flex items-center justify-center transition-opacity hover:opacity-70 active:scale-90"
            @click="toggleDark()"
            aria-label="切换主题"
          >
            <Sun v-if="!isDark" class="h-5 w-5 text-foreground" />
            <Moon v-else class="h-5 w-5 text-foreground" />
          </button>

          <button
            class="flex items-center justify-center transition-opacity hover:opacity-70 active:scale-90"
            @click="router.push('/discovery')"
            aria-label="发现"
          >
            <Compass class="h-5 w-5 text-foreground" />
          </button>

          <button
            class="flex items-center justify-center transition-opacity hover:opacity-70 active:scale-90"
            @click="goSearch()"
            aria-label="搜索"
          >
            <Search class="h-5 w-5 text-foreground" />
          </button>

          <button
            v-if="booksWithStatus.length > 0"
            class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            @click="toggleManageMode()"
          >
            {{ isManageMode ? "完成" : "管理" }}
          </button>

          <!-- Settings Menu (Responsive) -->
          <component
            :is="isDesktop ? DropdownMenu : Sheet"
            v-model:open="menuOpen"
          >
            <component
              :is="isDesktop ? DropdownMenuTrigger : SheetTrigger"
              as-child
            >
              <button
                class="flex items-center justify-center transition-opacity hover:opacity-70 active:scale-90 outline-none"
                aria-label="设置"
              >
                <Settings class="h-5 w-5 text-foreground" />
              </button>
            </component>

            <!-- Desktop Content -->
            <DropdownMenuContent
              v-if="isDesktop"
              align="end"
              :side-offset="8"
              class="w-72 p-2 rounded-xl border bg-popover/95 backdrop-blur-xl shadow-xl"
            >
              <div class="grid gap-1">
                <div v-for="(group, idx) in menuGroups" :key="idx">
                  <div
                    v-if="group.title"
                    class="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider opacity-70"
                  >
                    {{ group.title }}
                  </div>
                  <DropdownMenuItem
                    v-for="item in group.items"
                    :key="item.path"
                    @click="router.push(item.path)"
                    class="flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer focus:bg-accent focus:text-accent-foreground transition-colors group"
                  >
                    <div
                      class="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 transition-colors"
                      :class="[item.bg, 'group-hover:bg-opacity-80']"
                    >
                      <component
                        :is="item.icon"
                        class="h-4 w-4"
                        :class="item.color"
                      />
                    </div>
                    <div class="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span
                        class="text-[13px] font-medium text-foreground leading-none"
                        >{{ item.label }}</span
                      >
                      <span
                        class="text-[11px] text-muted-foreground truncate leading-none opacity-80"
                        >{{ item.desc }}</span
                      >
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator
                    v-if="idx < menuGroups.length - 1"
                    class="my-1 opacity-50"
                  />
                </div>
              </div>
            </DropdownMenuContent>

            <!-- Mobile Content (Bottom Sheet) -->
            <SheetContent
              v-else
              side="bottom"
              class="rounded-t-[20px] px-4 pb-8 pt-4 bg-background/95 backdrop-blur-xl border-t-0"
            >
              <div
                class="w-10 h-1 rounded-full bg-muted mx-auto mb-6 opacity-50"
              />
              <SheetHeader class="mb-6 text-left px-2">
                <SheetTitle class="text-lg font-bold">功能菜单</SheetTitle>
              </SheetHeader>

              <div class="grid gap-6">
                <div
                  v-for="(group, idx) in menuGroups"
                  :key="idx"
                  class="space-y-3"
                >
                  <div
                    v-if="group.title"
                    class="px-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider"
                  >
                    {{ group.title }}
                  </div>
                  <div class="grid grid-cols-1 gap-2">
                    <button
                      v-for="item in group.items"
                      :key="item.path"
                      @click="
                        router.push(item.path);
                        menuOpen = false;
                      "
                      class="flex items-center gap-4 px-3 py-3 rounded-xl bg-secondary/30 active:scale-[0.98] transition-all border border-transparent active:border-primary/10"
                    >
                      <div
                        class="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                        :class="item.bg"
                      >
                        <component
                          :is="item.icon"
                          class="h-5 w-5"
                          :class="item.color"
                        />
                      </div>
                      <div
                        class="flex flex-col gap-1 items-start flex-1 min-w-0"
                      >
                        <span
                          class="text-[15px] font-semibold text-foreground leading-none"
                          >{{ item.label }}</span
                        >
                        <span
                          class="text-[12px] text-muted-foreground truncate leading-none"
                          >{{ item.desc }}</span
                        >
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </SheetContent>
          </component>
        </div>
      </div>
    </div>

    <main class="px-4 sm:px-6 max-w-7xl mx-auto pt-[62px] pb-12">
      <!-- 分组导航栏 -->
      <section
        v-if="nonEmptyGroups.length > 0"
        class="mb-3 -mx-1 px-1 overflow-x-auto scrollbar-hide flex items-center gap-2 py-1"
      >
        <button
          class="shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
          :class="
            currentGroupId === 'all'
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          @click="currentGroupId = 'all'"
        >
          全部
        </button>
        <button
          v-for="group in nonEmptyGroups"
          :key="group.groupId"
          class="shrink-0 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
          :class="
            currentGroupId === group.groupId
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          "
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
            <div v-for="book in recentBooks" :key="book.id" class="relative">
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
            <span
              class="text-[10px] font-normal text-muted-foreground/60 normal-case ml-1"
            >
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
              :key="`row-${virtualRow.index}`"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }"
            >
              <div
                class="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 px-1"
              >
                <template v-for="col in getColumnsPerRow()" :key="col">
                  <div
                    v-if="
                      virtualRow.index * getColumnsPerRow() + col - 1 <
                      otherBooks.length
                    "
                    class="relative"
                  >
                    <BookCard
                      :book="
                        otherBooks[
                          virtualRow.index * getColumnsPerRow() + col - 1
                        ]
                      "
                      :show-progress="showProgress"
                      :manage-mode="isManageMode"
                      :selected="
                        selectedBooks.has(
                          otherBooks[
                            virtualRow.index * getColumnsPerRow() + col - 1
                          ].id || ''
                        )
                      "
                      :cache-percent="
                        otherBooks[
                          virtualRow.index * getColumnsPerRow() + col - 1
                        ].cachePercent
                      "
                      :is-fully-cached="
                        otherBooks[
                          virtualRow.index * getColumnsPerRow() + col - 1
                        ].isFullyCached
                      "
                      @click="openBook"
                      @delete="handleDelete"
                    />
                    <div
                      v-if="
                        otherBooks[
                          virtualRow.index * getColumnsPerRow() + col - 1
                        ].sourceCount > 1 && !isManageMode
                      "
                      class="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-primary/20 backdrop-blur text-primary text-[10px] font-bold flex items-center justify-center ring-2 ring-background z-10 scale-90 sm:scale-100"
                    >
                      {{
                        otherBooks[
                          virtualRow.index * getColumnsPerRow() + col - 1
                        ].sourceCount
                      }}
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
          <div v-for="book in otherBooks" :key="book.id" class="relative">
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
      :class="
        isManageMode
          ? 'bottom-8 lg:bottom-auto lg:top-24 lg:left-1/2 lg:-translate-x-1/2 lg:w-max'
          : ''
      "
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
          <Button variant="outline" @click="showCreateGroupDialog = false"
            >取消</Button
          >
          <Button @click="createGroup" :disabled="!newGroupName.trim()"
            >创建</Button
          >
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
