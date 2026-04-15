<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { LazyImage } from '@/components/ui'
import type { DiscoveryItem } from '@/types/discovery'

defineProps<{
  items: DiscoveryItem[]
}>()

const emit = defineEmits<{
  open: [item: DiscoveryItem]
}>()
</script>

<template>
  <section v-if="items.length" class="relative group">
    <div class="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4 pb-2">
      <div
        v-for="book in items"
        :key="book.bookId"
        class="flex-none w-[85vw] sm:w-[60vw] md:w-[45vw] lg:w-[35vw] snap-center"
        @click="emit('open', book)"
      >
        <div
          class="relative aspect-[16/9] rounded-3xl overflow-hidden cursor-pointer group/card shadow-lg hover:shadow-2xl transition-all duration-500"
        >
          <LazyImage
            v-if="book.coverUrl"
            :src="book.coverUrl"
            :alt="book.name"
            aspect-ratio="16/9"
            class="w-full h-full transition-transform duration-700 group-hover/card:scale-110"
          />
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-6"
          >
            <Badge
              class="w-fit mb-3 bg-primary/20 backdrop-blur-md text-primary-foreground border-none text-[10px]"
            >
              小编精选
            </Badge>
            <h2 class="text-xl sm:text-2xl font-bold text-white mb-1 line-clamp-1">
              {{ book.name }}
            </h2>
            <p v-if="book.intro" class="text-white/70 text-sm line-clamp-2 max-w-[90%]">
              {{ book.intro }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
