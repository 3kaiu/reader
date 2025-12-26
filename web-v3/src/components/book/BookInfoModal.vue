<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  BookOpen, 
  Library, 
  RefreshCw, 
  Calendar,
  User,
  Globe,
  Tag
} from 'lucide-vue-next'
import { bookApi, type Book } from '@/api/book'
import { useReaderStore } from '@/stores/reader'
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
  open?: boolean
  bookUrl?: string
  initialBook?: Book | null
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update-shelf': []
}>()

const router = useRouter()
const message = useMessage()
const readerStore = useReaderStore()

// 状态
const loading = ref(false)
const info = ref<Book | null>(null)

// 计算属性
const displayBook = computed(() => info.value || props.initialBook || null)

// 监听
watch(() => props.open, (val) => {
  if (val && props.bookUrl) {
    loadInfo()
  }
})

watch(() => props.initialBook, (val) => {
  if (val) info.value = val
})

// 方法
async function loadInfo() {
  if (!props.bookUrl) return
  
  loading.value = true
  try {
    const res = await bookApi.getBookInfo(props.bookUrl)
    if (res.isSuccess) {
      info.value = res.data
    }
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function addToShelf() {
  if (!displayBook.value) return
  
  try {
    const res = await bookApi.saveBook(displayBook.value)
    if (res.isSuccess) {
      message.success('加入书架成功')
      emit('update-shelf')
      // 如果是在详情页更新了信息，也同步一下
      info.value = res.data
    } else {
      message.error(res.errorMsg || '操作失败')
    }
  } catch (err) {
    message.error('操作失败')
  }
}

async function startReading() {
  if (!displayBook.value) return
  
  // 如果当前已经在阅读该书，直接关闭
  if (readerStore.currentBook?.bookUrl === displayBook.value.bookUrl) {
    emit('update:open', false)
    return
  }
  
  // 否则跳转/打开
  await readerStore.openBook(displayBook.value)
  router.push({
    path: '/reader',
    query: { url: displayBook.value.bookUrl }
  })
  emit('update:open', false)
}

function formatIntro(intro?: string) {
  if (!intro) return '暂无简介'
  return intro.replace(/\s+/g, '\n').trim()
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="bottom" class="h-[85vh] flex flex-col p-0 rounded-t-xl">
      <SheetHeader class="px-6 py-4 border-b flex-shrink-0">
        <SheetTitle class="text-center">书籍详情</SheetTitle>
      </SheetHeader>

      <div class="flex-1 overflow-y-auto" v-if="displayBook">
        <!-- 头部信息 -->
        <div class="p-6 flex gap-5">
          <!-- 封面 -->
          <div class="w-28 shrink-0">
            <div class="aspect-[2/3] rounded-lg shadow-md overflow-hidden bg-muted relative">
              <img 
                v-if="displayBook.coverUrl"
                :src="displayBook.coverUrl" 
                class="w-full h-full object-cover"
                @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
              >
              <div class="absolute inset-0 flex items-center justify-center text-muted-foreground/30 font-serif text-3xl font-bold bg-muted" v-else>
                {{ displayBook.name[0] }}
              </div>
            </div>
          </div>
          
          <!-- 元数据 -->
          <div class="flex-1 space-y-3 min-w-0">
            <h2 class="text-xl font-bold leading-tight break-words">{{ displayBook.name }}</h2>
            
            <div class="space-y-1.5 text-sm text-muted-foreground">
              <div class="flex items-center gap-2">
                <User class="h-4 w-4" />
                <span>{{ displayBook.author }}</span>
              </div>
              <div class="flex items-center gap-2" v-if="displayBook.kind">
                <Tag class="h-4 w-4" />
                <span>{{ displayBook.kind }}</span>
              </div>
              <div class="flex items-center gap-2" v-if="displayBook.latestChapterTitle">
                <RefreshCw class="h-4 w-4" />
                <span class="truncate">{{ displayBook.latestChapterTitle }}</span>
              </div>
              <div class="flex items-center gap-2" v-if="displayBook.originName">
                <Globe class="h-4 w-4" />
                <span>{{ displayBook.originName }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 简介 -->
        <div class="px-6 pb-6">
          <h3 class="font-medium mb-2">简介</h3>
          <div class="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/30 p-4 rounded-lg">
            {{ formatIntro(displayBook.intro) }}
          </div>
        </div>
      </div>
      
      <!-- 底部按钮 -->
      <div class="p-4 border-t flex gap-3 mt-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button class="flex-1" variant="outline" @click="addToShelf">
          <Library class="h-4 w-4 mr-2" />
          加入书架
        </Button>
        <Button class="flex-1" @click="startReading">
          <BookOpen class="h-4 w-4 mr-2" />
          开始阅读
        </Button>
      </div>
    </SheetContent>
  </Sheet>
</template>
