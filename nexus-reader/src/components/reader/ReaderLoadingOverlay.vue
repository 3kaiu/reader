<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-md"
  >
    <div class="flex flex-col items-center gap-6">
      <Loader2 class="w-16 h-16 text-primary/10 animate-spin" />
      <p class="text-xs font-medium tracking-widest text-primary/40 uppercase">
        Loading Content
      </p>
    </div>
  </div>
</template>
