import {
  clampSettingValue,
  persistConfig,
} from "@/utils/settingsStore";
import type {
  ReaderConfig,
  ThemeColors,
} from "@/types/settings";
import type {
  SettingsStoreState,
  SettingsStoreView,
} from "../types";

export interface SettingsStoreActionContext {
  state: SettingsStoreState;
  view: SettingsStoreView;
  applyThemeClass: () => void;
  persistCurrentConfig: () => void;
}

export function createSettingsStoreActionContext(
  state: SettingsStoreState,
  view: SettingsStoreView,
): SettingsStoreActionContext {
  const applyThemeClass = () => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.classList.toggle(
      "dark",
      state.config.theme === "night",
    );
  };

  return {
    state,
    view,
    applyThemeClass,
    persistCurrentConfig: () => {
      persistConfig(state.config, state.language.value);
    },
  };
}

export function assignSettingsConfigValue<K extends keyof ReaderConfig>(
  config: ReaderConfig,
  key: K,
  value: ReaderConfig[K],
) {
  if (key === "fontSize") {
    config.fontSize = clampSettingValue(value as number, 12, 32);
    return;
  }

  if (key === "lineHeight") {
    config.lineHeight = clampSettingValue(value as number, 1.2, 3);
    return;
  }

  if (key === "paragraphSpacing") {
    config.paragraphSpacing = clampSettingValue(value as number, 0.5, 3);
    return;
  }

  if (key === "pageWidth") {
    config.pageWidth = clampSettingValue(value as number, 400, 1200);
    return;
  }

  if (key === "fontWeight") {
    config.fontWeight = clampSettingValue(value as number, 300, 700);
    return;
  }

  if (key === "customColors") {
    config.customColors = {
      ...config.customColors,
      ...(value as ThemeColors),
    };
    return;
  }

  config[key] = value;
}
