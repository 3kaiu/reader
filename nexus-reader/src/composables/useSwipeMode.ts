import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

type SwipeModeDeps = {
  readerStore: {
    formattedContent?: string;
    content?: string;
    currentChapterIndex: number;
    hasNextChapter: boolean;
    hasPrevChapter: boolean;
    nextChapter: () => Promise<void>;
    prevChapter: () => Promise<void>;
    initInfiniteScroll?: () => void;
  };
  settingsStore: {
    config: {
      fontSize: number;
      lineHeight: number;
      readingMode: "scroll" | "swipe";
      pageAnimation: "slide" | "fade" | "none";
    };
  };
  toggleToolbar?: () => void;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "\n").replace(/\n{2,}/g, "\n");
}

function estimateCharsPerPage(
  width: number,
  height: number,
  fontSize: number,
  lineHeight: number,
): number {
  const safeWidth = Math.max(width - 48, 240);
  const safeHeight = Math.max(height - 96, 320);
  const charsPerLine = Math.max(12, Math.floor(safeWidth / (fontSize * 0.58)));
  const linesPerPage = Math.max(
    8,
    Math.floor(safeHeight / (fontSize * lineHeight)),
  );
  return charsPerLine * linesPerPage;
}

export function useSwipeMode({
  readerStore,
  settingsStore,
  toggleToolbar,
}: SwipeModeDeps) {
  const contentRef = ref<HTMLElement | null>(null);
  const page = ref(0);
  const viewportWidth = ref(
    typeof window !== "undefined" ? window.innerWidth : 375,
  );
  const viewportHeight = ref(
    typeof window !== "undefined" ? window.innerHeight : 667,
  );

  const layout = computed(() => ({
    columnWidth: Math.max(viewportWidth.value - 48, 240),
    columnGap: 0,
    padding: 24,
  }));

  const totalPages = computed(() => {
    if (settingsStore.config.readingMode !== "swipe") {
      return 1;
    }

    const source =
      readerStore.formattedContent || readerStore.content || "";
    const text = stripHtml(source);
    const charsPerPage = estimateCharsPerPage(
      viewportWidth.value,
      viewportHeight.value,
      settingsStore.config.fontSize || 18,
      settingsStore.config.lineHeight || 1.8,
    );

    return Math.max(1, Math.ceil(text.length / Math.max(charsPerPage, 1)));
  });

  const syncViewport = () => {
    viewportWidth.value = window.innerWidth;
    viewportHeight.value = window.innerHeight;
  };

  watch(
    () => readerStore.currentChapterIndex,
    () => {
      page.value = 0;
    },
  );

  watch(totalPages, (value) => {
    if (page.value >= value) {
      page.value = Math.max(0, value - 1);
    }
  });

  const nextPage = async () => {
    if (page.value < totalPages.value - 1) {
      page.value += 1;
      return;
    }

    if (!readerStore.hasNextChapter) {
      return;
    }

    await readerStore.nextChapter();
    readerStore.initInfiniteScroll?.();
    page.value = 0;
  };

  const prevPage = async () => {
    if (page.value > 0) {
      page.value -= 1;
      return;
    }

    if (!readerStore.hasPrevChapter) {
      return;
    }

    await readerStore.prevChapter();
    readerStore.initInfiniteScroll?.();
    await nextTick();
    page.value = Math.max(0, totalPages.value - 1);
  };

  const handleClick = (event: MouseEvent) => {
    const clickRatio = window.innerWidth > 0 ? event.clientX / window.innerWidth : 0.5;

    if (clickRatio <= 0.3) {
      void prevPage();
      return;
    }

    if (clickRatio >= 0.7) {
      void nextPage();
      return;
    }

    toggleToolbar?.();
  };

  onMounted(() => {
    syncViewport();
    window.addEventListener("resize", syncViewport, { passive: true });
  });

  onUnmounted(() => {
    window.removeEventListener("resize", syncViewport);
  });

  return {
    contentRef,
    page,
    totalPages,
    layout,
    handleClick,
    nextPage,
    prevPage,
  };
}
