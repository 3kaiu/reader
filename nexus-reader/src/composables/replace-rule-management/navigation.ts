import type { ReplaceRuleManagementContext } from './types'

export function createReplaceRuleNavigationActions(
  context: ReplaceRuleManagementContext,
) {
  function goBack() {
    void context.router.push('/')
  }

  return {
    goBack,
  }
}
