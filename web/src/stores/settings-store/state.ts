import { reactive, shallowRef, ref } from 'vue'
import { cloneDefaultConfig } from '@/stores/settings-store/helpers'
import type { SettingsStoreState } from './types'

export function createSettingsStoreState(): SettingsStoreState {
  return {
    config: reactive(cloneDefaultConfig()),
    language: ref('zh-CN'),
    sourcePackages: shallowRef([]),
    sourcePackagesLoading: ref(false),
    sourcePackageImporting: ref(false),
    sourcePackageDetail: ref(null),
    sourcePackageDetailLoading: ref(false),
  }
}
