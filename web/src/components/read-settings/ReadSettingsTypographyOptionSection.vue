<script setup lang="ts">
interface Props {
  title: string
  options: Array<{
    key: string
    label: string
  }>
  selectedKey: string
  ariaLabelTemplate: string
  wrap?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  wrap: true,
})

const emit = defineEmits<{
  select: [key: string]
}>()

function getAriaLabel(label: string) {
  return props.ariaLabelTemplate.replace('{label}', label)
}
</script>

<template>
  <section>
    <h3 class="text-sm font-medium mb-3">{{ title }}</h3>
    <div class="flex gap-2" :class="wrap ? 'flex-wrap' : ''">
      <button
        v-for="option in options"
        :key="option.key"
        class="px-4 py-2 rounded-lg border transition-all text-sm active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        :class="
          selectedKey === option.key
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border hover:border-primary/50'
        "
        :aria-label="getAriaLabel(option.label)"
        :aria-pressed="selectedKey === option.key"
        @click="emit('select', option.key)"
      >
        {{ option.label }}
      </button>
    </div>
  </section>
</template>
