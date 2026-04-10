import { createReaderExperienceBindings } from '@/composables/reader/experience-bindings'
import type { ReaderExperienceProps } from './reader-experience-prop-types'
import { createReaderExperienceLayoutBindings } from './reader-experience-layout-bindings'
import type { ReaderExperienceLayoutProps } from './reader-experience-layout-prop-types'
import { createReaderExperienceSectionBindings } from './reader-experience-section-bindings'

export function createReaderExperienceComponentBindings(props: ReaderExperienceProps) {
  const sectionBindings = createReaderExperienceSectionBindings(
    props,
    createReaderExperienceBindings(props)
  )

  const layoutProps: ReaderExperienceLayoutProps = createReaderExperienceLayoutBindings({
    ...sectionBindings,
    contentRef: props.actions.bindContentRef,
  })

  return {
    layoutProps,
  }
}
