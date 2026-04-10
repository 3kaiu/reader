import { useToast } from '@/components/ui/toast/use-toast'
import { useEyeCare } from '@/composables/useEyeCare'
import { useOfflineStore } from '@/stores/offlineStorage'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'

export function createReaderViewServices() {
  const { toast } = useToast()
  const readerStore = useReaderStore()
  const settingsStore = useSettingsStore()
  const eyeCare = useEyeCare()
  const offlineStore = useOfflineStore()

  return {
    toast,
    readerStore,
    settingsStore,
    eyeCare,
    offlineStore,
  }
}

export type ReaderViewServices = ReturnType<typeof createReaderViewServices>
