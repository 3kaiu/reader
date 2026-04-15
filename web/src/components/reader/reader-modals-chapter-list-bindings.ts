import { computed } from 'vue'
import type { ReaderModalsEmitFn } from './reader-modals-emit-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export function createReaderChapterListModalBindings(
  props: ReaderModalsProps,
  emit: ReaderModalsEmitFn
) {
  return computed(() => ({
    open: props.showCatalog,
    chapters: props.chapters ?? [],
    currentInd: props.currentInd ?? -1,
    loading: props.catalogLoading,
    bookName: props.book?.name,
    isCached: props.isCached,
    isDownloading: props.isDownloading,
    downloadProgress: props.downloadProgress,
    'onUpdate:open': (value: boolean) => emit('update:showCatalog', value),
    onSelect: (index: number) => emit('select-chapter', index),
    onRefresh: () => emit('refresh'),
    onDownloadAll: () => emit('download-all'),
  }))
}
