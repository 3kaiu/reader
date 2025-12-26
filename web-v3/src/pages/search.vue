<script setup lang="ts">
/**
 * 搜索页面 - 上一版搜索组件在内容区，顶部保留搜索按钮
 */
import { ref, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useStorage } from "@vueuse/core";
import { logger } from "@/utils/logger";
import {
  Search,
  ArrowLeft,
  X,
  Loader2,
  BookMarked,
  Check,
} from "lucide-vue-next";
import { bookApi, type Book } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import LazyImage from "@/components/ui/LazyImage.vue";
import { useMessage } from "@/composables/useMessage";
import { useErrorHandler } from "@/composables/useErrorHandler";

const router = useRouter();
const { success, error, warning } = useMessage();
const { handleApiError, handlePromiseError } = useErrorHandler();

// ====== 状态 ======
const searchKeyword = ref("");
const searchResult = ref<Book[]>([]);
const loading = ref(false);
const hasSearched = ref(false);
const addedBooks = ref<Set<string>>(new Set());
const openingBook = ref<string | null>(null);
const progress = ref({ current: 0, total: 0 });

const searchHistory = useStorage<string[]>("search-history", []);

// ====== 计算属性 ======
const resultCount = computed(() => searchResult.value.length);

// ====== 方法 ======

function stopSearch() {
  if (window.searchEventSource) {
    window.searchEventSource.close();
    window.searchEventSource = null;
  }
  loading.value = false;
}

async function search(keyword?: string) {
  const query = keyword || searchKeyword.value.trim();
  if (!query) {
    warning("请输入搜索关键词");
    return;
  }

  searchKeyword.value = query;

  stopSearch();

  if (!searchHistory.value.includes(query)) {
    searchHistory.value = [query, ...searchHistory.value.slice(0, 9)];
  }

  loading.value = true;
  hasSearched.value = true;
  searchResult.value = [];

  // 使用 requestAnimationFrame 确保 DOM 更新后再滚动，实现平滑过渡
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  const url = bookApi.getSearchBookSSEUrl(query);
  progress.value = { current: 0, total: 0 };

  const es = new EventSource(url);
  window.searchEventSource = es;

  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);

      if (parsed.type === "progress") {
        progress.value = {
          current: parsed.current,
          total: parsed.total,
        };
        return;
      }

      if (parsed.type === "end") {
        es.close();
        loading.value = false;
        window.searchEventSource = null;
        return;
      }

      if (parsed.data && Array.isArray(parsed.data)) {
        parsed.data.forEach((item: any) => {
          if (item && item.bookUrl) {
            searchResult.value.push(item);
          }
        });
        return;
      }

      if (parsed && parsed.bookUrl) {
        searchResult.value.push(parsed);
      }
    } catch (e) {
      logger.error("SSE 解析错误", e as Error, { function: "searchPage" });
    }
  };

  es.addEventListener("end", () => {
    es.close();
    loading.value = false;
    window.searchEventSource = null;
  });

  es.onerror = () => {
    es.close();
    loading.value = false;
    window.searchEventSource = null;
    handlePromiseError(new Error("搜索连接失败"), "搜索失败，请重试");
  };
}

onUnmounted(() => {
  stopSearch();
});

declare global {
  interface Window {
    searchEventSource: EventSource | null;
  }
}

async function addToShelf(book: Book) {
  if (addedBooks.value.has(book.bookUrl)) return;

  try {
    const res = await bookApi.saveBook(book);
    if (res.isSuccess) {
      addedBooks.value.add(book.bookUrl);
      success(`《${book.name}》已添加到书架`);
    } else {
      handleApiError(res, "添加失败");
    }
  } catch (e) {
    handlePromiseError(e, "添加失败");
  }
}

async function openBook(book: Book) {
  if (openingBook.value === book.bookUrl) return;
  openingBook.value = book.bookUrl;

  try {
    if (!addedBooks.value.has(book.bookUrl)) {
      const res = await bookApi.saveBook(book);
      if (!res.isSuccess) {
        handleApiError(res, "无法打开书籍，请重试");
        return;
      }
      addedBooks.value.add(book.bookUrl);
    }
    router.push({ name: "reader", query: { url: book.bookUrl } });
  } catch (e) {
    handlePromiseError(e, "打开书籍失败");
  } finally {
    openingBook.value = null;
  }
}

function clearHistory() {
  searchHistory.value = [];
}

function goBack() {
  router.back();
}

function resetSearch() {
  stopSearch();
  hasSearched.value = false;
  searchResult.value = [];
  searchKeyword.value = "";
  // 重置后滚动到顶部，准备新的搜索
  window.scrollTo({ top: 0, behavior: "smooth" });
}
</script>

