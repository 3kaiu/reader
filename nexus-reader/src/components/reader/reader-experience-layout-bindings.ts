import type {
  ReaderExperienceLayoutBindingOptions,
  ReaderExperienceLayoutProps,
} from './reader-experience-layout-binding-types'

export function createReaderExperienceLayoutBindings(
  options: ReaderExperienceLayoutBindingOptions
): ReaderExperienceLayoutProps {
  return {
    toolbarBindings: options.toolbarBindings,
    contentBindings: options.contentBindings,
    modalBindings: options.modalBindings,
    contentRef: options.contentRef,
  }
}
