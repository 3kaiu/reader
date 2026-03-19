import type { Ref } from "vue";

type UseReaderGestureOptions = {
  containerRef: Ref<HTMLElement | null>;
  readingMode: "scroll" | "swipe";
  zenMode: boolean;
  onToggleToolbar: () => void;
  onToggleZenMode: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onLongPress?: (e: MouseEvent | TouchEvent) => void;
};

export function useReaderGesture(options: UseReaderGestureOptions) {
  const handleAreaClick = (event: MouseEvent) => {
    if (options.readingMode !== "swipe") {
      options.onToggleToolbar();
      return;
    }

    const container = options.containerRef.value;
    if (!container) {
      options.onToggleToolbar();
      return;
    }

    const rect = container.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const ratio = rect.width > 0 ? clickX / rect.width : 0.5;

    if (ratio <= 0.3) {
      options.onPrevPage();
      return;
    }

    if (ratio >= 0.7) {
      options.onNextPage();
      return;
    }

    options.onToggleToolbar();
  };

  return {
    handleAreaClick,
  };
}
