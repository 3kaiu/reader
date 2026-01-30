/**
 * Knowledge Graph Service (知识图谱服务)
 * 职责：管理人物、公司、事件实体及其关系索引
 */

import { type WorkerEnv } from '../shared/types.ts';
import { type Logger } from '../shared/logger.ts';

export class KnowledgeGraphService {
  private aliasIndex: Map<string, any> = new Map();
  private env: WorkerEnv;
  private logger: Logger;
  private loaded = false;

  constructor(env: WorkerEnv, logger: Logger) {
    this.env = env;
    this.logger = logger;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const keys = ['persons', 'companies', 'events'];
      for (const key of keys) {
        const data = await this.env.DECODER_KV?.get(`decoder:knowledge:${key}`);
        if (data) {
          const entities = JSON.parse(data);
          entities.forEach((ent: any) => {
            this.aliasIndex.set(ent.realName || ent.name, ent);
            ent.aliases?.forEach((a: string) => this.aliasIndex.set(a, ent));
          });
        }
      }
      this.loaded = true;
    } catch (e) {
      this.logger.error('Failed to load KG:', e);
    }
  }

  findEntity(alias: string): any {
    return this.aliasIndex.get(alias);
  }
}
