import type { Ref } from 'vue'
import type { ReaderExperienceActions } from './experience-action-types'
import type { ReaderThemeStyle } from './shared-types'

export type ReaderPageModelOptions = {
  readerThemeStyle: Readonly<Ref<ReaderThemeStyle>>
  currentTheme: Readonly<Ref<string>>
  isLoading: Readonly<Ref<boolean>>
  error: Readonly<Ref<string | null | undefined>>
  toggleToolbar: () => void
  toggleCatalog: () => void
  toggleSettings: () => void
  toggleKeyboardHelp: () => void
  handleEscape: () => void
  openSourcePicker: () => void
  readerExperienceActions: ReaderExperienceActions
}
