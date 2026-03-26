import type { ReaderPageModelChromeOptions } from './page-model-chrome-options'
import type {
  ReaderPageModelExperienceOptions,
} from './page-model-experience-options'
import type { ReaderPageModelStateOptions } from './page-model-state-options'

export type ReaderPageModelOptions =
  ReaderPageModelStateOptions &
  ReaderPageModelChromeOptions &
  ReaderPageModelExperienceOptions
