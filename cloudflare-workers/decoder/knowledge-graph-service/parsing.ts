import type { KnowledgeGraphEntity } from './types.ts'

export function isKnowledgeGraphEntity(value: unknown): value is KnowledgeGraphEntity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const entity = value as Record<string, unknown>
  const hasPrimaryName =
    typeof entity.realName === 'string' || typeof entity.name === 'string'
  const aliasesAreValid =
    entity.aliases === undefined ||
    (Array.isArray(entity.aliases) && entity.aliases.every(alias => typeof alias === 'string'))

  return hasPrimaryName && aliasesAreValid
}

export function collectKnowledgeGraphEntries(entities: unknown): KnowledgeGraphEntity[] {
  if (!Array.isArray(entities)) {
    return []
  }

  return entities.filter(isKnowledgeGraphEntity)
}
