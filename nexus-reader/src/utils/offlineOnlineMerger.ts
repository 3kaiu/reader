// 离线-在线合并系统 - 处理设备重新连接时的数据协调

import { offlineStorageManager } from './offlineStorageManager';
import { conflictResolver } from './conflictResolver';

export interface MergeOperation {
  id: string;
  type: 'reading-progress' | 'user-preferences' | 'bookmark' | 'novel-metadata';
  action: 'create' | 'update' | 'delete';
  localData: any;
  serverData?: any;
  timestamp: number;
  status: 'pending' | 'merged' | 'failed' | 'conflict';
  retryCount: number;
  priority: 'high' | 'medium' | 'low';
}

export interface MergeResult {
  success: boolean;
  mergedData?: any;
  conflicts: Array<{
    id: string;
    type: string;
    localData: any;
    serverData: any;
  }>;
  errors: Array<{
    operation: MergeOperation;
    error: string;
  }>;
  stats: {
    totalOperations: number;
    successful: number;
    failed: number;
    conflicts: number;
    duration: number;
  };
}

export interface OfflineChangeTracker {
  trackChange(type: string, action: string, data: any): Promise<void>;
  getOfflineChanges(): Promise<MergeOperation[]>;
  clearOfflineChanges(): Promise<void>;
  markChangeAsMerged(changeId: string): Promise<void>;
}

class OfflineOnlineMerger {
  private mergeInProgress = false;
  private changeTracker: OfflineChangeTracker;
  private mergeHistory: MergeResult[] = [];
  private maxHistorySize = 50;

  constructor() {
    this.changeTracker = new IndexedDBChangeTracker();
    this.initializeEventListeners();
  }

