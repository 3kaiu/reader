<script setup lang="ts">
interface ValidationStepSummaryItem {
  step: string
  ok: boolean
  summary: string
  failureCode?: string | null
  qualityScore?: string | number | null
  warnings?: string[]
  errors?: string[]
  suggestedActions?: string[]
}

const validateSearchQuery = defineModel<string>('validateSearchQuery', { required: true })
const validateBookUrl = defineModel<string>('validateBookUrl', { required: true })
const validateTocUrl = defineModel<string>('validateTocUrl', { required: true })
const validateChapterUrl = defineModel<string>('validateChapterUrl', { required: true })

const props = defineProps<{
  validationLoading: boolean
  hasCurrentPackage: boolean
  validationStepSummary: ValidationStepSummaryItem[]
  fetchDebugSummary: string[]
  validationReport: unknown
}>()

const emit = defineEmits<{
  validateCurrentPackage: []
}>()
</script>

<template>
  <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
    <div class="p-5 border-b border-border/50">
      <p class="text-sm font-medium">Validate Package</p>
    </div>
    <div class="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <input
        v-model="validateSearchQuery"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="search query"
      />
      <input
        v-model="validateBookUrl"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="book url"
      />
      <input
        v-model="validateTocUrl"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="toc url"
      />
      <input
        v-model="validateChapterUrl"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="chapter url"
      />
    </div>
    <div class="px-5 pb-5 flex justify-end">
      <button
        class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        :disabled="props.validationLoading || !props.hasCurrentPackage"
        @click="emit('validateCurrentPackage')"
      >
        {{ props.validationLoading ? '验证中...' : '验证当前包' }}
      </button>
    </div>
    <div v-if="props.validationStepSummary.length > 0" class="px-5 pb-5">
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div
          v-for="step in props.validationStepSummary"
          :key="step.step"
          class="rounded-xl border border-border/50 bg-muted/20 p-4"
        >
          <p class="text-sm font-medium">{{ step.step }} · {{ step.ok ? '通过' : '失败' }}</p>
          <p class="text-xs text-muted-foreground mt-1">{{ step.summary }}</p>
          <p v-if="step.failureCode" class="text-xs text-muted-foreground mt-1">
            failure={{ step.failureCode }}
          </p>
          <p v-if="step.qualityScore != null" class="text-xs text-muted-foreground mt-1">
            quality={{ step.qualityScore }}
          </p>
          <ul
            v-if="step.warnings?.length"
            class="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300"
          >
            <li v-for="item in step.warnings" :key="item">{{ item }}</li>
          </ul>
          <ul
            v-if="step.errors?.length"
            class="mt-2 space-y-1 text-xs text-red-700 dark:text-red-300"
          >
            <li v-for="item in step.errors" :key="item">{{ item }}</li>
          </ul>
          <ul
            v-if="step.suggestedActions?.length"
            class="mt-2 space-y-1 text-xs text-muted-foreground"
          >
            <li v-for="item in step.suggestedActions" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
    </div>
    <div v-if="props.fetchDebugSummary.length > 0" class="px-5 pb-5">
      <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
        <p class="text-xs text-muted-foreground mb-2">Fetch Debug</p>
        <ul class="space-y-1 text-xs break-all">
          <li v-for="item in props.fetchDebugSummary" :key="item">{{ item }}</li>
        </ul>
      </div>
    </div>
    <div v-if="props.validationReport" class="px-5 pb-5">
      <pre
        class="w-full overflow-auto rounded-xl border border-border/50 bg-background p-4 text-xs"
        >{{ JSON.stringify(props.validationReport, null, 2) }}</pre
      >
    </div>
  </section>
</template>
