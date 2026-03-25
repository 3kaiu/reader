import { useToast } from '@/components/ui/toast/use-toast'
import { useEyeCare } from '@/composables/useEyeCare'
import { useDecoderStore } from '@/stores/decoder'
import { useOfflineStore } from '@/stores/offlineStorage'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import { isOptionalFeatureEnabled } from '@/utils/features'

export function createReaderViewServices() {
  const { toast } = useToast()
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()
  const decoderStore = useDecoderStore()
  const eyeCare = useEyeCare()
  const offlineStore = useOfflineStore()
  const decoderAddonEnabled = isOptionalFeatureEnabled('decoder')

  return {
    toast,
    readerStore,
    settingsStore,
    decoderStore,
    eyeCare,
    offlineStore,
    decoderAddonEnabled,
  }
}

export type ReaderViewServices = ReturnType<typeof createReaderViewServices>
