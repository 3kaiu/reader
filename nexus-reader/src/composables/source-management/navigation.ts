import type { SourceManagementContext } from './types'

export function createSourceNavigationActions(context: SourceManagementContext) {
  function goBack() {
    void context.router.push('/')
  }

  return {
    goBack,
  }
}
