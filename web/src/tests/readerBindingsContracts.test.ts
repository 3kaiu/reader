import { describe, expect, it } from 'vitest'
import { createReaderModalsBindings } from '@/components/reader/reader-modals-bindings'
import { createReaderScrollContentLoadStateBindings } from '@/components/reader/reader-scroll-content-load-state-bindings'
import { createReaderScrollLoadStateViewBindings } from '@/components/reader/reader-scroll-load-state-view-bindings'
import { createReaderNavigationViewBindings } from '@/components/reader/reader-navigation-view-bindings'
import { createReaderContentViewportViewBindings } from '@/components/reader/reader-content-viewport-view-bindings'
import { createReaderKeyboardHelpOverlayViewBindings } from '@/components/reader/reader-keyboard-help-overlay-view-bindings'
import { createReaderToolbarBottomBarPanelBindings } from '@/components/reader/toolbar-bottom-bar-panel-bindings'
import { createReaderToolbarTopBarBindings } from '@/components/reader/toolbar-top-bar-content-bindings'
import type { ReaderContentViewportEmits } from '@/components/reader/reader-content-viewport-emit-types'
import type { ReaderModalsEmitFn } from '@/components/reader/reader-modals-emit-types'
import type { ReaderModalsProps } from '@/components/reader/reader-modals-prop-types'
import type { ReaderNavigationEmitFn, ReaderNavigationProps } from '@/components/reader/reader-navigation-types'
import type { ReaderKeyboardHelpOverlayEmitFn } from '@/components/reader/reader-keyboard-help-overlay-emit-types'
import type { ReaderKeyboardHelpOverlayProps } from '@/components/reader/reader-keyboard-help-overlay-prop-types'
import type { ReaderScrollLoadStateEmitFn } from '@/components/reader/reader-scroll-load-state-emit-types'
import type { ReaderToolbarBottomBarEmitFn } from '@/components/reader/toolbar-bottom-bar-emit-types'
import type { ReaderToolbarBottomBarProps } from '@/components/reader/toolbar-bottom-bar-prop-types'
import type { ReaderToolbarTopBarEmitFn } from '@/components/reader/toolbar-top-bar-emit-types'
import type { ReaderToolbarTopBarProps } from '@/components/reader/toolbar-top-bar-prop-types'
import type { Book, Chapter } from '@/types/book'

