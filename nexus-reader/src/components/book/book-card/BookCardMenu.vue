<script setup lang="ts">
import {
  MoreVertical,
  Trash2,
} from 'lucide-vue-next'

interface Props {
  manageMode: boolean
  showMenu: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'toggle-menu': []
  delete: [event: Event]
}>()
</script>

<template>
  <button
    v-if="!manageMode"
    class="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-xl
           flex items-center justify-center text-white/90
           opacity-0 group-hover:opacity-100 hover:bg-black/60 hover:scale-110 active:scale-90
           transition-all duration-300 z-20"
    aria-label="更多选项"
    @click.stop="emit('toggle-menu')"
  >
    <MoreVertical class="h-3.5 w-3.5" />
  </button>

  <div
    v-if="showMenu && !manageMode"
    class="absolute top-10 left-2 w-32 bg-popover/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-premium overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-300"
    @click.stop
  >
    <button
      class="flex items-center gap-3 px-4 py-3 text-[11px] font-semibold text-destructive hover:bg-destructive/10 active:bg-destructive/20 w-full transition-colors active:scale-95"
      @click="emit('delete', $event)"
    >
      <Trash2 class="h-4 w-4" />
      删除此书
    </button>
  </div>
</template>
