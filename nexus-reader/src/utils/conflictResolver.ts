// 冲突解决系统 - 处理多设备间的数据冲突

export interface ConflictData<T = any> {
  id: string;
  type: 'reading-progress' | 'user-preferences' | 'bookmark' | 'novel-metadata';
  localData: T;
  serverData: T;
  timestamp: number;
  resolved: boolean;
  resolution?: ConflictResolution<T>;
}

export interface ConflictResolution<T = any> {
  strategy: ConflictResolutionStrategy;
  resolvedData: T;
  winner: 'local' | 'server' | 'merged';
  timestamp: number;
  metadata?: Record<string, any>;
}

export type ConflictResolutionStrategy = 
  | 'last-write-wins'
  | 'client-wins' 
  | 'server-wins'
  | 'merge-fields'
  | 'manual'
  | 'custom';

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictType: 'timestamp' | 'content' | 'version' | 'none';
  severity: 'low' | 'medium' | 'high';
  details: Record<string, any>;
}

export interface MergeRule<T = any> {
  field: keyof T;
  strategy: 'prefer-local' | 'prefer-server' | 'latest' | 'largest' | 'smallest' | 'merge-array' | 'custom';
  customMerger?: (local: any, server: any) => any;
}

class ConflictResolver {
  private conflictHistory: Map<string, ConflictData[]> = new Map();
  private mergeRules: Map<string, MergeRule[]> = new Map();
  private customResolvers: Map<string, (local: any, server: any) => ConflictResolution> = new Map();

  constructor() {
    this.initializeDefaultMergeRules();
  }

  // 初始化默认合并规则
  private initializeDefaultMergeRules(): void {
    // 阅读进度合并规则
    this.setMergeRules('reading-progress', [
      { field: 'position', strategy: 'largest' },
      { field: 'percentage', strategy: 'largest' },
      { field: 'lastRead', strategy: 'latest' },
      { field: 'totalReadingTime', strategy: 'largest' },
      { field: 'bookmarks', strategy: 'merge-array' }
    ]);

    // 用户偏好合并规则
    this.setMergeRules('user-preferences', [
      { field: 'theme', strategy: 'latest' },
      { field: 'fontSize', strategy: 'latest' },
      { field: 'fontFamily', strategy: 'latest' },
      { field: 'readingMode', strategy: 'latest' },
      { field: 'autoSync', strategy: 'latest' }
    ]);

    // 书签合并规则（通常不冲突，但可能有位置更新）
    this.setMergeRules('bookmark', [
      { field: 'position', strategy: 'latest' },
      { field: 'note', strategy: 'prefer-local' },
      { field: 'createdAt', strategy: 'prefer-server' }
    ]);
  }

  // 检测冲突
  detectConflict<T>(localData: T, serverData: T, type: string): ConflictDetectionResult {
    if (!localData || !serverData) {
      return {
        hasConflict: false,
        conflictType: 'none',
        severity: 'low',
        details: {}
      };
    }

    const conflicts: Record<string, any> = {};
    let hasConflict = false;
    let maxSeverity: 'low' | 'medium' | 'high' = 'low';

    // 时间戳冲突检测
    const localTime = (localData as any).lastModified || (localData as any).lastRead || 0;
    const serverTime = (serverData as any).lastModified || (serverData as any).lastRead || 0;
    const timeDiff = Math.abs(localTime - serverTime);

    if (timeDiff < 5000) { // 5秒内的更新视为潜在冲突
      conflicts.timestamp = { local: localTime, server: serverTime, diff: timeDiff };
      hasConflict = true;
      maxSeverity = 'medium';
    }

    // 内容冲突检测
    const contentConflicts = this.detectContentConflicts(localData, serverData, type);
    if (contentConflicts.length > 0) {
      conflicts.content = contentConflicts;
      hasConflict = true;
      maxSeverity = 'high';
    }

    // 版本冲突检测
    const localVersion = (localData as any).version || 0;
    const serverVersion = (serverData as any).version || 0;
    if (localVersion !== serverVersion && Math.abs(localVersion - serverVersion) > 1) {
      conflicts.version = { local: localVersion, server: serverVersion };
      hasConflict = true;
      maxSeverity = 'high';
    }

    return {
      hasConflict,
      conflictType: hasConflict ? (conflicts.content ? 'content' : conflicts.version ? 'version' : 'timestamp') : 'none',
      severity: maxSeverity,
      details: conflicts
    };
  }

