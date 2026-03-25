import { defineStore } from "pinia";
import { createSettingsStoreActions } from "./settings-store/actions";
import { createSettingsStoreState } from "./settings-store/state";
import { createSettingsStoreView } from "./settings-store/view";

export type {
  ChineseConvert,
  FontFamily,
  ReaderConfig,
  ReaderTheme,
  ThemeColors,
} from "@/types/settings";

export const useSettingsStore = defineStore("settings", () => {
  const state = createSettingsStoreState();
  const view = createSettingsStoreView(state);
  const actions = createSettingsStoreActions(state, view);

  return {
    ...state,
    ...view,
    ...actions,
  };
});