<template>
  <div
    class="min-h-screen bg-background text-foreground pb-24 selection:bg-primary/20"
  >
    <div class="h-safe-top" />

    <!-- 搜索前：Hero 状态 -->
    <div
      v-if="!hasSearched && !loading && searchResult.length === 0"
      class="min-h-screen flex flex-col items-center justify-center px-6 animate-in fade-in zoom-in-95 duration-500 pt-20"
    >
      <div class="w-full max-w-2xl flex flex-col items-center">
        <p
          class="text-muted-foreground text-center max-w-md text-sm sm:text-base leading-relaxed mb-10"
        >
          在搜索框输入书名或作者名称进行搜索
        </p>

        <!-- 搜索组件 - 上一版设计 -->
        <div class="w-full max-w-xl mb-12 flex items-center gap-3">
          <div class="flex-1 relative group">
            <div
              class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10"
            >
              <Search
                class="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors"
              />
            </div>
            <Input
              v-model="searchKeyword"
              class="pl-10 pr-10 h-10 rounded-full bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0"
              placeholder="搜索书名或作者..."
              @keyup.enter="search()"
              autofocus
            />
            <button
              v-if="searchKeyword"
              class="absolute inset-y-0 right-0 pr-3 flex items-center z-10"
              @click="searchKeyword = ''"
              aria-label="清除"
            >
              <X
                class="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
              />
            </button>
          </div>
          <!-- 搜索按钮 -->
          <Button
            variant="outline"
            size="sm"
            @click="
              searchKeyword = '测试';
              search('测试');
            "
            class="rounded-full shrink-0 min-w-[80px]"
          >
            搜索
          </Button>
          <!-- 停止按钮 - 加载时显示 -->
          <Button
            v-if="loading"
            variant="destructive"
            size="sm"
            @click="stopSearch"
            class="rounded-full shrink-0"
            aria-label="停止搜索"
          >
            停止
          </Button>
        </div>
        <!-- 搜索历史 -->
        <div
          v-if="searchHistory.length > 0"
          class="w-full max-w-xl animate-in slide-in-from-bottom-4 duration-500 delay-100"
        >
          <div class="flex items-center justify-between mb-4 px-1">
            <span
              class="text-xs font-semibold text-muted-foreground uppercase tracking-widest"
            >
              最近搜索
            </span>
            <button
              class="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1"
              @click="clearHistory"
            >
              清除
            </button>
          </div>
          <div class="flex flex-wrap gap-2 justify-center sm:justify-start">
            <button
              v-for="keyword in searchHistory.slice(0, 8)"
              :key="keyword"
              class="px-4 py-2 rounded-full bg-secondary hover:bg-secondary/80 text-sm text-foreground/80 hover:text-foreground transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:shadow-sm"
              @click="search(keyword)"
              :aria-label="`搜索 ${keyword}`"
            >
              {{ keyword }}
            </button>
          </div>
        </div>
        <div v-else class="text-center">
          <p class="text-sm text-muted-foreground/60">暂无搜索历史</p>
        </div>

        <div class="mt-12">
          <Button variant="ghost" @click="goBack"> 返回书架 </Button>
        </div>
      </div>
    </div>

    <!-- 搜索结果区域 -->
    <main
      v-else
      class="max-w-7xl mx-auto px-5 sm:px-6 pt-20 sm:pt-24 animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <!-- 顶部搜索栏 - 固定在顶部 -->
      <div
        class="sticky top-4 z-30 mb-6 flex justify-center animate-in fade-in slide-in-from-top-2 duration-300"
      >
        <div class="relative w-full max-w-2xl group">
          <div
            class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10"
          >
            <Search
              class="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors"
            />
          </div>
          <Input
            v-model="searchKeyword"
            class="pl-10 pr-10 h-10 rounded-full border-0 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0 shadow-lg backdrop-blur-sm bg-background/90"
            placeholder="搜索书名或作者..."
            @keyup.enter="search()"
          />
          <button
            v-if="searchKeyword"
            class="absolute inset-y-0 right-0 pr-3 flex items-center z-10"
            @click="searchKeyword = ''"
            aria-label="清除"
          >
            <X
              class="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
            />
          </button>
        </div>
      </div>

      <!-- 状态栏 -->
      <div
        class="flex items-center justify-between mb-6 px-1 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100"
      >
        <div class="flex items-center gap-3">
          <span class="text-sm font-semibold text-foreground">搜索结果</span>
          <Badge v-if="loading" variant="secondary" class="gap-1.5">
            <Loader2 class="h-3 w-3 animate-spin" />
            搜索中...
          </Badge>
          <Badge v-else-if="resultCount > 0" variant="secondary">
            {{ resultCount }} 本
          </Badge>
        </div>
        <div class="flex items-center gap-2">
          <Button
            v-if="loading"
            variant="destructive"
            size="sm"
            @click="stopSearch"
            class="rounded-full text-xs h-7 px-3"
            aria-label="停止搜索"
          >
            停止搜索
          </Button>
        </div>
      </div>

      <!-- 结果网格 -->
      <div
        v-if="searchResult.length > 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20"
      >
        <div
          v-for="(book, index) in searchResult"
          :key="book.bookUrl + index"
          class="group relative flex bg-card rounded-2xl border border-border/40 hover:border-border hover:shadow-md cursor-pointer overflow-hidden transition-all duration-200 ease-out hover:bg-muted/30 active:scale-[0.98]"
          @click="openBook(book)"
        >
          <!-- 封面 -->
          <div class="relative w-24 shrink-0 bg-muted">
            <LazyImage
              v-if="book.coverUrl"
              :src="`/reader3/cover?path=${encodeURIComponent(book.coverUrl)}`"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center text-muted-foreground/20 bg-secondary"
            >
              <BookMarked class="h-8 w-8" />
            </div>
          </div>

          <!-- 信息 -->
          <div class="flex-1 p-3 flex flex-col min-w-0">
            <h3
              class="font-medium text-sm text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors mb-1"
            >
              {{ book.name }}
            </h3>

            <div class="flex items-center gap-1.5 mb-2">
              <span class="text-xs text-muted-foreground truncate">{{
                book.author || "未知作者"
              }}</span>
              <span class="text-xs text-muted-foreground/30">•</span>
              <span
                class="text-[10px] text-muted-foreground/70 truncate max-w-[6rem]"
                >{{ book.originName }}</span
              >
            </div>

            <!-- 简介 -->
            <div class="flex-1 relative mb-2">
              <p
                v-if="book.intro"
                class="text-xs text-muted-foreground/60 line-clamp-2 leading-relaxed"
              >
                {{ book.intro.trim() }}
              </p>
              <p
                v-else-if="book.latestChapterTitle"
                class="text-[10px] text-muted-foreground/50 truncate"
              >
                {{ book.latestChapterTitle }}
              </p>
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center justify-end">
              <Button
                size="sm"
                variant="ghost"
                class="h-7 px-3 text-xs rounded-md hover:bg-secondary"
                :class="
                  addedBooks.has(book.bookUrl)
                    ? 'text-green-600'
                    : 'text-muted-foreground'
                "
                @click.stop="addToShelf(book)"
              >
                <Check
                  v-if="addedBooks.has(book.bookUrl)"
                  class="h-3 w-3 mr-1"
                />
                <span v-else class="mr-1 text-[10px]">+</span>
                {{ addedBooks.has(book.bookUrl) ? "已添加" : "收藏" }}
              </Button>
            </div>
          </div>

          <!-- Loading Overlay -->
          <div
            v-if="openingBook === book.bookUrl"
            class="absolute inset-0 bg-background/80 backdrop-blur-sm z-30 flex items-center justify-center"
          >
            <Loader2 class="h-5 w-5 animate-spin text-primary" />
          </div>
        </div>
      </div>

      <!-- 加载骨架 -->
      <div
        v-if="loading && searchResult.length === 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20"
      >
        <div
          v-for="i in 8"
          :key="i"
          class="flex h-32 rounded-2xl border border-border/30 bg-card p-0 overflow-hidden"
        >
          <div class="w-24 bg-muted animate-pulse" />
          <div class="flex-1 p-3 space-y-2">
            <div class="h-4 w-3/4 bg-muted animate-pulse rounded" />
            <div class="h-3 w-1/2 bg-muted animate-pulse rounded" />
            <div
              class="h-10 w-full bg-muted animate-pulse rounded mt-2 opacity-50"
            />
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-if="!loading && searchResult.length === 0 && hasSearched"
        class="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-500"
      >
        <div class="flex items-center gap-3 mb-4">
          <Search class="h-8 w-8 text-muted-foreground/60" />
          <h3 class="text-lg font-semibold">未找到相关书籍</h3>
        </div>
        <p class="text-muted-foreground/80 text-center max-w-xs mb-8">
          尝试更换搜索关键词或检查输入是否正确
        </p>
        <div class="flex gap-3">
          <Button @click="resetSearch" variant="outline" class="rounded-full">
            重新搜索
          </Button>
          <Button @click="goBack" variant="ghost" class="rounded-full">
            返回书架
          </Button>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