  // 检测内容冲突
  private detectContentConflicts<T>(localData: T, serverData: T, type: string): Array<{ field: string; local: any; server: any }> {
    const conflicts: Array<{ field: string; local: any; server: any }> = [];
    const mergeRules = this.mergeRules.get(type) || [];

    for (const rule of mergeRules) {
      const localValue = (localData as any)[rule.field];
      const serverValue = (serverData as any)[rule.field];

      if (this.valuesConflict(localValue, serverValue)) {
        conflicts.push({
          field: rule.field as string,
          local: localValue,
          server: serverValue
        });
      }
    }

    return conflicts;
  }

  // 判断值是否冲突
  private valuesConflict(local: any, server: any): boolean {
    if (local === server) return false;
    if (local == null || server == null) return false;

    // 数组比较
    if (Array.isArray(local) && Array.isArray(server)) {
      return JSON.stringify(local.sort()) !== JSON.stringify(server.sort());
    }

    // 对象比较
    if (typeof local === 'object' && typeof server === 'object') {
      return JSON.stringify(local) !== JSON.stringify(server);
    }

    return local !== server;
  }

  // 解决冲突
  async resolveConflict<T>(
    localData: T,
    serverData: T,
    strategy: ConflictResolutionStrategy,
    type: string,
    conflictId?: string
  ): Promise<ConflictResolution<T>> {
    const timestamp = Date.now();

    switch (strategy) {
      case 'last-write-wins':
        return this.resolveLastWriteWins(localData, serverData, timestamp);

      case 'client-wins':
        return {
          strategy,
          resolvedData: localData,
          winner: 'local',
          timestamp,
          metadata: { reason: 'Client preference' }
        };

      case 'server-wins':
        return {
          strategy,
          resolvedData: serverData,
          winner: 'server',
          timestamp,
          metadata: { reason: 'Server preference' }
        };

      case 'merge-fields':
        return this.resolveMergeFields(localData, serverData, type, timestamp);

      case 'custom':
        const customResolver = this.customResolvers.get(type);
        if (customResolver) {
          return customResolver(localData, serverData);
        }
        // 回退到最后写入获胜
        return this.resolveLastWriteWins(localData, serverData, timestamp);

      case 'manual':
        // 保存冲突供手动解决
        if (conflictId) {
          await this.saveConflictForManualResolution(conflictId, localData, serverData, type);
        }
        // 临时使用服务器数据
        return {
          strategy,
          resolvedData: serverData,
          winner: 'server',
          timestamp,
          metadata: { reason: 'Pending manual resolution', conflictId }
        };

      default:
        throw new Error(`Unknown conflict resolution strategy: ${strategy}`);
    }
  }

  // 最后写入获胜策略
  private resolveLastWriteWins<T>(localData: T, serverData: T, timestamp: number): ConflictResolution<T> {
    const localTime = (localData as any).lastModified || (localData as any).lastRead || 0;
    const serverTime = (serverData as any).lastModified || (serverData as any).lastRead || 0;

    const winner = localTime > serverTime ? 'local' : 'server';
    const resolvedData = winner === 'local' ? localData : serverData;

    return {
      strategy: 'last-write-wins',
      resolvedData,
      winner,
      timestamp,
      metadata: {
        localTime,
        serverTime,
        timeDiff: Math.abs(localTime - serverTime)
      }
    };
  }

  // 字段合并策略
  private resolveMergeFields<T>(localData: T, serverData: T, type: string, timestamp: number): ConflictResolution<T> {
    const mergeRules = this.mergeRules.get(type) || [];
    const resolvedData = { ...serverData }; // 从服务器数据开始

    for (const rule of mergeRules) {
      const localValue = (localData as any)[rule.field];
      const serverValue = (serverData as any)[rule.field];

      (resolvedData as any)[rule.field] = this.mergeFieldValue(
        localValue,
        serverValue,
        rule
      );
    }

    return {
      strategy: 'merge-fields',
      resolvedData,
      winner: 'merged',
      timestamp,
      metadata: {
        mergeRules: mergeRules.map(r => ({ field: r.field, strategy: r.strategy }))
      }
    };
  }

