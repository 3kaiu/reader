export interface ReplaceRule {
  id?: string
  name: string
  pattern: string
  replacement?: string | null
  scope?: string | null
  isEnabled: boolean
  isRegex: boolean
  group?: string
}
