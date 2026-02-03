/**
 * 前端领域层 (Domain Layer)
 *
 * 这是DDD架构中的前端领域层，负责前端业务逻辑和状态管理。
 * 领域层是整个前端系统的核心，它定义了业务概念、业务规则和业务行为。
 *
 * 领域层设计原则：
 * - 高内聚：相关业务逻辑集中在一个领域内
 * - 低耦合：领域间依赖最小化
 * - 业务导向：以业务概念为中心，而不是技术实现
 * - 状态管理：领域状态的集中管理
 */

// ===== 领域层导出 =====
export * from './reading';
export * from './search';
export * from './user';
export * from './ui';

// ===== 领域基础类型 =====

/**
 * 领域实体接口
 */
export interface Entity {
  id: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 聚合根接口
 */
export interface AggregateRoot extends Entity {
  uncommittedEvents: DomainEvent[];
  addDomainEvent(event: DomainEvent): void;
  getUncommittedEvents(): DomainEvent[];
  clearUncommittedEvents(): void;
}

/**
 * 值对象接口
 */
export interface ValueObject {
  equals(other: ValueObject): boolean;
}

/**
 * 领域事件基类
 */
export interface DomainEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  aggregateId: string;
  eventData: Record<string, any>;
}

/**
 * 领域上下文
 */
export interface DomainContext {
  userId?: string;
  sessionId?: string;
  correlationId: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

/**
 * 领域结果
 */
export interface DomainResult<T = any> {
  success: boolean;
  data?: T;
  events: DomainEvent[];
  metadata: Record<string, any>;
  executionTimeMs: number;
}

/**
 * 领域错误
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public code: string,
    public category: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/**
 * 业务规则验证器接口
 */
export interface BusinessRuleValidator<T> {
  ruleName: string;
  validate(entity: T, context: DomainContext): Promise<void> | void;
  description: string;
}

/**
 * 领域服务接口
 */
export interface DomainService {
  name: string;
  execute(context: DomainContext): Promise<DomainResult>;
}

/**
 * 领域状态管理器
 */
export class DomainStateManager {
  private static instance: DomainStateManager;
  private state: Map<string, any> = new Map();
  private subscribers: Map<string, Set<(state: any) => void>> = new Map();

  private constructor() { }

  static getInstance(): DomainStateManager {
    if (!DomainStateManager.instance) {
      DomainStateManager.instance = new DomainStateManager();
    }
    return DomainStateManager.instance;
  }

  /**
   * 获取领域状态
   */
  getState<T>(domain: string): T | undefined {
    return this.state.get(domain);
  }

  /**
   * 设置领域状态
   */
  setState(domain: string, state: any): void {
    const oldState = this.state.get(domain);
    this.state.set(domain, state);

    // 通知订阅者
    const subscribers = this.subscribers.get(domain);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(state);
        } catch (error) {
          console.error(`Domain state subscriber error:`, error);
        }
      });
    }

    // 触发领域事件
    if (oldState !== state) {
      this.emitDomainEvent({
        eventId: crypto.randomUUID(),
        eventType: `${domain}.StateChanged`,
        timestamp: new Date(),
        aggregateId: domain,
        eventData: {
          oldState,
          newState: state,
        },
      });
    }
  }

  /**
   * 订阅领域状态变化
   */
  subscribe(domain: string, callback: (state: any) => void): () => void {
    if (!this.subscribers.has(domain)) {
      this.subscribers.set(domain, new Set());
    }
    this.subscribers.get(domain)!.add(callback);

    // 返回取消订阅函数
    return () => {
      const subscribers = this.subscribers.get(domain);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscribers.delete(domain);
        }
      }
    };
  }

  /**
   * 触发领域事件
   */
  private emitDomainEvent(event: DomainEvent): void {
    // 这里可以将事件发送到事件总线
    console.log('Domain event emitted:', event);
  }
}

/**
 * 领域层配置
 */
export interface DomainConfig {
  enableDomainEvents: boolean;
  enableStateManagement: boolean;
  enableBusinessRules: boolean;
  cacheEnabled: boolean;
  cacheTTL: number;
}

/**
 * 默认领域配置
 */
export const defaultDomainConfig: DomainConfig = {
  enableDomainEvents: true,
  enableStateManagement: true,
  enableBusinessRules: true,
  cacheEnabled: true,
  cacheTTL: 300000, // 5分钟
};

/**
 * 领域层初始化
 */
export class DomainLayer {
  private config: DomainConfig;
  private stateManager: DomainStateManager;

  constructor(config: DomainConfig = defaultDomainConfig) {
    this.config = config;
    this.stateManager = DomainStateManager.getInstance();
  }

  /**
   * 获取领域状态管理器
   */
  getStateManager(): DomainStateManager {
    return this.stateManager;
  }

  /**
   * 获取配置
   */
  getConfig(): DomainConfig {
    return this.config;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<DomainConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ===== 全局领域层实例 =====

let globalDomainLayer: DomainLayer | null = null;

/**
 * 获取全局领域层实例
 */
export function getDomainLayer(): DomainLayer {
  if (!globalDomainLayer) {
    globalDomainLayer = new DomainLayer();
  }
  return globalDomainLayer;
}

/**
 * 初始化领域层
 */
export function initDomainLayer(config?: DomainConfig): DomainLayer {
  globalDomainLayer = new DomainLayer(config);
  return globalDomainLayer;
}