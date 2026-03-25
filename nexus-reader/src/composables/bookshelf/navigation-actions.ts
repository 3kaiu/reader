import type { Router } from 'vue-router'

export function createBookshelfNavigationActions(router: Router) {
  function goSearch() {
    void router.push('/search')
  }

  function goDiscovery() {
    void router.push('/discovery')
  }

  function navigateTo(path: string) {
    void router.push(path)
  }

  return {
    navigateTo,
    goDiscovery,
    goSearch,
  }
}