describe('Reader Binding Contracts', () => {
  it('keeps bottom toolbar hidden in zen mode and wires action emits through panel bindings', () => {
    const events: Array<[string, unknown[]]> = []
    const emit: ReaderToolbarBottomBarEmitFn = (event, ...args) => {
      events.push([event, args])
    }

    const props: ReaderToolbarBottomBarProps = {
      show: true,
      zenMode: true,
      currentChapterIndex: 2,
      totalChapters: 8,
      hasPrevChapter: true,
      hasNextChapter: true,
      isNightMode: false,
      isEyeCareEnabled: true,
      contentIssue: 'missing_paragraphs',
    }

    const { isVisible, panelBindings } = createReaderToolbarBottomBarPanelBindings(props, emit)

    expect(isVisible.value).toBe(false)
    expect(panelBindings.value.readingProgress).toBe(37.5)
    expect(panelBindings.value.navigationProps.currentChapterIndex).toBe(2)
    expect(panelBindings.value.actionProps.contentIssue).toBe('missing_paragraphs')

    panelBindings.value.onNextChapter()
    panelBindings.value.onToggleSettings()
    panelBindings.value.onOpenBookInfo()

    expect(events).toEqual([
      ['nextChapter', []],
      ['toggleSettings', []],
      ['openBookInfo', []],
    ])
  })

  it('derives top toolbar visibility and routes top-bar actions', () => {
    const events: Array<[string, unknown[]]> = []
    const emit: ReaderToolbarTopBarEmitFn = (event, ...args) => {
      events.push([event, args])
    }

    const props: ReaderToolbarTopBarProps = {
      show: true,
      zenMode: false,
      bookName: 'Demo Book',
      chapterTitle: 'Chapter 3',
      isFullscreen: true,
    }

    const { isVisible, contentBindings } = createReaderToolbarTopBarBindings(props, emit)

    expect(isVisible.value).toBe(true)
    expect(contentBindings.value.bookName).toBe('Demo Book')
    expect(contentBindings.value.chapterTitle).toBe('Chapter 3')
    expect(contentBindings.value.isFullscreen).toBe(true)

    contentBindings.value.onBack()
    contentBindings.value.onToggleCatalog()
    contentBindings.value.onToggleFullscreen()

    expect(events).toEqual([
      ['back', []],
      ['toggleCatalog', []],
      ['toggleFullscreen', []],
    ])
  })

  it('derives navigation content bindings and routes prev/next actions', () => {
    const events: Array<[string, unknown[]]> = []
    const emit: ReaderNavigationEmitFn = (event, ...args) => {
      events.push([event, args])
    }

    const props: ReaderNavigationProps = {
      currentChapterIndex: 4,
      totalChapters: 10,
      hasPrevChapter: true,
      hasNextChapter: true,
    }

    const { contentBindings } = createReaderNavigationViewBindings(props, emit)

    expect(contentBindings.value.progressText).toBe('5 / 10')
    expect(contentBindings.value.progressPercent).toBe(50)
    expect(contentBindings.value.hasPrevChapter).toBe(true)
    expect(contentBindings.value.hasNextChapter).toBe(true)

    contentBindings.value.onPrev()
    contentBindings.value.onNext()

    expect(events).toEqual([
      ['prev', []],
      ['next', []],
    ])
  })

  it('maps modal state into the five panel bindings and preserves modal event routes', () => {
    const emitted: Array<[string, unknown[]]> = []
    const emit: ReaderModalsEmitFn = (event, ...args) => {
      emitted.push([event, args])
    }

    const book: Book = {
      sourceId: 'source-a',
      bookUrl: '/book/demo',
      name: 'Demo Book',
      author: 'Tester',
    }

    const chapters: Chapter[] = [
      { index: 0, title: 'Chapter 1', url: '/chapter/1' },
      { index: 1, title: 'Chapter 2', url: '/chapter/2' },
    ]

    const props: ReaderModalsProps = {
      showCatalog: true,
      showSettings: false,
      showSourcePicker: true,
      showBookInfo: true,
      showKeyboardHelp: false,
      book,
      chapters,
      currentInd: 1,
      catalogLoading: false,
      isCached: index => index === 0,
      isDownloading: true,
      downloadProgress: { current: 1, total: 2 },
      keyboardShortcuts: [{ key: 'J', desc: 'Next chapter' }],
    }

    const { panelsProps } = createReaderModalsBindings(props, emit)

    expect(panelsProps.chapterListBindings.value.open).toBe(true)
    expect(panelsProps.chapterListBindings.value.chapters).toEqual(chapters)
    expect(panelsProps.chapterListBindings.value.currentInd).toBe(1)
    expect(panelsProps.settingsBindings.value.open).toBe(false)
    expect(panelsProps.sourcePickerBindings.value.open).toBe(true)
    expect(panelsProps.bookInfoBindings.value.open).toBe(true)
    expect(panelsProps.bookInfoBindings.value.bookUrl).toBe('/book/demo')
    expect(panelsProps.keyboardHelpBindings.value.shortcuts).toEqual(props.keyboardShortcuts)

    panelsProps.chapterListBindings.value.onSelect(1)
    panelsProps.settingsBindings.value['onUpdate:open'](true)
    panelsProps.sourcePickerBindings.value['onUpdate:open'](false)
    panelsProps.bookInfoBindings.value['onUpdate:open'](false)
    panelsProps.keyboardHelpBindings.value['onUpdate:open'](true)

    expect(emitted).toEqual([
      ['select-chapter', [1]],
      ['update:showSettings', [true]],
      ['update:showSourcePicker', [false]],
      ['update:showBookInfo', [false]],
      ['update:showKeyboardHelp', [true]],
    ])
  })

  it('derives scroll load-state props from content state and exposes retry actions', () => {
    const props = {
      loadedChapters: [{ index: 0, title: 'Chapter 1', formattedContent: '<p>ok</p>' }],
      isParsing: false,
      isLoadingMore: false,
      hasNextChapter: true,
      loadError: '章节加载失败',
      loadErrorDetails: 'network_timeout',
    }

    const loadStateProps = createReaderScrollContentLoadStateBindings(props)

    expect(loadStateProps.value).toEqual({
      hasLoadedChapters: true,
      isParsing: false,
      isLoadingMore: false,
      hasNextChapter: true,
      loadError: '章节加载失败',
      loadErrorDetails: 'network_timeout',
    })

    const events: Array<[string, unknown[]]> = []
    const emit: ReaderScrollLoadStateEmitFn = (event, ...args) => {
      events.push([event, args])
    }
    const viewBindings = createReaderScrollLoadStateViewBindings(loadStateProps.value, emit)

    expect(viewBindings.initialLoadingProps.message).toBe('正在解析章节...')
    expect(viewBindings.loadingMoreProps.message).toBe('正在加载下一章...')
    expect(viewBindings.loadActionsBindings.value.loadError).toBe('章节加载失败')
    expect(viewBindings.loadActionsBindings.value.loadErrorDetails).toBe('network_timeout')

    viewBindings.loadActionsBindings.value.onLoadNextChapter()
    viewBindings.loadActionsBindings.value.onRetryLoad()

    expect(events).toEqual([
      ['loadNextChapter', []],
      ['retryLoad', []],
    ])
  })

  it('maps keyboard help overlay state and closes through update:open', () => {
    const events: Array<[string, unknown[]]> = []
    const emit: ReaderKeyboardHelpOverlayEmitFn = (event, ...args) => {
      events.push([event, args])
    }

    const props: ReaderKeyboardHelpOverlayProps = {
      open: true,
      shortcuts: [{ key: 'F', desc: 'Toggle fullscreen' }],
    }

    const { isOpen, dialogProps, onClose } = createReaderKeyboardHelpOverlayViewBindings(
      props,
      emit
    )

    expect(isOpen.value).toBe(true)
    expect(dialogProps.value.shortcutItems).toEqual(props.shortcuts)

    onClose()

    expect(events).toEqual([['update:open', [false]]])
  })

  it('shows fullscreen time only in fullscreen mode and routes viewport actions', () => {
    const events: Array<[string, unknown[]]> = []
    const emit = <EventName extends keyof ReaderContentViewportEmits>(
      event: EventName,
      ...args: ReaderContentViewportEmits[EventName]
    ) => {
      events.push([event, args as unknown[]])
    }

    const { showFullscreenTime, fullscreenTimeProps, onLoadNextChapter, onRetryLoad } =
      createReaderContentViewportViewBindings(
        {
          scrollContentProps: {
            contentStyle: {},
            loadedChapters: [],
            isParsing: false,
            isLoadingMore: false,
            hasNextChapter: true,
            paragraphSpacing: 1.8,
            loadError: null,
            loadErrorDetails: null,
            highlightContent: content => content ?? '',
            handleContentClick: () => {},
          },
          isFullscreen: true,
          formattedTime: '12:34',
        },
        emit
      )

    expect(showFullscreenTime.value).toBe(true)
    expect(fullscreenTimeProps.value.formattedTime).toBe('12:34')

    onLoadNextChapter()
    onRetryLoad()

    expect(events).toEqual([
      ['loadNextChapter', []],
      ['retryLoad', []],
    ])
  })
})
