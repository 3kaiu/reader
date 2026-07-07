import type { Router } from 'vue-router'
import { createManageModeNavigationActions } from '@/composables/manage-mode/navigation'

interface NavigationSource {
  router: Router
}

export function createSourceNavigationActions(source: NavigationSource) {
  return createManageModeNavigationActions({ router: source.router })
}