import { ref } from 'vue'
import type { Ref } from 'vue'

export interface ReaderChromeState {
  showToolbar: Ref<boolean>
  showCatalog: Ref<boolean>
  showSettings: Ref<boolean>
  showSourcePicker: Ref<boolean>
  showBookInfo: Ref<boolean>
  showKeyboardHelp: Ref<boolean>
  showDecoderSettings: Ref<boolean>
  hideToolbarTimer: Ref<ReturnType<typeof setTimeout> | null>
}

export function createReaderChromeState(): ReaderChromeState {
  return {
    showToolbar: ref(false),
    showCatalog: ref(false),
    showSettings: ref(false),
    showSourcePicker: ref(false),
    showBookInfo: ref(false),
    showKeyboardHelp: ref(false),
    showDecoderSettings: ref(false),
    hideToolbarTimer: ref(null),
  }
}
