<script setup lang="ts">
import { Search } from "lucide-vue-next";
import { Button } from "@/components/ui/button";

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-32 space-y-4 opacity-50">
    <Search class="h-16 w-16 stroke-1" />
    <p class="text-lg font-medium">暂无发现数据</p>
    <Button variant="outline" @click="emit('retry')">重试</Button>
  </div>
</template>
