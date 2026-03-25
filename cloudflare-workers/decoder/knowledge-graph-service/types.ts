export interface KnowledgeGraphEntity extends Record<string, unknown> {
  name?: string
  realName?: string
  aliases?: string[]
}
