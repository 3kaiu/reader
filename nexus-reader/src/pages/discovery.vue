<script setup lang="ts">
/**
 * 发现页 - Discovery / Explore
 * 特性：周报回溯、轮播图展示、精选榜单、沉浸式设计
 */
import { ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { 
  ChevronLeft, 
  Calendar, 
  Sparkles, 
  Trophy, 
  ArrowRight,
  Search,
  BookOpen,
  Users
} from "lucide-vue-next";
import { bookApi, type DiscoveryResponse, type DiscoveryItem } from "@/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton, LazyImage } from "@/components/ui";
import { useMessage } from "@/composables/useMessage";
import { useErrorHandler } from "@/composables/useErrorHandler";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const router = useRouter();
const { error } = useMessage();
const { handlePromiseError } = useErrorHandler();

// ====== 状态 ======
const data = ref<DiscoveryResponse | null>(null);
const loading = ref(true);
const currentPeriod = ref<string>("");

// ====== 方法 ======
async function loadDiscovery(period?: string) {
  loading.value = true;
  try {
    const res = await bookApi.getDiscovery(period);
    if (res.isSuccess && res.data) {
      data.value = res.data;
      currentPeriod.value = res.data.period;
    }
  } catch (e) {
    handlePromiseError(e, "加载发现数据失败");
  } finally {
    loading.value = false;
  }
}

function handleBookClick(item: DiscoveryItem) {
  // 优先跳转到官方网址
  if (item.bookUrl) {
    window.open(item.bookUrl, '_blank');
    return;
  }
  
  // 没有 URL 则跳转搜索
  router.push({
    path: '/search',
    query: { q: item.name }
  });
}

function changePeriod(period: string) {
  if (period === currentPeriod.value) return;
  loadDiscovery(period);
}

onMounted(() => {
  loadDiscovery();
});

// 获取各部分数据
const getSection = (type: string) => {
  return data.value?.sections.find(s => s.section === type)?.items || [];
};

// 格式化日期范围
const formattedDateRange = (start: string, end: string) => {
  if (!start) return "";
  const s = new Date(start).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  const e = new Date(end).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  return `${s} - ${e}`;
};
</script>

<template>
  <div class="min-h-screen bg-background selection:bg-primary/20 pb-20">
    <div class="h-safe-top" />

    <!-- 顶部导航栏 -->
    <header class="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="icon" class="rounded-full" @click="router.back()">
            <ChevronLeft class="h-6 w-6" />
          </Button>
          <div class="flex flex-col">
            <h1 class="text-lg font-bold tracking-tight">探索发现</h1>
            <p v-if="data" class="text-[10px] text-muted-foreground font-medium uppercase tracking-widest opacity-70">
              {{ data.period === 'all' ? '全部历史' : data.period }} · {{ formattedDateRange(data.startDate, data.endDate) }}
            </p>
          </div>
        </div>

        <!-- 周期切换器 -->
        <DropdownMenu v-if="data?.availablePeriods.length">
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" class="rounded-full gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10">
              <Calendar class="h-4 w-4 text-primary" />
              <span class="text-xs font-semibold">{{ currentPeriod === 'all' ? '全部' : currentPeriod }}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-48 max-h-[16rem] overflow-y-auto rounded-xl shadow-2xl border-primary/10">
            <DropdownMenuItem 
              v-for="p in data.availablePeriods" 
              :key="p"
              @click="changePeriod(p)"
              class="flex items-center justify-between py-2.5 px-3 cursor-pointer"
              :class="{ 'bg-primary/10 text-primary font-bold': p === currentPeriod }"
            >
              <span class="text-sm">{{ p === 'all' ? '全部历史' : p }}</span>
              <Sparkles v-if="p === currentPeriod" class="h-3 w-3" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 pt-6 space-y-10">
      <!-- 加载骨架屏 -->
      <template v-if="loading">
        <div class="space-y-12">
          <!-- Banner 骨架 -->
          <div class="flex gap-4 overflow-hidden">
             <Skeleton width="85vw" height="48vw" class-name="rounded-3xl shrink-0 sm:w-[60vw]" v-for="i in 2" :key="i" />
          </div>
          
          <!-- 书单网格骨架 -->
          <div class="space-y-4">
            <Skeleton width="120px" height="28px" />
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              <div v-for="i in 6" :key="i" class="space-y-3">
                <Skeleton width="100%" aspect-ratio="3/4" class-name="rounded-2xl" />
                <div class="space-y-2">
                  <Skeleton width="80%" height="16px" />
                  <Skeleton width="40%" height="12px" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="data">
        <!-- 核心轮播区间 (Carousel Section) -->
        <section v-if="getSection('carousel').length" class="relative group">
          <div class="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4 pb-2">
            <div 
              v-for="book in getSection('carousel')" 
              :key="book.bookId"
              class="flex-none w-[85vw] sm:w-[60vw] md:w-[45vw] lg:w-[35vw] snap-center"
              @click="handleBookClick(book)"
            >
              <div class="relative aspect-[16/9] rounded-3xl overflow-hidden cursor-pointer group/card shadow-lg hover:shadow-2xl transition-all duration-500">
                <LazyImage
                  v-if="book.coverUrl"
                  :src="book.coverUrl"
                  :alt="book.name"
                  aspect-ratio="16/9"
                  class="w-full h-full transition-transform duration-700 group-hover/card:scale-110"
                />
                <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-6">
                  <Badge class="w-fit mb-3 bg-primary/20 backdrop-blur-md text-primary-foreground border-none text-[10px]">小编精选</Badge>
                  <h2 class="text-xl sm:text-2xl font-bold text-white mb-1 line-clamp-1">{{ book.name }}</h2>
                  <p v-if="book.intro" class="text-white/70 text-sm line-clamp-2 max-w-[90%]">{{ book.intro }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 精选书单列表 (Image List Section) -->
        <section v-if="getSection('image_list').length" class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Sparkles class="h-5 w-5 text-yellow-500" />
              本周力荐
            </h3>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            <div 
              v-for="book in getSection('image_list')" 
              :key="book.bookId"
              class="group cursor-pointer space-y-3"
              @click="handleBookClick(book)"
            >
              <div class="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-md group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-300">
                <LazyImage
                  v-if="book.coverUrl"
                  :src="book.coverUrl"
                  :alt="book.name"
                  aspect-ratio="3/4"
                  class="w-full h-full transition-transform duration-500 group-hover:scale-105"
                />
                <div class="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-colors" />
                <div class="absolute top-2 left-2">
                  <div class="bg-black/60 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded-lg font-bold">
                    No.{{ book.position }}
                  </div>
                </div>
              </div>
              <div class="space-y-1">
                <h4 class="font-bold text-sm line-clamp-1 group-hover:text-primary transition-colors">{{ book.name }}</h4>
                <p v-if="book.author" class="text-xs text-muted-foreground/70">{{ book.author }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- 潜力新书榜 (New Sign Section) -->
        <section v-if="getSection('new_sign').length" class="space-y-6">
          <div class="flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-xl font-bold tracking-tight">
              <Trophy class="h-5 w-5 text-orange-500" />
              历史风云榜
            </h3>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              v-for="book in getSection('new_sign')" 
              :key="book.bookId"
              class="group flex items-center gap-4 p-4 rounded-3xl bg-muted/30 border border-transparent hover:border-primary/20 hover:bg-muted/50 transition-all duration-300 cursor-pointer"
              @click="handleBookClick(book)"
            >
              <div class="relative shrink-0 w-16 h-20 rounded-xl overflow-hidden shadow-sm">
                <LazyImage
                  v-if="book.coverUrl"
                  :src="book.coverUrl"
                  :alt="book.name"
                  aspect-ratio="4/5"
                  class="w-full h-full"
                />
                <div v-else class="w-full h-full bg-muted flex items-center justify-center">
                   <BookOpen class="h-6 w-6 text-muted-foreground/30" />
                </div>
              </div>
              <div class="flex-1 min-w-0 space-y-1.5">
                <div class="flex items-center gap-2">
                   <span class="text-lg font-black italic opacity-20 group-hover:opacity-40 transition-opacity">#{{ book.position }}</span>
                   <h4 class="font-bold text-base truncate group-hover:text-primary transition-colors">{{ book.name || '未知书名' }}</h4>
                </div>
                <div class="flex items-center gap-3 text-xs text-muted-foreground">
                  <span v-if="book.author" class="flex items-center gap-1">
                    <Users class="h-3 w-3" />
                    {{ book.author }}
                  </span>
                  <span v-if="book.followers" class="flex items-center gap-1 text-primary/80 font-medium">
                    <Sparkles class="h-3 w-3" />
                    {{ (book.followers / 10000).toFixed(1) }}万关注
                  </span>
                </div>
              </div>
              <ArrowRight class="h-5 w-5 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </section>
      </template>

      <!-- 空状态 -->
      <div v-else class="flex flex-col items-center justify-center py-32 space-y-4 opacity-50">
        <Search class="h-16 w-16 stroke-1" />
        <p class="text-lg font-medium">暂无发现数据</p>
        <Button variant="outline" @click="loadDiscovery()">重试</Button>
      </div>
    </main>
  </div>
</template>

<style scoped>
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
