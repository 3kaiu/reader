import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { ApiResponse } from "@/api/http/types";
import { readerApi } from "@/api/reader";
import type { Chapter } from "@/types/book";
import { isSameReaderRouteTarget } from "@/utils/readerRoute";
import {
  createLoadedChapter,
  formatReaderContent,
  loadPersistedReaderProgress,
  mergeLoadedChapters,
  normalizeReaderCatalog,
  resolveInitialChapterIndex,
  savePersistedReaderProgress,
  type ReaderBook,
  type ReaderLoadedChapter as LoadedChapter,
} from "@/utils/readerStore";

export const useReaderStore = defineStore("reader", () => {
  const currentBook = ref<ReaderBook | null>(null);
  const currentChapter = ref<Chapter | null>(null);
  const currentChapterIndex = ref(0);
  const content = ref("");
  const formattedContent = ref("");
  const catalog = ref<Chapter[]>([]);
  const loadedChapters = ref<LoadedChapter[]>([]);
  const isLoading = ref(false);
  const isLoadingMore = ref(false);
  const isParsing = ref(false);
  const error = ref<string | null>(null);
  const loadError = ref<string | null>(null);
  const progressMap = ref<Record<string, number>>(loadPersistedReaderProgress());
  const chapterContentCache = ref<Record<string, string>>({});

  const totalChapters = computed(() => catalog.value.length);
  const hasPrevChapter = computed(() => currentChapterIndex.value > 0);
  const hasNextChapter = computed(
    () => currentChapterIndex.value < catalog.value.length - 1,
  );

  const cacheChapterContent = (chapterUrl: string, chapterContent: string) => {
    chapterContentCache.value = {
      ...chapterContentCache.value,
      [chapterUrl]: chapterContent,
    };
  };

  const getCachedChapterContent = (chapterUrl: string) =>
    chapterContentCache.value[chapterUrl];

  const fetchBookInfo = async (
    sourceId: string,
    bookUrl: string,
  ): Promise<ApiResponse<ReaderBook>> => {
    const response = await readerApi.getBookInfo(sourceId, bookUrl);

    if (!response.isSuccess || !response.data) {
      return response as ApiResponse<ReaderBook>;
    }

    return {
      ...response,
      data: {
        ...response.data,
        sourceId,
        bookUrl,
      },
    };
  };

  const isCurrentBookTarget = (target: {
    sourceId: string;
    bookUrl: string;
  }) =>
    Boolean(
      currentBook.value &&
        isSameReaderRouteTarget(currentBook.value, target),
    );

  const hasActiveSession = (target: {
    sourceId: string;
    bookUrl: string;
  }) =>
    isCurrentBookTarget(target) &&
    catalog.value.length > 0 &&
    currentChapter.value !== null;

  const ensureReaderSession = async (book: ReaderBook) => {
    if (hasActiveSession(book) && currentBook.value) {
      return currentBook.value;
    }

    await openBook(book);
    return currentBook.value || book;
  };

  const startReaderSession = async (
    sourceId: string,
    bookUrl: string,
  ): Promise<ApiResponse<ReaderBook>> => {
    const target = { sourceId, bookUrl };

    if (hasActiveSession(target) && currentBook.value) {
      return {
        isSuccess: true,
        data: currentBook.value,
      };
    }

    if (isCurrentBookTarget(target) && currentBook.value) {
      const book = await ensureReaderSession(currentBook.value);
      return {
        isSuccess: true,
        data: book,
      };
    }

    const response = await fetchBookInfo(sourceId, bookUrl);

    if (!response.isSuccess || !response.data) {
      return response;
    }

    const book = await ensureReaderSession(response.data);
    return {
      ...response,
      data: book,
    };
  };

  const ensureCatalog = async () => {
    if (!currentBook.value) {
      throw new Error("缺少书籍信息");
    }

    if (catalog.value.length > 0) {
      return catalog.value;
    }

    const res = await readerApi.getChapters(
      currentBook.value.sourceId,
      currentBook.value.bookUrl,
    );

    if (!res.isSuccess || !Array.isArray(res.data)) {
      throw new Error(res.errorMsg || "获取目录失败");
    }

    catalog.value = normalizeReaderCatalog(res.data);

    return catalog.value;
  };

  const setCurrentChapterContent = (chapter: Chapter, chapterContent: string) => {
    currentChapter.value = chapter;
    content.value = chapterContent;
    isParsing.value = true;
    formattedContent.value = formatReaderContent(chapterContent);
    isParsing.value = false;
  };

  const updateLoadedChapter = (
    chapter: Chapter,
    chapterContent: string,
    replaceOnly = false,
  ) => {
    loadedChapters.value = mergeLoadedChapters(
      loadedChapters.value,
      createLoadedChapter(chapter, chapterContent),
      replaceOnly,
    );
  };

  const fetchChapterContent = async (chapter: Chapter): Promise<string> => {
    const cached = getCachedChapterContent(chapter.url);
    if (typeof cached === "string") {
      return cached;
    }

    if (!currentBook.value) {
      throw new Error("缺少书籍信息");
    }

    const res = await readerApi.getContent(
      currentBook.value.sourceId,
      chapter.url,
      currentBook.value.bookUrl,
    );

    if (!res.isSuccess) {
      throw new Error(res.errorMsg || "获取正文失败");
    }

    const chapterContent = res.data?.content || "";
    cacheChapterContent(chapter.url, chapterContent);
    return chapterContent;
  };

  const loadChapterAt = async (
    index: number,
    options: { replaceLoaded?: boolean } = {},
  ) => {
    const chapters = await ensureCatalog();
    const target = chapters[index];

    if (!target) {
      throw new Error("章节不存在");
    }

    const chapterContent = await fetchChapterContent(target);
    currentChapterIndex.value = index;
    setCurrentChapterContent(target, chapterContent);
    updateLoadedChapter(target, chapterContent, options.replaceLoaded ?? true);
    loadError.value = null;
  };

  const openBook = async (book: ReaderBook) => {
    isLoading.value = true;
    error.value = null;
    loadError.value = null;

    try {
      currentBook.value = {
        ...book,
        sourceId: book.sourceId,
        bookUrl: book.bookUrl,
      };
      catalog.value = [];
      loadedChapters.value = [];
      chapterContentCache.value = {};

      await ensureCatalog();

      const initialIndex = resolveInitialChapterIndex({
        catalogLength: catalog.value.length,
        persistedIndex: progressMap.value[book.bookUrl],
        bookLastChapterIndex: book.lastChapterIndex,
        bookDurChapterIndex: book.durChapterIndex,
      });

      await loadChapterAt(initialIndex, { replaceLoaded: true });
    } catch (err) {
      error.value = err instanceof Error ? err.message : "打开书籍失败";
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const goToChapter = async (index: number) => {
    isLoading.value = true;
    error.value = null;
    try {
      await loadChapterAt(index, { replaceLoaded: true });
    } catch (err) {
      error.value = err instanceof Error ? err.message : "跳转章节失败";
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const goToChapterInScroll = async (index: number) => {
    await goToChapter(index);
  };

  const nextChapter = async () => {
    if (!hasNextChapter.value) {
      return;
    }
    await goToChapter(currentChapterIndex.value + 1);
  };

  const prevChapter = async () => {
    if (!hasPrevChapter.value) {
      return;
    }
    await goToChapter(currentChapterIndex.value - 1);
  };

  const appendNextChapter = async (): Promise<boolean> => {
    if (!hasNextChapter.value || !catalog.value[currentChapterIndex.value + 1]) {
      return false;
    }

    isLoadingMore.value = true;
    loadError.value = null;

    try {
      const next = catalog.value[currentChapterIndex.value + 1];
      const chapterContent = await fetchChapterContent(next);
      updateLoadedChapter(next, chapterContent, false);
      return true;
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : "加载下一章失败";
      return false;
    } finally {
      isLoadingMore.value = false;
    }
  };

  const retryLoadNext = async () => {
    loadError.value = null;
    return await appendNextChapter();
  };

  const refreshChapter = async (): Promise<number> => {
    if (!currentChapter.value) {
      return 0;
    }

    const scrollRatio =
      typeof window !== "undefined" && document.documentElement.scrollHeight > window.innerHeight
        ? window.scrollY /
          Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)
        : 0;

    const chapterContent = await fetchChapterContent(currentChapter.value);
    setCurrentChapterContent(currentChapter.value, chapterContent);
    updateLoadedChapter(currentChapter.value, chapterContent, false);
    return scrollRatio;
  };

  const reloadCurrentChapter = async () => {
    await refreshChapter();
  };

  const updateChapterIndexByScroll = () => {
    if (loadedChapters.value.length === 0 || typeof document === "undefined") {
      return;
    }

    const chapterMarkers = Array.from(
      document.querySelectorAll<HTMLElement>("[data-chapter-index]"),
    );

    const currentMarker = chapterMarkers.find((marker) => {
      const rect = marker.getBoundingClientRect();
      return rect.top <= window.innerHeight * 0.35 && rect.bottom >= 0;
    });

    if (!currentMarker) {
      return;
    }

    const markerIndex = Number(currentMarker.dataset.chapterIndex);
    if (!Number.isNaN(markerIndex)) {
      currentChapterIndex.value = markerIndex;
      currentChapter.value = catalog.value[markerIndex] || currentChapter.value;
    }
  };

  const saveProgress = () => {
    if (!currentBook.value) {
      return;
    }

    progressMap.value = {
      ...progressMap.value,
      [currentBook.value.bookUrl]: currentChapterIndex.value,
    };
    savePersistedReaderProgress(progressMap.value);
  };

  const disposeReader = () => {
    saveProgress();
    reset();
  };

  const reset = () => {
    currentBook.value = null;
    currentChapter.value = null;
    currentChapterIndex.value = 0;
    content.value = "";
    formattedContent.value = "";
    catalog.value = [];
    loadedChapters.value = [];
    isLoading.value = false;
    isLoadingMore.value = false;
    isParsing.value = false;
    error.value = null;
    loadError.value = null;
    chapterContentCache.value = {};
  };

  return {
    currentBook,
    currentChapter,
    currentChapterIndex,
    content,
    formattedContent,
    catalog,
    loadedChapters,
    isLoading,
    isLoadingMore,
    isParsing,
    error,
    loadError,
    totalChapters,
    hasPrevChapter,
    hasNextChapter,
    fetchBookInfo,
    isCurrentBookTarget,
    ensureReaderSession,
    startReaderSession,
    openBook,
    goToChapter,
    goToChapterInScroll,
    nextChapter,
    prevChapter,
    appendNextChapter,
    retryLoadNext,
    refreshChapter,
    reloadCurrentChapter,
    updateChapterIndexByScroll,
    saveProgress,
    disposeReader,
    reset,
  };
});
