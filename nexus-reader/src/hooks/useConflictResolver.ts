import { useState, useEffect, useCallback } from 'react';
import { conflictResolver, ConflictData, ConflictResolution, ConflictResolutionStrategy } from '../utils/conflictResolver';

interface ConflictResolverState {
  pendingConflicts: ConflictData[];
  conflictHistory: ConflictData[];
  isResolving: boolean;
  resolutionError: string | null;
}

interface ConflictResolverActions {
  resolveConflict: (conflictId: string, strategy: ConflictResolutionStrategy) => Promise<boolean>;
  resolveConflictManually: (conflictId: string, resolvedData: any) => Promise<boolean>;
  dismissConflict: (conflictId: string) => void;
  clearConflictHistory: () => void;
  refreshConflicts: () => void;
}

export const useConflictResolver = (): ConflictResolverState & ConflictResolverActions => {
  const [state, setState] = useState<ConflictResolverState>({
    pendingConflicts: [],
    conflictHistory: [],
    isResolving: false,
    resolutionError: null
  });

  // 初始化冲突数据
  useEffect(() => {
    loadConflicts();
    
    // 监听冲突事件
    const handleConflictDetected = (event: CustomEvent) => {
      const conflict = event.detail as ConflictData;
      setState(prev => ({
        ...prev,
        pendingConflicts: [...prev.pendingConflicts, conflict]
      }));
    };

    const handleConflictResolved = (event: CustomEvent) => {
      const { conflictId } = event.detail;
      setState(prev => ({
        ...prev,
        pendingConflicts: prev.pendingConflicts.filter(c => c.id !== conflictId)
      }));
      loadConflicts(); // 重新加载以更新历史记录
    };

    window.addEventListener('sync-conflict-detected', handleConflictDetected as EventListener);
    window.addEventListener('sync-conflict-resolved', handleConflictResolved as EventListener);

    return () => {
      window.removeEventListener('sync-conflict-detected', handleConflictDetected as EventListener);
      window.removeEventListener('sync-conflict-resolved', handleConflictResolved as EventListener);
    };
  }, []);

  // 加载冲突数据
  const loadConflicts = useCallback(() => {
    const pending = conflictResolver.getPendingConflicts();
    const history = conflictResolver.getConflictHistory();

    setState(prev => ({
      ...prev,
      pendingConflicts: pending,
      conflictHistory: history
    }));
  }, []);

  // 解决冲突
  const resolveConflict = useCallback(async (
    conflictId: string,
    strategy: ConflictResolutionStrategy
  ): Promise<boolean> => {
    setState(prev => ({ ...prev, isResolving: true, resolutionError: null }));

    try {
      const conflict = state.pendingConflicts.find(c => c.id === conflictId);
      if (!conflict) {
        throw new Error('Conflict not found');
      }

      // 使用冲突解决器解决冲突
      const resolution = await conflictResolver.resolveConflict(
        conflict.localData,
        conflict.serverData,
        strategy,
        conflict.type,
        conflictId
      );

      // 应用解决方案
      await applyResolution(conflict, resolution);

      // 标记为已解决
      conflictResolver.markConflictResolved(conflictId, resolution);

      setState(prev => ({
        ...prev,
        isResolving: false,
        pendingConflicts: prev.pendingConflicts.filter(c => c.id !== conflictId)
      }));

      return true;
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      setState(prev => ({
        ...prev,
        isResolving: false,
        resolutionError: error instanceof Error ? error.message : 'Resolution failed'
      }));
      return false;
    }
  }, [state.pendingConflicts]);

  // 手动解决冲突
  const resolveConflictManually = useCallback(async (
    conflictId: string,
    resolvedData: any
  ): Promise<boolean> => {
    setState(prev => ({ ...prev, isResolving: true, resolutionError: null }));

    try {
      const conflict = state.pendingConflicts.find(c => c.id === conflictId);
      if (!conflict) {
        throw new Error('Conflict not found');
      }

      const resolution: ConflictResolution = {
        strategy: 'manual',
        resolvedData,
        winner: 'merged',
        timestamp: Date.now(),
        metadata: { manuallyResolved: true }
      };

      // 应用解决方案
      await applyResolution(conflict, resolution);

      // 标记为已解决
      conflictResolver.markConflictResolved(conflictId, resolution);

      setState(prev => ({
        ...prev,
        isResolving: false,
        pendingConflicts: prev.pendingConflicts.filter(c => c.id !== conflictId)
      }));

      return true;
    } catch (error) {
      console.error('Failed to resolve conflict manually:', error);
      setState(prev => ({
        ...prev,
        isResolving: false,
        resolutionError: error instanceof Error ? error.message : 'Manual resolution failed'
      }));
      return false;
    }
  }, [state.pendingConflicts]);

  // 应用解决方案
  const applyResolution = async (conflict: ConflictData, resolution: ConflictResolution): Promise<void> => {
    const { offlineStorageManager } = await import('../utils/offlineStorageManager');

    switch (conflict.type) {
      case 'reading-progress':
        await offlineStorageManager.saveReadingProgress(resolution.resolvedData);
        break;

      case 'user-preferences':
        const prefs = resolution.resolvedData;
        for (const [key, value] of Object.entries(prefs)) {
          if (key !== 'lastModified') {
            await offlineStorageManager.saveUserPreference(key, value);
          }
        }
        break;

      case 'bookmark':
        await offlineStorageManager.saveBookmark(resolution.resolvedData);
        break;

      case 'novel-metadata':
        // 这里需要实现小说元数据的保存逻辑
        console.log('Novel metadata resolution not implemented yet');
        break;

      default:
        throw new Error(`Unknown conflict type: ${conflict.type}`);
    }

    // 同步到服务器
    await syncResolvedData(conflict.type, resolution.resolvedData);
  };

  // 同步已解决的数据到服务器
  const syncResolvedData = async (type: string, data: any): Promise<void> => {
    try {
      let endpoint = '';
      switch (type) {
        case 'reading-progress':
          endpoint = '/api/sync/reading-progress';
          break;
        case 'user-preferences':
          endpoint = '/api/sync/user-preferences';
          break;
        case 'bookmark':
          endpoint = '/api/sync/bookmarks';
          break;
        case 'novel-metadata':
          endpoint = '/api/sync/novel-metadata';
          break;
        default:
          throw new Error(`Unknown sync type: ${type}`);
      }

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth-token') || ''}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`Resolved data synced to server: ${type}`);
    } catch (error) {
      console.error('Failed to sync resolved data:', error);
      // 不抛出错误，因为本地已经解决了冲突
    }
  };

  // 忽略冲突
  const dismissConflict = useCallback((conflictId: string) => {
    const resolution: ConflictResolution = {
      strategy: 'server-wins',
      resolvedData: null,
      winner: 'server',
      timestamp: Date.now(),
      metadata: { dismissed: true }
    };

    conflictResolver.markConflictResolved(conflictId, resolution);

    setState(prev => ({
      ...prev,
      pendingConflicts: prev.pendingConflicts.filter(c => c.id !== conflictId)
    }));
  }, []);

  // 清空冲突历史
  const clearConflictHistory = useCallback(() => {
    conflictResolver.cleanupOldConflicts(0); // 清空所有历史
    setState(prev => ({
      ...prev,
      conflictHistory: []
    }));
  }, []);

  // 刷新冲突数据
  const refreshConflicts = useCallback(() => {
    loadConflicts();
  }, [loadConflicts]);

  return {
    ...state,
    resolveConflict,
    resolveConflictManually,
    dismissConflict,
    clearConflictHistory,
    refreshConflicts
  };
};

// 冲突解决策略的用户友好描述
export const getStrategyDescription = (strategy: ConflictResolutionStrategy): string => {
  switch (strategy) {
    case 'last-write-wins':
      return '使用最新修改的数据';
    case 'client-wins':
      return '使用本地数据';
    case 'server-wins':
      return '使用服务器数据';
    case 'merge-fields':
      return '智能合并字段';
    case 'manual':
      return '手动解决';
    case 'custom':
      return '自定义策略';
    default:
      return '未知策略';
  }
};

// 冲突类型的用户友好描述
export const getConflictTypeDescription = (type: string): string => {
  switch (type) {
    case 'reading-progress':
      return '阅读进度';
    case 'user-preferences':
      return '用户偏好';
    case 'bookmark':
      return '书签';
    case 'novel-metadata':
      return '小说信息';
    default:
      return '未知类型';
  }
};