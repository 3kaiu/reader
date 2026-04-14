import { createReaderExperienceBindings } from '@/composables/reader/experience-bindings'
import { createReaderExperienceLayoutBindings } from './reader-experience-layout-bindings'
import type { ReaderExperienceBindingProps } from '@/composables/reader/experience-binding-prop-types'
import type { ReaderExperienceLayoutBindingOptions } from './reader-experience-layout-binding-types'
import { createReaderExperienceSectionBindings } from './reader-experience-section-bindings'

export function createReaderExperienceComponentBindings(props: ReaderExperienceBindingProps) {
  const sectionBindings = createReaderExperienceSectionBindings(
    props,
    createReaderExperienceBindings(props)
  )

  const layoutProps: ReaderExperienceLayoutBindingOptions = createReaderExperienceLayoutBindings({
    ...sectionBindings,
    contentRef: props.actions.bindContentRef,
  })

  return {
    layoutProps,
  }
}
