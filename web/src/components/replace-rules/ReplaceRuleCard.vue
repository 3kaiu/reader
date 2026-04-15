<script setup lang="ts">
import { Edit2, Trash2, Wand2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import type { ReplaceRule } from '@/types/replace'

defineProps<{
  rule: ReplaceRule
  isManageMode: boolean
  isSelected: boolean
}>()

const emit = defineEmits<{
  toggleSelect: [rule: ReplaceRule]
  openEdit: [rule?: ReplaceRule]
  deleteRule: [rule: ReplaceRule]
  toggleEnabled: [rule: ReplaceRule, enabled: boolean]
}>()
</script>

<template>
  <div
    class="group relative bg-card hover:bg-muted/50 rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden"
    :class="{
      'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/50':
        isSelected && isManageMode,
      'border-border/50 hover:border-border hover:shadow-md': !isSelected,
      'opacity-50': !rule.isEnabled && !isManageMode,
    }"
    @click="isManageMode ? emit('toggleSelect', rule) : emit('openEdit', rule)"
  >
    <div class="p-4 h-full flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0 flex-1">
          <div class="shrink-0 relative mt-0.5">
            <div
              v-if="isManageMode"
              class="w-5 h-5 flex items-center justify-center"
              @click.stop="emit('toggleSelect', rule)"
            >
              <Checkbox
                :checked="isSelected"
                @update:checked="emit('toggleSelect', rule)"
                @click.stop
                class="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
            </div>
            <div
              v-else
              class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              :class="
                rule.isEnabled
                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                  : 'bg-muted/50 text-muted-foreground'
              "
            >
              <Wand2 class="h-4 w-4" />
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-sm leading-tight mb-1 text-foreground line-clamp-2">
              {{ rule.name }}
            </h3>
            <div class="flex items-center gap-1.5 flex-wrap">
              <Badge
                v-if="rule.group"
                variant="secondary"
                class="rounded-md px-2 py-0.5 text-xs bg-secondary/60 text-muted-foreground font-normal truncate max-w-[100px]"
              >
                {{ rule.group }}
              </Badge>
              <span class="text-xs text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
                {{ rule.scope || '全局' }}
              </span>
              <Badge
                v-if="rule.isRegex"
                variant="outline"
                class="rounded-md px-1.5 py-0.5 text-[10px] border-blue-500/20 text-blue-600 dark:text-blue-400 bg-blue-500/10"
              >
                正则
              </Badge>
            </div>
          </div>
        </div>

        <div
          v-if="!isManageMode"
          class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <button
            class="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            @click.stop="emit('openEdit', rule)"
            title="编辑"
            aria-label="编辑"
          >
            <Edit2 class="h-3.5 w-3.5" />
          </button>
          <button
            class="w-7 h-7 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition-colors"
            @click.stop="emit('deleteRule', rule)"
            title="删除"
            aria-label="删除"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div class="flex-1 space-y-2 pt-2 border-t border-border/40 min-h-[60px]">
        <div class="flex items-center gap-2 text-xs">
          <code
            class="flex-1 bg-muted/80 px-2 py-1.5 rounded text-[10px] truncate font-mono text-foreground/80"
            :title="rule.pattern"
          >
            {{ rule.pattern }}
          </code>
          <span class="text-muted-foreground/60 shrink-0">→</span>
          <code
            class="flex-1 bg-muted/80 px-2 py-1.5 rounded text-[10px] truncate font-mono text-foreground/80"
            :title="rule.replacement || '删除'"
          >
            {{ rule.replacement || '删除' }}
          </code>
        </div>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-border/40">
        <div class="text-xs text-muted-foreground/60">
          {{ rule.isEnabled ? '已启用' : '已禁用' }}
        </div>

        <Switch
          v-if="!isManageMode"
          :checked="rule.isEnabled"
          @update:checked="(enabled: boolean) => emit('toggleEnabled', rule, enabled)"
          @click.stop
          class="data-[state=checked]:bg-primary"
        />
      </div>
    </div>
  </div>
</template>
