/**
 * Settings Store
 *
 * Provides a compatibility layer for the current reader/settings pages.
 */

import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { config as appConfig } from "@/utils/config";

export type ReaderTheme =
  | "white"
  | "paper"
  | "sepia"
  | "gray"
  | "green"
  | "night"
  | "custom";

export type FontFamily =
  | "system"
  | "heiti"
  | "kaiti"
  | "songti"
  | "fangsong"
  | "lxgw";

export type ChineseConvert = "none" | "toSimplified" | "toTraditional";
export type ReadingMode = "scroll" | "swipe";
export type PageAnimation = "slide" | "fade" | "none";

type ThemeColors = {
  bg: string;
  text: string;
};

type ReaderConfig = {
  theme: ReaderTheme;
  customColors: ThemeColors;
  fontFamily: FontFamily;
  chineseConvert: ChineseConvert;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  paragraphSpacing: number;
  pageWidth: number;
  readingMode: ReadingMode;
  pageAnimation: PageAnimation;
  clickToNextPage: boolean;
  autoNightMode: boolean;
  nightModeStartHour: number;
  nightModeEndHour: number;
  zenMode: boolean;
};

const STORAGE_KEY = "reader-settings";

const DEFAULT_CONFIG: ReaderConfig = {
  theme: "paper",
  customColors: {
    bg: "#FAF7ED",
    text: "#333333",
  },
  fontFamily: "system",
  chineseConvert: "none",
  fontSize: 18,
  fontWeight: 400,
  lineHeight: 1.8,
  paragraphSpacing: 1.2,
  pageWidth: 800,
  readingMode: "scroll",
  pageAnimation: "slide",
  clickToNextPage: true,
  autoNightMode: false,
  nightModeStartHour: 20,
  nightModeEndHour: 6,
  zenMode: false,
};

const THEME_COLORS: Record<Exclude<ReaderTheme, "custom">, ThemeColors> = {
  white: { bg: "#FFFFFF", text: "#242424" },
  paper: { bg: "#FAF7ED", text: "#38342F" },
  sepia: { bg: "#EFE6D5", text: "#4A3B32" },
  gray: { bg: "#F2F3F5", text: "#2B2B2B" },
  green: { bg: "#E6F0E6", text: "#2E362C" },
  night: { bg: "#1C1C1E", text: "#A1A1AA" },
};

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  heiti: "'PingFang SC', 'Microsoft YaHei', sans-serif",
  kaiti: "STKaiti, KaiTi, serif",
  songti: "STSong, SimSun, serif",
  fangsong: "FangSong, STFangsong, serif",
  lxgw: "'LXGW WenKai Screen', 'LXGW WenKai', serif",
};

function cloneDefaultConfig(): ReaderConfig {
  return {
    ...DEFAULT_CONFIG,
    customColors: { ...DEFAULT_CONFIG.customColors },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isInNightWindow(
  hour: number,
  startHour: number,
  endHour: number,
): boolean {
  if (startHour === endHour) {
    return true;
  }
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}

function loadPersistedConfig(): Partial<ReaderConfig> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<ReaderConfig>) : null;
  } catch (error) {
    console.warn("Failed to load reader settings:", error);
    return null;
  }
}

function sanitizePersistedConfig(
  persisted: Partial<ReaderConfig> | null,
): Partial<ReaderConfig> | null {
  if (!persisted) {
    return null;
  }

  return {
    theme: persisted.theme,
    customColors: persisted.customColors
      ? {
          bg: persisted.customColors.bg ?? DEFAULT_CONFIG.customColors.bg,
          text: persisted.customColors.text ?? DEFAULT_CONFIG.customColors.text,
        }
      : undefined,
    fontFamily: persisted.fontFamily,
    chineseConvert: persisted.chineseConvert,
    fontSize: persisted.fontSize,
    fontWeight: persisted.fontWeight,
    lineHeight: persisted.lineHeight,
    paragraphSpacing: persisted.paragraphSpacing,
    pageWidth: persisted.pageWidth,
    readingMode: persisted.readingMode,
    pageAnimation: persisted.pageAnimation,
    clickToNextPage: persisted.clickToNextPage,
    autoNightMode: persisted.autoNightMode,
    nightModeStartHour: persisted.nightModeStartHour,
    nightModeEndHour: persisted.nightModeEndHour,
    zenMode: persisted.zenMode,
  };
}

function persistConfig(readerConfig: ReaderConfig, language: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readerConfig));
    appConfig.set("ui.language", language);
    appConfig.set("reading.fontSize", readerConfig.fontSize);
  } catch (error) {
    console.warn("Failed to persist reader settings:", error);
  }
}

