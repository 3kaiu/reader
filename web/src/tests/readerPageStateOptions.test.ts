import { computed, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createReaderViewPageStateOptions } from '@/composables/reader/view-model-page-state-options'

describe('Reader Page State Options', () => {
  it('uses loadError when top-level error is empty and preserves error details', () => {
    const services = {
      settingsStore: {
        config: {
          theme: ref('paper'),
        },
      },
      readerStore: {
        isLoading: ref(false),
        error: ref<string | null>(null),
        loadError: ref('章节内容为空，请重试或切换书源'),
        loadErrorDetails: ref('content_empty'),
      },
    } as any

    const features = {
      actions: {
        readerThemeStyle: computed(() => ({})),
      },
    } as any

    const options = createReaderViewPageStateOptions(services, features)

    expect(options.error.value).toBe('章节内容为空，请重试或切换书源')
    expect(options.errorDetails.value).toBe('content_empty')
  })
})
