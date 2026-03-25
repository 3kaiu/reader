import { config as appConfig } from "@/utils/config";
import {
  clampSettingValue,
  cloneDefaultConfig,
  loadPersistedConfig,
  sanitizePersistedConfig,
} from "@/utils/settingsStore";
import type { SettingsStoreActions } from "../types";
import type { SettingsStoreActionContext } from "./helpers";

type SettingsPersistenceActions = Pick<
  SettingsStoreActions,
  "loadFromConfig" | "saveToConfig"
>;

export function createSettingsPersistenceActions(
  context: SettingsStoreActionContext,
): SettingsPersistenceActions {
  const { state } = context;

  const loadFromConfig = () => {
    const persisted = sanitizePersistedConfig(loadPersistedConfig());
    if (persisted) {
      Object.assign(state.config, cloneDefaultConfig(), persisted);
    }

    state.language.value =
      (appConfig.get("ui.language", "zh-CN") as string) || "zh-CN";

    const persistedFontSize = appConfig.get(
      "reading.fontSize",
      state.config.fontSize,
    ) as number | undefined;

    if (typeof persistedFontSize === "number") {
      state.config.fontSize = clampSettingValue(persistedFontSize, 12, 32);
    }

    context.applyThemeClass();
  };

  const saveToConfig = () => {
    context.persistCurrentConfig();
  };

  return {
    loadFromConfig,
    saveToConfig,
  };
}
