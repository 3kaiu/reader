/**
 * Settings Store
 *
 * Provides a compatibility layer for the current reader/settings pages.
 */

import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import { syncApi, type ClientRoutingAnalytics } from "@/api/sync";
import { config as appConfig } from "@/utils/config";
import type {
  ReaderConfig,
  ThemeColors,
} from "@/types/settings";
import {
  CLIENT_ROUTE_KINDS,
  FONT_FAMILY_MAP,
  THEME_COLORS,
  clampSettingValue,
  cloneDefaultConfig,
  formatRouteLatency,
  formatRouteShare,
  isInNightWindow,
  loadPersistedConfig,
  persistConfig,
  sanitizePersistedConfig,
} from "@/utils/settingsStore";

export type {
  ChineseConvert,
  FontFamily,
  PageAnimation,
  ReaderConfig,
  ReaderTheme,
  ReadingMode,
  ThemeColors,
} from "@/types/settings";

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
  const clientRouting = ref<ClientRoutingAnalytics | null>(null);
  const clientRoutingLoading = ref(false);

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
  const clientRoutingSummary = computed(() => {
    const analytics = clientRouting.value;

    return {
      window: analytics?.window ?? "",
      note: analytics?.note ?? "",
      routes: CLIENT_ROUTE_KINDS.map((route) => ({
        key: route,
        label: route,
        shareLabel: formatRouteShare(analytics?.routeSharePct?.[route]),
        p50Label: formatRouteLatency(analytics?.latencySummary?.[route]?.p50),
        p95Label: formatRouteLatency(analytics?.latencySummary?.[route]?.p95),
      })),
    };
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
      config.fontSize = clampSettingValue(value, 12, 32);
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
      config.fontSize = clampSettingValue(value as number, 12, 32);
    } else if (key === "lineHeight") {
      config.lineHeight = clampSettingValue(value as number, 1.2, 3);
    } else if (key === "paragraphSpacing") {
      config.paragraphSpacing = clampSettingValue(value as number, 0.5, 3);
    } else if (key === "pageWidth") {
      config.pageWidth = clampSettingValue(value as number, 400, 1200);
    } else if (key === "fontWeight") {
      config.fontWeight = clampSettingValue(value as number, 300, 700);
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

  const refreshClientRouting = async () => {
    clientRoutingLoading.value = true;
    try {
      const response = await syncApi.getClientRoutingAnalytics();
      clientRouting.value = response.isSuccess ? response.data ?? null : null;
    } catch {
      clientRouting.value = null;
    } finally {
      clientRoutingLoading.value = false;
    }
  };

  const clearClientRouting = () => {
    clientRouting.value = null;
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
      config.fontSize = clampSettingValue(persistedFontSize, 12, 32);
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
    clientRouting,
    clientRoutingLoading,
    clientRoutingSummary,
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
    refreshClientRouting,
    clearClientRouting,
    loadFromConfig,
    saveToConfig,
  };
});
