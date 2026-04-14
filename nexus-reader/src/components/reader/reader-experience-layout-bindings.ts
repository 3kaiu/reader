import type { ReaderExperienceLayoutBindingOptions } from './reader-experience-layout-binding-types'

export function createReaderExperienceLayoutBindings(
  options: ReaderExperienceLayoutBindingOptions
): ReaderExperienceLayoutBindingOptions {
  return {
    toolbarBindings: options.toolbarBindings,
    contentBindings: options.contentBindings,
    modalBindings: options.modalBindings,
    contentRef: options.contentRef,
  }
}
