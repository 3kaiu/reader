<script setup lang="ts">
import { ref } from "vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderHeart, Check } from "lucide-vue-next";
import type { BookGroup } from "@/api";

const props = defineProps<{
  open: boolean;
  groups: BookGroup[];
  selectedCount: number;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm", groupId: string | null): void;
}>();

const selectedId = ref<string | null>(null);

function handleConfirm() {
  emit("confirm", selectedId.value);
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md bg-card border-none shadow-2xl rounded-3xl p-0 overflow-hidden">
      <DialogHeader class="p-6 pb-2">
        <DialogTitle class="flex items-center gap-3 text-xl font-bold">
          <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FolderHeart class="h-5 w-5 text-primary" />
          </div>
          移动到分组
        </DialogTitle>
      </DialogHeader>

      <div class="px-6 py-2">
        <p class="text-sm text-muted-foreground mb-4">
          将选中的 {{ selectedCount }} 本书籍移动至...
        </p>

        <ScrollArea class="h-64 pr-4 -mr-4">
          <div class="space-y-2 pb-4">
            <!-- 未分组选项 -->
            <button
              class="w-full flex items-center justify-between p-4 rounded-2xl transition-all border-2"
              :class="selectedId === null ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/30 hover:bg-muted/50'"
              @click="selectedId = null"
            >
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                  <FolderHeart class="h-4 w-4 text-muted-foreground/40" />
                </div>
                <span class="font-medium text-sm">不设置分组</span>
              </div>
              <Check v-if="selectedId === null" class="h-4 w-4 text-primary" />
            </button>

            <!-- 已有分组列表 -->
            <button
              v-for="group in groups"
              :key="group.groupId"
              class="w-full flex items-center justify-between p-4 rounded-2xl transition-all border-2"
              :class="selectedId === group.groupId ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/30 hover:bg-muted/50'"
              @click="selectedId = group.groupId as string"
            >
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                  <FolderHeart class="h-4 w-4 text-primary/60" />
                </div>
                <span class="font-medium text-sm">{{ group.groupName }}</span>
              </div>
              <Check v-if="selectedId === group.groupId" class="h-4 w-4 text-primary" />
            </button>
          </div>
        </ScrollArea>
      </div>

      <DialogFooter class="p-6 pt-2 gap-3 sm:gap-0">
        <Button variant="ghost" class="rounded-full px-8" @click="$emit('update:open', false)">
          取消
        </Button>
        <Button class="rounded-full px-8" @click="handleConfirm">
          确定移动
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