  // 初始化事件监听器
  private initializeEventListeners(): void {
    // 监听网络状态变化
    window.addEventListener('online', () => {
      this.handleNetworkReconnection();
    });

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) {
        this.handleNetworkReconnection();
      }
    });

    // 监听存储变化
    window.addEventListener('storage', (event) => {
      if (event.key === 'offline-changes-updated') {
        this.handleOfflineChangesUpdated();
      }
    });
  }

  // 处理网络重连
  private async handleNetworkReconnection(): Promise<void> {
    if (this.mergeInProgress) {
      console.log('Merge already in progress, skipping...');
      return;
    }

    try {
      console.log('Network reconnected, starting offline-online merge...');
      const result = await this.mergeOfflineChanges();
      
      if (result.conflicts.length > 0) {
        this.notifyConflictsDetected(result.conflicts);
      }

      console.log('Offline-online merge completed:', result.stats);
    } catch (error) {
      console.error('Failed to merge offline changes:', error);
    }
  }

  // 处理离线变更更新
  private async handleOfflineChangesUpdated(): Promise<void> {
    if (navigator.onLine && !this.mergeInProgress) {
      // 延迟执行以避免频繁合并
      setTimeout(() => {
        this.mergeOfflineChanges();
      }, 1000);
    }
  }

  // 合并离线变更
  async mergeOfflineChanges(): Promise<MergeResult> {
    if (this.mergeInProgress) {
      throw new Error('Merge operation already in progress');
    }

    this.mergeInProgress = true;
    const startTime = Date.now();

    const result: MergeResult = {
      success: false,
      conflicts: [],
      errors: [],
      stats: {
        totalOperations: 0,
        successful: 0,
        failed: 0,
        conflicts: 0,
        duration: 0
      }
    };

    try {
      // 获取离线变更
      const offlineChanges = await this.changeTracker.getOfflineChanges();
      result.stats.totalOperations = offlineChanges.length;

      if (offlineChanges.length === 0) {
        result.success = true;
        result.stats.duration = Date.now() - startTime;
        return result;
      }

      console.log(`Starting merge of ${offlineChanges.length} offline changes`);

      // 按优先级和时间戳排序
      const sortedChanges = this.sortChangesByPriority(offlineChanges);

      // 批量处理变更
      const batchSize = 10;
      for (let i = 0; i < sortedChanges.length; i += batchSize) {
        const batch = sortedChanges.slice(i, i + batchSize);
        await this.processBatch(batch, result);
      }

      // 清理已成功合并的变更
      await this.cleanupMergedChanges(result);

      result.success = result.errors.length === 0;
      result.stats.duration = Date.now() - startTime;

      // 保存合并历史
      this.addToMergeHistory(result);

      return result;

    } catch (error) {
      console.error('Merge operation failed:', error);
      result.errors.push({
        operation: {} as MergeOperation,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      result.stats.duration = Date.now() - startTime;
      return result;
    } finally {
      this.mergeInProgress = false;
    }
  }

  // 按优先级排序变更
  private sortChangesByPriority(changes: MergeOperation[]): MergeOperation[] {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    
    return changes.sort((a, b) => {
      // 首先按优先级排序
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // 然后按时间戳排序
      return a.timestamp - b.timestamp;
    });
  }

  // 处理批次
  private async processBatch(batch: MergeOperation[], result: MergeResult): Promise<void> {
    const promises = batch.map(operation => this.processOperation(operation, result));
    await Promise.allSettled(promises);
  }

  // 处理单个操作
  private async processOperation(operation: MergeOperation, result: MergeResult): Promise<void> {
    try {
      // 获取服务器端数据
      const serverData = await this.fetchServerData(operation.type, operation.localData);

      if (serverData === null) {
        // 服务器端没有数据，直接推送本地数据
        await this.pushToServer(operation);
        await this.changeTracker.markChangeAsMerged(operation.id);
        result.stats.successful++;
        return;
      }

      // 检测冲突
      const conflictDetection = conflictResolver.detectConflict(
        operation.localData,
        serverData,
        operation.type
      );

      if (conflictDetection.hasConflict) {
        // 有冲突，记录并尝试自动解决
        const conflictId = `merge-conflict-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        result.conflicts.push({
          id: conflictId,
          type: operation.type,
          localData: operation.localData,
          serverData
        });

        // 尝试自动解决冲突
        const resolution = await conflictResolver.resolveConflict(
          operation.localData,
          serverData,
          'last-write-wins', // 默认策略
          operation.type,
          conflictId
        );

        // 应用解决方案
        await this.applyMergedData(operation.type, resolution.resolvedData);
        await this.pushToServer({
          ...operation,
          localData: resolution.resolvedData
        });

        await this.changeTracker.markChangeAsMerged(operation.id);
        result.stats.conflicts++;
        result.stats.successful++;

      } else {
        // 无冲突，直接合并
        const mergedData = await this.mergeData(operation.localData, serverData, operation.type);
        
        await this.applyMergedData(operation.type, mergedData);
        await this.pushToServer({
          ...operation,
          localData: mergedData
        });

        await this.changeTracker.markChangeAsMerged(operation.id);
        result.stats.successful++;
      }

    } catch (error) {
      console.error(`Failed to process operation ${operation.id}:`, error);
      
      // 增加重试计数
      operation.retryCount++;
      
      if (operation.retryCount >= 3) {
        // 达到最大重试次数，记录错误
        result.errors.push({
          operation,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.stats.failed++;
        
        // 从队列中移除
        await this.changeTracker.markChangeAsMerged(operation.id);
      }
    }
  }

  // 获取服务器数据
  private async fetchServerData(type: string, localData: any): Promise<any> {
    try {
      let endpoint = '';
      let params = '';

      switch (type) {
        case 'reading-progress':
          endpoint = '/api/sync/reading-progress';
          params = `?novelId=${localData.novelId}`;
          break;
        case 'user-preferences':
          endpoint = '/api/sync/user-preferences';
          break;
        case 'bookmark':
          endpoint = `/api/sync/bookmarks/${localData.id}`;
          break;
        case 'novel-metadata':
          endpoint = `/api/sync/novel-metadata/${localData.novelId}`;
          break;
        default:
          throw new Error(`Unknown data type: ${type}`);
      }

      const response = await fetch(`${endpoint}${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth-token') || ''}`
        }
      });

      if (response.status === 404) {
        return null; // 服务器端没有数据
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      console.error('Failed to fetch server data:', error);
      throw error;
    }
  }

  // 推送到服务器
  private async pushToServer(operation: MergeOperation): Promise<void> {
    try {
      let endpoint = '';
      let method = 'POST';

      switch (operation.type) {
        case 'reading-progress':
          endpoint = '/api/sync/reading-progress';
          method = 'PUT';
          break;
        case 'user-preferences':
          endpoint = '/api/sync/user-preferences';
          method = 'PUT';
          break;
        case 'bookmark':
          endpoint = '/api/sync/bookmarks';
          method = operation.action === 'delete' ? 'DELETE' : 'POST';
          if (operation.action === 'delete') {
            endpoint += `/${operation.localData.id}`;
          }
          break;
        case 'novel-metadata':
          endpoint = '/api/sync/novel-metadata';
          method = 'PUT';
          break;
        default:
          throw new Error(`Unknown data type: ${operation.type}`);
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth-token') || ''}`
        },
        body: operation.action !== 'delete' ? JSON.stringify(operation.localData) : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`Successfully pushed ${operation.type} to server`);

    } catch (error) {
      console.error('Failed to push to server:', error);
      throw error;
    }
  }

  // 合并数据
  private async mergeData(localData: any, serverData: any, type: string): Promise<any> {
    // 使用冲突解决器的字段合并策略
    const resolution = await conflictResolver.resolveConflict(
      localData,
      serverData,
      'merge-fields',
      type
    );

    return resolution.resolvedData;
  }

  // 应用合并后的数据
  private async applyMergedData(type: string, mergedData: any): Promise<void> {
    switch (type) {
      case 'reading-progress':
        await offlineStorageManager.saveReadingProgress(mergedData);
        break;
      case 'user-preferences':
        for (const [key, value] of Object.entries(mergedData)) {
          if (key !== 'lastModified') {
            await offlineStorageManager.saveUserPreference(key, value);
          }
        }
        break;
      case 'bookmark':
        await offlineStorageManager.saveBookmark(mergedData);
        break;
      case 'novel-metadata':
        // 这里需要实现小说元数据的保存逻辑
        console.log('Novel metadata merge not implemented yet');
        break;
    }
  }

  // 清理已合并的变更
  private async cleanupMergedChanges(result: MergeResult): Promise<void> {
    // 清理成功合并的变更已经在processOperation中处理
    // 这里可以进行额外的清理工作
    
    // 清理旧的合并历史
    if (this.mergeHistory.length > this.maxHistorySize) {
      this.mergeHistory = this.mergeHistory.slice(-this.maxHistorySize);
    }
  }

  // 通知冲突检测
  private notifyConflictsDetected(conflicts: Array<{ id: string; type: string; localData: any; serverData: any }>): void {
    window.dispatchEvent(new CustomEvent('offline-online-conflicts-detected', {
      detail: { conflicts, timestamp: Date.now() }
    }));

    // 显示用户通知
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('数据同步冲突', {
        body: `检测到 ${conflicts.length} 个数据冲突，请查看并解决。`,
        icon: '/icon-192x192.png'
      });
    }
  }

  // 添加到合并历史
  private addToMergeHistory(result: MergeResult): void {
    this.mergeHistory.push({
      ...result,
      // 不保存完整数据，只保存统计信息
      mergedData: undefined
    });

    // 保存到localStorage供调试使用
    localStorage.setItem('merge-history', JSON.stringify(this.mergeHistory.slice(-10)));
  }

  // 获取合并历史
  getMergeHistory(): MergeResult[] {
    return [...this.mergeHistory];
  }

  // 获取合并状态
  isMergeInProgress(): boolean {
    return this.mergeInProgress;
  }

  // 手动触发合并
  async triggerMerge(): Promise<MergeResult> {
    return this.mergeOfflineChanges();
  }

  // 获取待合并的变更数量
  async getPendingChangesCount(): Promise<number> {
    const changes = await this.changeTracker.getOfflineChanges();
    return changes.length;
  }
}

