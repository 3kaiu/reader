import type {
  ComputedRef,
  Ref,
  WritableComputedRef,
} from "vue";
import type { ClientRoutingAnalytics } from "@/api/sync";
import type {
  ReaderConfig,
  ThemeColors,
} from "@/types/settings";

export type NotificationSettings = {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
};

export type PrivacySettings = {
  analytics: boolean;
  crashReports: boolean;
  usageData: boolean;
};

export type ClientRoutingSummary = {
  window: string;
  note: string;
  routes: Array<{
    key: string;
    label: string;
    shareLabel: string;
    p50Label: string;
    p95Label: string;
  }>;
};

export interface SettingsStoreState {
  config: ReaderConfig;
  language: Ref<string>;
  notifications: Ref<NotificationSettings>;
  privacy: Ref<PrivacySettings>;
  clientRouting: Ref<ClientRoutingAnalytics | null>;
  clientRoutingLoading: Ref<boolean>;
}

export interface SettingsStoreView {
  currentFontFamily: ComputedRef<string>;
  themeColors: ComputedRef<ThemeColors>;
  clientRoutingSummary: ComputedRef<ClientRoutingSummary>;
  theme: WritableComputedRef<"light" | "dark" | "auto">;
  fontSize: WritableComputedRef<number>;
}

export interface SettingsStoreActions {
  updateConfig<K extends keyof ReaderConfig>(key: K, value: ReaderConfig[K]): void;
  resetConfig(): void;
  increaseFontSize(): void;
  decreaseFontSize(): void;
  increaseLineHeight(): void;
  decreaseLineHeight(): void;
  toggleAutoNightMode(enabled: boolean): void;
  applyAutoNightMode(): void;
  updateTheme(newTheme: "light" | "dark" | "auto"): void;
  updateLanguage(newLanguage: string): Promise<void>;
  updateFontSize(newSize: number): void;
  updateNotifications(settings: Partial<NotificationSettings>): void;
  updatePrivacy(settings: Partial<PrivacySettings>): void;
  refreshClientRouting(): Promise<void>;
  clearClientRouting(): void;
  loadFromConfig(): void;
  saveToConfig(): void;
}
