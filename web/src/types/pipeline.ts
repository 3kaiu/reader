export type PipelineStageReport = {
  stage: string
  ok: boolean
  strategy?: string | null
  failureCode?: string | null
  warnings?: string[]
  metrics?: Record<string, string>
}