// IndexedDB变更跟踪器实现
class IndexedDBChangeTracker implements OfflineChangeTracker {
  async trackChange(type: string, action: string, data: any): Promise<void> {
    const change: MergeOperation = {
      id: `change-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: type as any,
      action: action as any,
      localData: data,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
      priority: this.determinePriority(type, action)
    };

    // 保存到离线存储
    await offlineStorageManager.addToSyncQueue(change);

    // 通知变更
    localStorage.setItem('offline-changes-updated', Date.now().toString());
  }

  async getOfflineChanges(): Promise<MergeOperation[]> {
    const syncQueue = await offlineStorageManager.getSyncQueue();
    return syncQueue.map(item => ({
      id: item.id?.toString() || `item-${Date.now()}`,
      type: item.type,
      action: item.action,
      localData: item.data,
      timestamp: item.timestamp,
      status: 'pending' as const,
      retryCount: item.retryCount,
      priority: item.priority
    }));
  }

  async clearOfflineChanges(): Promise<void> {
    await offlineStorageManager.clearSyncQueue();
  }

  async markChangeAsMerged(changeId: string): Promise<void> {
    const changeIdNum = parseInt(changeId.replace('change-', '').split('-')[0]);
    if (!isNaN(changeIdNum)) {
      await offlineStorageManager.removeSyncQueueItem(changeIdNum);
    }
  }

  private determinePriority(type: string, action: string): 'high' | 'medium' | 'low' {
    if (type === 'reading-progress') return 'high';
    if (type === 'bookmark' && action === 'create') return 'high';
    if (type === 'user-preferences') return 'medium';
    return 'low';
  }
}

// 单例实例
export const offlineOnlineMerger = new OfflineOnlineMerger();
export default OfflineOnlineMerger;