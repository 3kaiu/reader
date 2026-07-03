/// <reference types="@rsbuild/core/types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  // biome-ignore lint/complexity/noBannedTypes: reason
  const component: DefineComponent<object, object, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_NEXUS_LITE_DIRECT_URL?: string
  readonly VITE_NEXUS_LITE_API_KEY?: string
  readonly VITE_SURVEY_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
