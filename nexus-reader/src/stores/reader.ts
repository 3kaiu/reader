import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { readingJourneyService } from "@/services/journey/reading";
import type { Book, Chapter } from "@/api/book";

type LoadedChapter = {
  index: number;
  title: string;
  formattedContent?: string;
};

type ReaderBook = Book & {
  sourceId: string;
  bookUrl: string;
  tags?: string[];
};

const PROGRESS_STORAGE_KEY = "reader-progress";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const line = escapeHtml(paragraph.trim()).replace(/\n/g, "<br />");
      return `<p class="content-paragraph">${line}</p>`;
    })
    .join("");
}

function loadPersistedProgress(): Record<string, number> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function savePersistedProgress(progressMap: Record<string, number>) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressMap));
  } catch {
    // ignore persist failures
  }
}

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
  const progressMap = ref<Record<string, number>>(loadPersistedProgress());
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

  const ensureCatalog = async () => {
    if (!currentBook.value) {
      throw new Error("缺少书籍信息");
    }

    if (catalog.value.length > 0) {
      return catalog.value;
    }

    const res = await readingJourneyService.getChapters(
      currentBook.value.sourceId,
      currentBook.value.bookUrl,
    );

    if (!res.isSuccess || !Array.isArray(res.data)) {
      throw new Error(res.errorMsg || "获取目录失败");
    }

    catalog.value = res.data.map((chapter, index) => ({
      ...chapter,
      index: typeof chapter.index === "number" ? chapter.index : index,
    }));

    return catalog.value;
  };

  const setCurrentChapterContent = (chapter: Chapter, chapterContent: string) => {
    currentChapter.value = chapter;
    content.value = chapterContent;
    isParsing.value = true;
    formattedContent.value = formatContent(chapterContent);
    isParsing.value = false;
  };

  const updateLoadedChapter = (
    chapter: Chapter,
    chapterContent: string,
    replaceOnly = false,
  ) => {
    const entry: LoadedChapter = {
      index: chapter.index,
      title: chapter.title,
      formattedContent: formatContent(chapterContent),
    };

    const existingIndex = loadedChapters.value.findIndex(
      (item) => item.index === chapter.index,
    );

    if (replaceOnly) {
      loadedChapters.value = [entry];
      return;
    }

    if (existingIndex >= 0) {
      const next = [...loadedChapters.value];
      next[existingIndex] = entry;
      loadedChapters.value = next;
      return;
    }

    loadedChapters.value = [...loadedChapters.value, entry].sort(
      (a, b) => a.index - b.index,
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

    const res = await readingJourneyService.getContent(
      currentBook.value.sourceId,
      chapter.url,
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

      const persistedIndex = progressMap.value[book.bookUrl];
      const initialIndex = Math.max(
        0,
        Math.min(
          typeof persistedIndex === "number"
            ? persistedIndex
            : book.lastChapterIndex || book.durChapterIndex || 0,
          Math.max(catalog.value.length - 1, 0),
        ),
      );

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

  const initInfiniteScroll = () => {
    if (currentChapter.value && content.value) {
      updateLoadedChapter(currentChapter.value, content.value, true);
    }
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
    savePersistedProgress(progressMap.value);
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
    openBook,
    goToChapter,
    goToChapterInScroll,
    nextChapter,
    prevChapter,
    appendNextChapter,
    retryLoadNext,
    refreshChapter,
    reloadCurrentChapter,
    initInfiniteScroll,
    updateChapterIndexByScroll,
    saveProgress,
    reset,
  };
});