  // 合并单个字段值
  private mergeFieldValue(localValue: any, serverValue: any, rule: MergeRule): any {
    if (rule.customMerger) {
      return rule.customMerger(localValue, serverValue);
    }

    switch (rule.strategy) {
      case 'prefer-local':
        return localValue !== undefined ? localValue : serverValue;

      case 'prefer-server':
        return serverValue !== undefined ? serverValue : localValue;

      case 'latest':
        const localTime = this.extractTimestamp(localValue);
        const serverTime = this.extractTimestamp(serverValue);
        return localTime > serverTime ? localValue : serverValue;

      case 'largest':
        return Math.max(Number(localValue) || 0, Number(serverValue) || 0);

      case 'smallest':
        return Math.min(Number(localValue) || 0, Number(serverValue) || 0);

      case 'merge-array':
        if (Array.isArray(localValue) && Array.isArray(serverValue)) {
          // 合并数组，去重
          const merged = [...localValue, ...serverValue];
          return merged.filter((item, index, arr) => 
            arr.findIndex(i => JSON.stringify(i) === JSON.stringify(item)) === index
          );
        }
        return serverValue;

      default:
        return serverValue;
    }
  }

  // 提取时间戳
  private extractTimestamp(value: any): number {
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object') {
      return value.timestamp || value.lastModified || value.createdAt || 0;
    }
    return 0;
  }

  // 保存冲突供手动解决
  private async saveConflictForManualResolution<T>(
    conflictId: string,
    localData: T,
    serverData: T,
    type: string
  ): Promise<void> {
    const conflict: ConflictData<T> = {
      id: conflictId,
      type: type as any,
      localData,
      serverData,
      timestamp: Date.now(),
      resolved: false
    };

    // 保存到本地存储
    const conflicts = this.conflictHistory.get(type) || [];
    conflicts.push(conflict);
    this.conflictHistory.set(type, conflicts);

    // 保存到localStorage供UI显示
    localStorage.setItem(`conflict-${conflictId}`, JSON.stringify(conflict));

    // 触发冲突事件
    window.dispatchEvent(new CustomEvent('sync-conflict-detected', {
      detail: conflict
    }));
  }

  // 设置合并规则
  setMergeRules(type: string, rules: MergeRule[]): void {
    this.mergeRules.set(type, rules);
  }

  // 注册自定义解决器
  registerCustomResolver(
    type: string,
    resolver: (local: any, server: any) => ConflictResolution
  ): void {
    this.customResolvers.set(type, resolver);
  }

  // 获取冲突历史
  getConflictHistory(type?: string): ConflictData[] {
    if (type) {
      return this.conflictHistory.get(type) || [];
    }

    const allConflicts: ConflictData[] = [];
    for (const conflicts of this.conflictHistory.values()) {
      allConflicts.push(...conflicts);
    }

    return allConflicts.sort((a, b) => b.timestamp - a.timestamp);
  }

  // 获取待解决的冲突
  getPendingConflicts(): ConflictData[] {
    return this.getConflictHistory().filter(c => !c.resolved);
  }

  // 标记冲突为已解决
  markConflictResolved(conflictId: string, resolution: ConflictResolution): void {
    for (const conflicts of this.conflictHistory.values()) {
      const conflict = conflicts.find(c => c.id === conflictId);
      if (conflict) {
        conflict.resolved = true;
        conflict.resolution = resolution;
        localStorage.removeItem(`conflict-${conflictId}`);
        break;
      }
    }

    // 触发解决事件
    window.dispatchEvent(new CustomEvent('sync-conflict-resolved', {
      detail: { conflictId, resolution }
    }));
  }

  // 清理旧冲突记录
  cleanupOldConflicts(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;

    for (const [type, conflicts] of this.conflictHistory.entries()) {
      const filtered = conflicts.filter(c => c.timestamp > cutoff);
      this.conflictHistory.set(type, filtered);
    }

    // 清理localStorage中的旧冲突
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('conflict-')) {
        try {
          const conflict = JSON.parse(localStorage.getItem(key) || '{}');
          if (conflict.timestamp && conflict.timestamp < cutoff) {
            localStorage.removeItem(key);
          }
        } catch (error) {
          // 清理无效的冲突数据
          localStorage.removeItem(key);
        }
      }
    }
  }
}

// 单例实例
export const conflictResolver = new ConflictResolver();
export default ConflictResolver;