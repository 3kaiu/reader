<script setup lang="ts">
import ReadSettingsTypographyOptionSection from '@/components/read-settings/ReadSettingsTypographyOptionSection.vue'
import ReadSettingsTypographySliderSection from '@/components/read-settings/ReadSettingsTypographySliderSection.vue'
import ReadSettingsTypographyWeightSection from '@/components/read-settings/ReadSettingsTypographyWeightSection.vue'
import type { ChineseConvert, FontFamily, ReaderConfig } from '@/types/settings'

interface FontOption {
  key: FontFamily
  label: string
}

interface ChineseOption {
  key: ChineseConvert
  label: string
}

interface Props {
  config: ReaderConfig
  fonts: FontOption[]
  chineseOptions: ChineseOption[]
  fontWeights: readonly number[]
  fontSizeValue: number[]
  lineHeightValue: number[]
  paragraphSpacingValue: number[]
  pageWidthValue: number[]
}

defineProps<Props>()

const emit = defineEmits<{
  'select-font-family': [fontFamily: FontFamily]
  'select-chinese-convert': [value: ChineseConvert]
  'update-font-size': [values: number[]]
  'decrease-font-size': []
  'increase-font-size': []
  'select-font-weight': [weight: number]
  'update-line-height': [values: number[]]
  'decrease-line-height': []
  'increase-line-height': []
  'update-paragraph-spacing': [values: number[]]
  'update-page-width': [values: number[]]
}>()

function handleSelectFontFamily(value: string) {
  emit('select-font-family', value as FontFamily)
}

function handleSelectChineseConvert(value: string) {
  emit('select-chinese-convert', value as ChineseConvert)
}
</script>

<template>
  <ReadSettingsTypographyOptionSection
    title="正文字体"
    :options="fonts"
    :selected-key="config.fontFamily"
    :aria-label-template="'切换到{label}字体'"
    @select="handleSelectFontFamily"
  />

  <ReadSettingsTypographyOptionSection
    title="简繁转换"
    :options="chineseOptions"
    :selected-key="config.chineseConvert"
    :aria-label-template="'{label}简繁转换'"
    :wrap="false"
    @select="handleSelectChineseConvert"
  />

  <ReadSettingsTypographySliderSection
    title="字号"
    :value-label="`${config.fontSize}px`"
    :model-value="fontSizeValue"
    :min="12"
    :max="32"
    :step="1"
    :show-stepper="true"
    @update:model-value="emit('update-font-size', $event)"
    @decrease="emit('decrease-font-size')"
    @increase="emit('increase-font-size')"
  />

  <ReadSettingsTypographyWeightSection
    :font-weights="fontWeights"
    :selected-weight="config.fontWeight"
    @select="emit('select-font-weight', $event)"
  />

  <ReadSettingsTypographySliderSection
    title="行高"
    :value-label="config.lineHeight.toFixed(1)"
    :model-value="lineHeightValue"
    :min="1.2"
    :max="3"
    :step="0.1"
    :show-stepper="true"
    @update:model-value="emit('update-line-height', $event)"
    @decrease="emit('decrease-line-height')"
    @increase="emit('increase-line-height')"
  />

  <ReadSettingsTypographySliderSection
    title="段落间距"
    :value-label="`${config.paragraphSpacing.toFixed(1)}em`"
    :model-value="paragraphSpacingValue"
    :min="0.5"
    :max="3"
    :step="0.1"
    @update:model-value="emit('update-paragraph-spacing', $event)"
  />

  <ReadSettingsTypographySliderSection
    title="页面宽度"
    :value-label="`${config.pageWidth}px`"
    :model-value="pageWidthValue"
    :min="400"
    :max="1200"
    :step="50"
    @update:model-value="emit('update-page-width', $event)"
  />
</template>