export const useSettingsStore = defineStore("settings", () => {
  const config = reactive<ReaderConfig>(cloneDefaultConfig());
  const language = ref<string>("zh-CN");
  const notifications = ref({
    enabled: true,
    sound: true,
    desktop: false,
  });
  const privacy = ref({
    analytics: true,
    crashReports: true,
    usageData: false,
  });

  const currentFontFamily = computed(
    () => FONT_FAMILY_MAP[config.fontFamily] || FONT_FAMILY_MAP.system,
  );

  const themeColors = computed<ThemeColors>(() => {
    if (config.theme === "custom") {
      return {
        bg: config.customColors.bg,
        text: config.customColors.text,
      };
    }
    return THEME_COLORS[config.theme];
  });

  const theme = computed<"light" | "dark" | "auto">({
    get: () => (config.theme === "night" ? "dark" : "light"),
    set: (value) => {
      if (value === "dark") {
        config.theme = "night";
      } else if (value === "light") {
        config.theme = "white";
      }
      persistConfig(config, language.value);
    },
  });

  const fontSize = computed<number>({
    get: () => config.fontSize,
    set: (value) => {
      config.fontSize = clamp(value, 12, 32);
      persistConfig(config, language.value);
    },
  });

  const applyThemeClass = () => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.toggle("dark", config.theme === "night");
  };

  const updateConfig = <K extends keyof ReaderConfig>(
    key: K,
    value: ReaderConfig[K],
  ) => {
    if (key === "fontSize") {
      config.fontSize = clamp(value as number, 12, 32);
    } else if (key === "lineHeight") {
      config.lineHeight = clamp(value as number, 1.2, 3);
    } else if (key === "paragraphSpacing") {
      config.paragraphSpacing = clamp(value as number, 0.5, 3);
    } else if (key === "pageWidth") {
      config.pageWidth = clamp(value as number, 400, 1200);
    } else if (key === "fontWeight") {
      config.fontWeight = clamp(value as number, 300, 700);
    } else if (key === "customColors") {
      config.customColors = {
        ...config.customColors,
        ...(value as ThemeColors),
      };
    } else {
      config[key] = value;
    }

    applyThemeClass();
    persistConfig(config, language.value);
  };

  const resetConfig = () => {
    Object.assign(config, cloneDefaultConfig());
    applyThemeClass();
    persistConfig(config, language.value);
  };

  const increaseFontSize = () => updateConfig("fontSize", config.fontSize + 1);
  const decreaseFontSize = () => updateConfig("fontSize", config.fontSize - 1);
  const increaseLineHeight = () =>
    updateConfig("lineHeight", Number((config.lineHeight + 0.1).toFixed(1)));
  const decreaseLineHeight = () =>
    updateConfig("lineHeight", Number((config.lineHeight - 0.1).toFixed(1)));

  const toggleAutoNightMode = (enabled: boolean) => {
    updateConfig("autoNightMode", enabled);
    if (enabled) {
      applyAutoNightMode();
    }
  };

  const applyAutoNightMode = () => {
    if (!config.autoNightMode) {
      applyThemeClass();
      return;
    }

    const hour = new Date().getHours();
    const nightMode = isInNightWindow(
      hour,
      config.nightModeStartHour,
      config.nightModeEndHour,
    );

    updateConfig("theme", nightMode ? "night" : "white");
  };

  const updateTheme = (newTheme: "light" | "dark" | "auto") => {
    theme.value = newTheme;
    applyThemeClass();
  };

  const updateLanguage = async (newLanguage: string) => {
    language.value = newLanguage;
    persistConfig(config, language.value);
  };

  const updateFontSize = (newSize: number) => {
    fontSize.value = newSize;
  };

  const updateNotifications = (
    settings: Partial<typeof notifications.value>,
  ) => {
    Object.assign(notifications.value, settings);
  };

  const updatePrivacy = (settings: Partial<typeof privacy.value>) => {
    Object.assign(privacy.value, settings);
  };

  const loadFromConfig = () => {
    const persisted = sanitizePersistedConfig(loadPersistedConfig());
    if (persisted) {
      Object.assign(config, cloneDefaultConfig(), persisted);
    }

    language.value = (appConfig.get("ui.language", "zh-CN") as string) || "zh-CN";
    const persistedFontSize = appConfig.get("reading.fontSize", config.fontSize) as
      | number
      | undefined;
    if (typeof persistedFontSize === "number") {
      config.fontSize = clamp(persistedFontSize, 12, 32);
    }

    applyThemeClass();
  };

  const saveToConfig = () => {
    persistConfig(config, language.value);
  };

  return {
    config,
    theme,
    language,
    fontSize,
    notifications,
    privacy,
    currentFontFamily,
    themeColors,
    updateConfig,
    resetConfig,
    increaseFontSize,
    decreaseFontSize,
    increaseLineHeight,
    decreaseLineHeight,
    toggleAutoNightMode,
    applyAutoNightMode,
    updateTheme,
    updateLanguage,
    updateFontSize,
    updateNotifications,
    updatePrivacy,
    loadFromConfig,
    saveToConfig,
  };
});
