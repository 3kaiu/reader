import { reactive, ref } from "vue";
import { cloneDefaultConfig } from "@/utils/settingsStore";
import type { SettingsStoreState } from "./types";

export function createSettingsStoreState(): SettingsStoreState {
  return {
    config: reactive(cloneDefaultConfig()),
    language: ref("zh-CN"),
    notifications: ref({
      enabled: true,
      sound: true,
      desktop: false,
    }),
    privacy: ref({
      analytics: true,
      crashReports: true,
      usageData: false,
    }),
    clientRouting: ref(null),
    clientRoutingLoading: ref(false),
  };
}
