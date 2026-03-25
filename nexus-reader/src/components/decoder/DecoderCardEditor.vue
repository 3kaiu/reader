<script setup lang="ts">
defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
  cancel: [];
}>();

function handleInput(event: Event) {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="mt-3 pt-3 border-t border-border">
    <div class="text-xs text-muted-foreground mb-2">输入正确的指代:</div>
    <div class="flex gap-2">
      <input
        :value="modelValue"
        type="text"
        class="flex-1 px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="输入正确答案"
        @input="handleInput"
        @keyup.enter="emit('submit')"
        @keyup.escape="emit('cancel')"
      />
      <button
        class="px-2 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 transition-colors"
        @click="emit('submit')"
      >
        确定
      </button>
    </div>
    <button
      class="mt-2 text-xs text-muted-foreground hover:text-foreground"
      @click="emit('cancel')"
    >
      取消
    </button>
  </div>
</template>
