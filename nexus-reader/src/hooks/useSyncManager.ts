import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineStorageManager } from '../utils/offlineStorageManager';
import { conflictResolver, ConflictResolutionStrategy } from '../utils/conflictResolver';
import { secureRandomString } from '../utils/secureRandom';

interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: number | null;
  pendingChanges: number;
  syncProgress: number;
  syncError: string | null;
  syncStats: {
    totalSynced: number;
    totalFailed: number;
    lastSyncDuration: number;
  };
}

interface SyncActions {
  syncNow: () => Promise<boolean>;
  pauseSync: () => void;
  resumeSync: () => void;
  clearSyncQueue: () => Promise<void>;
  retryFailedSync: () => Promise<void>;
}

interface SyncConfig {
  autoSyncEnabled: boolean;
  syncInterval: number; // milliseconds
  maxRetries: number;
  batchSize: number;
  conflictResolution: 'server-wins' | 'client-wins' | 'manual';
}

const DEFAULT_SYNC_CONFIG: SyncConfig = {
  autoSyncEnabled: true,
  syncInterval: 30000, // 30 seconds
  maxRetries: 3,
  batchSize: 10,
  conflictResolution: 'server-wins'
};

export const useSyncManager = (): SyncStatus & SyncActions & { config: SyncConfig; updateConfig: (config: Partial<SyncConfig>) => void } => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    pendingChanges: 0,
    syncProgress: 0,
    syncError: null,
    syncStats: {
      totalSynced: 0,
      totalFailed: 0,
      lastSyncDuration: 0
    }
  });

  const [config, setConfig] = useState<SyncConfig>(() => {
    const savedConfig = localStorage.getItem('sync-config');
    return savedConfig ? { ...DEFAULT_SYNC_CONFIG, ...JSON.parse(savedConfig) } : DEFAULT_SYNC_CONFIG;
  });

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const syncInProgressRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 初始化同步管理器
  useEffect(() => {
    initializeSyncManager();
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 监听网络状态变化
  useEffect(() => {
    const handleOnline = () => {
      if (config.autoSyncEnabled) {
        syncNow();
      }
    };

    const handleOffline = () => {
      pauseSync();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [config.autoSyncEnabled]);

  // 监听页面可见性变化
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && navigator.onLine && config.autoSyncEnabled) {
        syncNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [config.autoSyncEnabled]);

  // 初始化同步管理器
  const initializeSyncManager = useCallback(async () => {
    try {
      // 获取待同步项目数量
      const syncQueue = await offlineStorageManager.getSyncQueue();
      setSyncStatus(prev => ({
        ...prev,
        pendingChanges: syncQueue.length
      }));

      // 恢复上次同步时间
      const lastSyncTime = localStorage.getItem('last-sync-time');
      if (lastSyncTime) {
        setSyncStatus(prev => ({
          ...prev,
          lastSyncTime: parseInt(lastSyncTime)
        }));
      }

      // 启动自动同步
      if (config.autoSyncEnabled && navigator.onLine) {
        startAutoSync();
      }

      console.log('Sync manager initialized');
    } catch (error) {
      console.error('Failed to initialize sync manager:', error);
      setSyncStatus(prev => ({
        ...prev,
        syncError: 'Initialization failed'
      }));
    }
  }, [config.autoSyncEnabled]);

  // 启动自动同步
  const startAutoSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    syncIntervalRef.current = setInterval(() => {
      if (navigator.onLine && !syncInProgressRef.current) {
        syncNow();
      }
    }, config.syncInterval);
  }, [config.syncInterval]);

  // 立即同步
  const syncNow = useCallback(async (): Promise<boolean> => {
    if (syncInProgressRef.current || !navigator.onLine) {
      return false;
    }

    syncInProgressRef.current = true;
    abortControllerRef.current = new AbortController();

    const startTime = Date.now();

    setSyncStatus(prev => ({
      ...prev,
      isSyncing: true,
      syncProgress: 0,
      syncError: null
    }));

    try {
      const syncQueue = await offlineStorageManager.getSyncQueue();

      if (syncQueue.length === 0) {
        setSyncStatus(prev => ({
          ...prev,
          isSyncing: false,
          syncProgress: 100,
          lastSyncTime: Date.now(),
          pendingChanges: 0
        }));

        localStorage.setItem('last-sync-time', Date.now().toString());
        return true;
      }

      let syncedCount = 0;
      let failedCount = 0;
      const totalItems = Math.min(syncQueue.length, config.batchSize);

      // 按批次处理同步项目
      for (let i = 0; i < totalItems; i++) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }

        const item = syncQueue[i];

        try {
          const success = await syncItem(item, abortControllerRef.current.signal);

          if (success) {
            await offlineStorageManager.removeSyncQueueItem(item.id!);
            syncedCount++;
          } else {
            failedCount++;
            // 增加重试计数
            if (item.retryCount < config.maxRetries) {
              await updateSyncItemRetryCount(item.id!, item.retryCount + 1);
            } else {
              // 达到最大重试次数，从队列中移除
              await offlineStorageManager.removeSyncQueueItem(item.id!);
              failedCount++;
            }
          }
        } catch (error) {
          console.error('Sync item failed:', error);
          failedCount++;
        }

        // 更新进度
        const progress = ((i + 1) / totalItems) * 100;
        setSyncStatus(prev => ({
          ...prev,
          syncProgress: progress
        }));
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 更新同步状态
      const remainingQueue = await offlineStorageManager.getSyncQueue();

      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        syncProgress: 100,
        lastSyncTime: endTime,
        pendingChanges: remainingQueue.length,
        syncError: failedCount > 0 ? `${failedCount} items failed to sync` : null,
        syncStats: {
          totalSynced: prev.syncStats.totalSynced + syncedCount,
          totalFailed: prev.syncStats.totalFailed + failedCount,
          lastSyncDuration: duration
        }
      }));

      localStorage.setItem('last-sync-time', endTime.toString());

      console.log(`Sync completed: ${syncedCount} synced, ${failedCount} failed, ${duration}ms`);
      return failedCount === 0;

    } catch (error) {
      console.error('Sync failed:', error);

      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        syncError: error instanceof Error ? error.message : 'Sync failed'
      }));

      return false;
    } finally {
      syncInProgressRef.current = false;
      abortControllerRef.current = null;
    }
  }, [config.batchSize, config.maxRetries]);

  // 同步单个项目
  const syncItem = async (item: any, signal: AbortSignal): Promise<boolean> => {
    try {
      let endpoint = '';
      let method: string;
      let body = item.data;

      switch (item.type) {
        case 'reading-progress':
          endpoint = '/api/sync/reading-progress';
          method = item.action === 'update' ? 'PUT' : 'POST';
          break;
        case 'user-preferences':
          endpoint = '/api/sync/user-preferences';
          method = 'PUT';
          break;
        case 'bookmark':
          endpoint = '/api/sync/bookmarks';
          method = item.action === 'delete' ? 'DELETE' : 'POST';
          if (item.action === 'delete') {
            endpoint += `/${item.data.id}`;
            body = undefined;
          }
          break;
        case 'novel-metadata':
          endpoint = '/api/sync/novel-metadata';
          method = 'PUT';
          break;
        default:
          throw new Error(`Unknown sync type: ${item.type}`);
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: body ? JSON.stringify(body) : undefined,
        signal
      });

      if (!response.ok) {
        if (response.status === 409) {
          // 冲突，需要解决
          await handleSyncConflict(item, await response.json());
          return true; // 冲突已处理，视为成功
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Sync item aborted');
        return false;
      }
      console.error('Failed to sync item:', error);
      return false;
    }
  };

  // 处理同步冲突
  const handleSyncConflict = async (localItem: any, serverData: any): Promise<void> => {
    // 检测冲突
    const conflictDetection = conflictResolver.detectConflict(
      localItem.data,
      serverData,
      localItem.type
    );

    if (conflictDetection.hasConflict) {
      const conflictId = `conflict-${Date.now()}-${secureRandomString(9)}`;

      // 根据配置的冲突解决策略处理
      const resolution = await conflictResolver.resolveConflict(
        localItem.data,
        serverData,
        config.conflictResolution as ConflictResolutionStrategy,
        localItem.type,
        conflictId
      );

      // 应用解决方案
      await applyConflictResolution(localItem.type, resolution.resolvedData);

      console.log(`Conflict resolved using ${config.conflictResolution} strategy:`, resolution);
    } else {
      // 没有冲突，直接应用服务器数据
      await applyServerData(localItem.type, serverData);
    }
  };

  // 应用冲突解决方案
  const applyConflictResolution = async (type: string, resolvedData: any): Promise<void> => {
    switch (type) {
      case 'reading-progress':
        await offlineStorageManager.saveReadingProgress(resolvedData);
        break;
      case 'user-preferences':
        for (const [key, value] of Object.entries(resolvedData)) {
          if (key !== 'lastModified') {
            await offlineStorageManager.saveUserPreference(key, value);
          }
        }
        break;
      case 'bookmark':
        await offlineStorageManager.saveBookmark(resolvedData);
        break;
    }
  };

  // 应用服务器数据
  const applyServerData = async (type: string, serverData: any): Promise<void> => {
    switch (type) {
      case 'reading-progress':
        await offlineStorageManager.saveReadingProgress(serverData);
        break;
      case 'user-preferences':
        await offlineStorageManager.saveUserPreference(serverData.key, serverData.value);
        break;
      case 'bookmark':
        await offlineStorageManager.saveBookmark(serverData);
        break;
    }
  };

  // 更新同步项目重试计数
  const updateSyncItemRetryCount = async (itemId: number, retryCount: number): Promise<void> => {
    // 这里需要实现更新IndexedDB中同步项目的重试计数
    // 由于IndexedDB的限制，我们需要删除旧项目并添加新项目
    console.log(`Updating retry count for item ${itemId} to ${retryCount}`);
  };

  // 获取认证令牌
  const getAuthToken = (): string => {
    return localStorage.getItem('auth-token') || '';
  };

  // 暂停同步
  const pauseSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setSyncStatus(prev => ({
      ...prev,
      isSyncing: false
    }));

    console.log('Sync paused');
  }, []);

  // 恢复同步
  const resumeSync = useCallback(() => {
    if (config.autoSyncEnabled && navigator.onLine) {
      startAutoSync();
      syncNow();
    }
    console.log('Sync resumed');
  }, [config.autoSyncEnabled, startAutoSync, syncNow]);

  // 清空同步队列
  const clearSyncQueue = useCallback(async (): Promise<void> => {
    try {
      await offlineStorageManager.clearSyncQueue();
      setSyncStatus(prev => ({
        ...prev,
        pendingChanges: 0
      }));
      console.log('Sync queue cleared');
    } catch (error) {
      console.error('Failed to clear sync queue:', error);
    }
  }, []);

  // 重试失败的同步
  const retryFailedSync = useCallback(async (): Promise<void> => {
    setSyncStatus(prev => ({
      ...prev,
      syncError: null
    }));

    await syncNow();
  }, [syncNow]);

  // 更新配置
  const updateConfig = useCallback((newConfig: Partial<SyncConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    localStorage.setItem('sync-config', JSON.stringify(updatedConfig));

    // 重启自动同步如果间隔时间改变
    if (newConfig.syncInterval && newConfig.syncInterval !== config.syncInterval) {
      if (updatedConfig.autoSyncEnabled && navigator.onLine) {
        startAutoSync();
      }
    }

    console.log('Sync config updated:', updatedConfig);
  }, [config, startAutoSync]);

  // 监听配置变化
  useEffect(() => {
    if (config.autoSyncEnabled && navigator.onLine) {
      startAutoSync();
    } else {
      pauseSync();
    }
  }, [config.autoSyncEnabled, config.syncInterval, startAutoSync, pauseSync]);

  return {
    ...syncStatus,
    syncNow,
    pauseSync,
    resumeSync,
    clearSyncQueue,
    retryFailedSync,
    config,
    updateConfig
  };
};