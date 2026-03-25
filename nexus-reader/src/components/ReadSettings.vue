<script setup lang="ts">
/**
 * 阅读设置组件 - shadcn 风格
 */
import { useReadSettingsView } from '@/composables/useReadSettingsView'
import ReadSettingsBehaviorSection from '@/components/read-settings/ReadSettingsBehaviorSection.vue'
import ReadSettingsThemeSection from '@/components/read-settings/ReadSettingsThemeSection.vue'
import ReadSettingsTypographySection from '@/components/read-settings/ReadSettingsTypographySection.vue'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Settings, RotateCcw } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const {
  settingsStore,
  themes,
  fonts,
  chineseOptions,
  fontWeights,
  isCustomTheme,
  customThemeBackground,
  customThemeText,
  fontSizeValue,
  lineHeightValue,
  paragraphSpacingValue,
  pageWidthValue,
  resetConfig,
  selectTheme,
  updateCustomBackground,
  updateCustomText,
  selectFontFamily,
  selectChineseConvert,
  updateFontSize,
  selectFontWeight,
  updateLineHeight,
  updateParagraphSpacing,
  updatePageWidth,
  toggleAutoNightMode,
} = useReadSettingsView()
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="w-[380px] sm:w-[420px] overflow-y-auto">
      <SheetHeader class="mb-6">
        <div class="flex items-center justify-between">
          <SheetTitle class="flex items-center gap-2">
            <Settings class="h-5 w-5" />
            阅读设置
          </SheetTitle>
          <Button variant="ghost" size="sm" @click="resetConfig">
            <RotateCcw class="h-4 w-4 mr-1" />
            重置
          </Button>
        </div>
      </SheetHeader>

      <div class="space-y-8">
        <ReadSettingsThemeSection
          :current-theme="settingsStore.config.theme"
          :themes="themes"
          :is-custom-theme="isCustomTheme"
          :custom-theme-background="customThemeBackground"
          :custom-theme-text="customThemeText"
          @select-theme="selectTheme"
          @update-custom-background="updateCustomBackground"
          @update-custom-text="updateCustomText"
        />

        <ReadSettingsTypographySection
          :config="settingsStore.config"
          :fonts="fonts"
          :chinese-options="chineseOptions"
          :font-weights="fontWeights"
          :font-size-value="fontSizeValue"
          :line-height-value="lineHeightValue"
          :paragraph-spacing-value="paragraphSpacingValue"
          :page-width-value="pageWidthValue"
          @select-font-family="selectFontFamily"
          @select-chinese-convert="selectChineseConvert"
          @update-font-size="updateFontSize"
          @decrease-font-size="settingsStore.decreaseFontSize()"
          @increase-font-size="settingsStore.increaseFontSize()"
          @select-font-weight="selectFontWeight"
          @update-line-height="updateLineHeight"
          @decrease-line-height="settingsStore.decreaseLineHeight()"
          @increase-line-height="settingsStore.increaseLineHeight()"
          @update-paragraph-spacing="updateParagraphSpacing"
          @update-page-width="updatePageWidth"
        />

        <ReadSettingsBehaviorSection
          :config="settingsStore.config"
          @toggle-auto-night-mode="toggleAutoNightMode"
        />
      </div>
    </SheetContent>
  </Sheet>
</template>
