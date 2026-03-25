import { syncApi } from "@/api/sync";
import type { SettingsStoreActions } from "../types";
import type { SettingsStoreActionContext } from "./helpers";

type SettingsClientRoutingActions = Pick<
  SettingsStoreActions,
  "refreshClientRouting" | "clearClientRouting"
>;

export function createSettingsClientRoutingActions(
  context: SettingsStoreActionContext,
): SettingsClientRoutingActions {
  const { state } = context;

  const refreshClientRouting = async () => {
    state.clientRoutingLoading.value = true;

    try {
      const response = await syncApi.getClientRoutingAnalytics();
      state.clientRouting.value = response.isSuccess ? response.data ?? null : null;
    } catch {
      state.clientRouting.value = null;
    } finally {
      state.clientRoutingLoading.value = false;
    }
  };

  const clearClientRouting = () => {
    state.clientRouting.value = null;
  };

  return {
    refreshClientRouting,
    clearClientRouting,
  };
}
