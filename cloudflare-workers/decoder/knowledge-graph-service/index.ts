import type { KnowledgeGraphEntity } from './types.ts'

export function addKnowledgeGraphEntity(
  aliasIndex: Map<string, KnowledgeGraphEntity>,
  entity: KnowledgeGraphEntity
): void {
  const primaryName = entity.realName || entity.name
  if (!primaryName) {
    return
  }

  aliasIndex.set(primaryName, entity)
  entity.aliases?.forEach(alias => aliasIndex.set(alias, entity))
}
