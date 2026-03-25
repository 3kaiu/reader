import { computed } from "vue";
import {
  CLIENT_ROUTE_KINDS,
  FONT_FAMILY_MAP,
  THEME_COLORS,
  clampSettingValue,
  formatRouteLatency,
  formatRouteShare,
  persistConfig,
} from "@/utils/settingsStore";
import type { ThemeColors } from "@/types/settings";
import type {
  SettingsStoreState,
  SettingsStoreView,
} from "./types";

export function createSettingsStoreView(
  state: SettingsStoreState,
): SettingsStoreView {
  const currentFontFamily = computed(
    () => FONT_FAMILY_MAP[state.config.fontFamily] || FONT_FAMILY_MAP.system,
  );

  const themeColors = computed<ThemeColors>(() => {
    if (state.config.theme === "custom") {
      return {
        bg: state.config.customColors.bg,
        text: state.config.customColors.text,
      };
    }
    return THEME_COLORS[state.config.theme];
  });

  const clientRoutingSummary = computed(() => {
    const analytics = state.clientRouting.value;

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
    get: () => (state.config.theme === "night" ? "dark" : "light"),
    set: (value) => {
      if (value === "dark") {
        state.config.theme = "night";
      } else if (value === "light") {
        state.config.theme = "white";
      }
      persistConfig(state.config, state.language.value);
    },
  });

  const fontSize = computed<number>({
    get: () => state.config.fontSize,
    set: (value) => {
      state.config.fontSize = clampSettingValue(value, 12, 32);
      persistConfig(state.config, state.language.value);
    },
  });

  return {
    currentFontFamily,
    themeColors,
    clientRoutingSummary,
    theme,
    fontSize,
  };
}
