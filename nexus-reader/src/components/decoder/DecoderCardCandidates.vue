<script setup lang="ts">
import { ChevronDown, ChevronUp } from "lucide-vue-next";
import { DECODER_CATEGORY_CONFIG } from "@/constants/decoderDictionary";
import type { Candidate, DecodedEntity } from "@/types/decoder";

defineProps<{
  entity: DecodedEntity;
  displayCandidates: Candidate[];
  showAllCandidates: boolean;
  hasMoreCandidates: boolean;
  getConfidenceColor: (confidence: number) => string;
  getConfidenceBg: (confidence: number) => string;
}>();

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(candidate, index) in displayCandidates"
      :key="index"
      class="p-3 rounded-lg"
      :class="[
        index === 0 ? getConfidenceBg(candidate.confidence) : 'bg-muted/50',
      ]"
    >
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <component
            :is="DECODER_CATEGORY_CONFIG[candidate.category].icon"
            class="w-4 h-4 opacity-60"
          />
          <span class="font-medium">{{ candidate.real }}</span>
        </div>
        <span
          class="text-sm font-mono"
          :class="getConfidenceColor(candidate.confidence)"
        >
          {{ candidate.confidence }}%
        </span>
      </div>

      <div class="text-xs text-muted-foreground mb-1">
        {{ DECODER_CATEGORY_CONFIG[candidate.category].label }}
      </div>

      <div v-if="candidate.reasoning" class="text-xs text-muted-foreground">
        {{ candidate.reasoning }}
      </div>

      <div v-if="candidate.evidence?.length" class="mt-2">
        <div class="text-xs text-muted-foreground mb-1">证据:</div>
        <ul class="text-xs text-muted-foreground list-disc list-inside">
          <li v-for="(ev, i) in candidate.evidence" :key="i">{{ ev }}</li>
        </ul>
      </div>
    </div>
  </div>

  <button
    v-if="hasMoreCandidates"
    class="w-full mt-2 py-1 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors"
    @click="emit('toggle')"
  >
    <template v-if="showAllCandidates">
      <ChevronUp class="w-3 h-3" />
      收起
    </template>
    <template v-else>
      <ChevronDown class="w-3 h-3" />
      查看其他 {{ entity.candidates.length - 1 }} 个候选
    </template>
  </button>
</template>
