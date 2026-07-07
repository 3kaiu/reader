import type { Router } from 'vue-router'

export interface ManageModeNavigationDeps {
  router: Router
  fallback?: string
}

export function createManageModeNavigationActions(deps: ManageModeNavigationDeps) {
  function goBack() {
    void deps.router.push(deps.fallback || '/')
  }

  return {
    goBack,
  }
}