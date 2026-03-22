import { computed, ref } from 'vue'
import {
  breakpointsTailwind,
  useBreakpoints,
  useDark,
  useStorage,
  useToggle,
} from '@vueuse/core'
import { buildBookshelfMenuGroups } from '@/constants/bookshelf'
import type { OptionalFeature } from '@/utils/features'

export function useBookshelfUiState(options: {
  isFeatureAvailable: (feature: OptionalFeature) => boolean
}) {
  const isDark = useDark()
  const toggleDark = useToggle(isDark)
  const showProgress = useStorage('bookshelf-progress', true)
  const menuOpen = ref(false)
  const showMoveDialog = ref(false)
  const currentGroupId = ref<string | number>('all')

  const breakpoints = useBreakpoints(breakpointsTailwind)
  const isDesktop = breakpoints.greater('sm')
  const menuGroups = computed(() =>
    buildBookshelfMenuGroups(options.isFeatureAvailable)
  )

  return {
    isDark,
    toggleDark,
    showProgress,
    menuOpen,
    showMoveDialog,
    currentGroupId,
    isDesktop,
    menuGroups,
  }
}
