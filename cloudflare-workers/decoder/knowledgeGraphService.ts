/**
 * Knowledge Graph Service (知识图谱服务)
 * 职责：管理人物、公司、事件实体及其关系索引
 */

import { type WorkerEnv } from '../shared/types.ts'
import { type Logger } from '../shared/logger.ts'
import { addKnowledgeGraphEntity } from './knowledge-graph-service/index.ts'
import { collectKnowledgeGraphEntries } from './knowledge-graph-service/parsing.ts'
import type { KnowledgeGraphEntity } from './knowledge-graph-service/types.ts'

export class KnowledgeGraphService {
  private aliasIndex: Map<string, KnowledgeGraphEntity> = new Map()
  private env: WorkerEnv
  private logger: Logger
  private loaded = false
  private loadPromise: Promise<void> | null = null

  constructor(env: WorkerEnv, logger: Logger) {
    this.env = env
    this.logger = logger
  }

  async load(): Promise<void> {
    if (this.loaded) return
    if (this.loadPromise) {
      return await this.loadPromise
    }

    this.loadPromise = this.performLoad()

    try {
      await this.loadPromise
    } finally {
      this.loadPromise = null
    }
  }

  findEntity(alias: string): KnowledgeGraphEntity | undefined {
    return this.aliasIndex.get(alias)
  }

  private async performLoad(): Promise<void> {
    try {
      const keys = ['persons', 'companies', 'events']

      for (const key of keys) {
        const data = await this.env.DECODER_KV?.get(`decoder:knowledge:${key}`)
        if (!data) {
          continue
        }

        const entities = collectKnowledgeGraphEntries(JSON.parse(data))
        entities.forEach(entity => addKnowledgeGraphEntity(this.aliasIndex, entity))
      }

      this.loaded = true
    } catch (error) {
      this.logger.error('Failed to load KG:', error)
    }
  }
}
