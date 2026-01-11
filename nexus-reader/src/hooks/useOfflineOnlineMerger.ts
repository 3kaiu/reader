import { useState, useEffect, useCallback } from 'react';
import { offlineOnlineMerger, MergeResult } from '../utils/offlineOnlineMerger';

interface MergerState {
  isMerging: boolean;
  pendingChanges: number;
  lastMergeTime: number | null;
  mergeHistory: MergeResult[];
  mergeError: string | null;
  conflictsDetected: Array<{
    id: string;
    type: string;
    localData: any;
    serverData: any;
  }>;
}

interface MergerActions {
  triggerMerge: () => Promise<MergeResult | null>;
  clearMergeHistory: () => void;
  dismissConflicts: () => void;
  refreshPendingChanges: () => Promise<void>;
}

export const useOfflineOnlineMerger = (): MergerState & MergerActions => {
  const [state, setState] = useState<MergerState>({
    isMerging: false,
    pendingChanges: 0,
    lastMergeTime: null,
    mergeHistory: [],
    mergeError: null,
    conflictsDetected: []
  });

  // 初始化
  useEffect(() => {
    initializeMerger();
    setupEventListeners();
    
    return () => {
      cleanupEventListeners();
    };
  }, []);

  // 定期检查待合并变更
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) {
        refreshPendingChanges();
      }
    }, 30000); // 每30秒检查一次

    return () => clearInterval(interval);
  }, []);

  // 初始化合并器
  const initializeMerger = useCallback(async () => {
    try {
      // 获取初始状态
      const pendingCount = await offlineOnlineMerger.getPendingChangesCount();
      const history = offlineOnlineMerger.getMergeHistory();
      const lastMerge = history.length > 0 ? history[history.length - 1] : null;

      setState(prev => ({
        ...prev,
        pendingChanges: pendingCount,
        mergeHistory: history,
        lastMergeTime: lastMerge ? lastMerge.stats.duration : null
      }));

      // 如果有待合并的变更且在线，自动触发合并
      if (pendingCount > 0 && navigator.onLine) {
        triggerMerge();
      }

    } catch (error) {
      console.error('Failed to initialize merger:', error);
      setState(prev => ({
        ...prev,
        mergeError: error instanceof Error ? error.message : 'Initialization failed'
      }));
    }
  }, []);

  // 设置事件监听器
  const setupEventListeners = useCallback(() => {
    // 监听网络状态变化
    const handleOnline = () => {
      setState(prev => ({ ...prev, mergeError: null }));
      refreshPendingChanges();
    };

    const handleOffline = () => {
      setState(prev => ({
        ...prev,
        isMerging: false,
        mergeError: 'Network offline'
      }));
    };

    // 监听冲突检测
    const handleConflictsDetected = (event: CustomEvent) => {
      const { conflicts } = event.detail;
      setState(prev => ({
        ...prev,
        conflictsDetected: [...prev.conflictsDetected, ...conflicts]
      }));
    };

    // 监听页面可见性变化
    const handleVisibilityChange = () => {
      if (!document.hidden && navigator.onLine) {
        refreshPendingChanges();
      }
    };

    // 监听存储变化
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'offline-changes-updated') {
        refreshPendingChanges();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-online-conflicts-detected', handleConflictsDetected as EventListener);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorageChange);

    // 保存清理函数
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-online-conflicts-detected', handleConflictsDetected as EventListener);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // 清理事件监听器
  const cleanupEventListeners = useCallback(() => {
    // 事件监听器的清理在setupEventListeners的返回函数中处理
  }, []);

  // 触发合并
  const triggerMerge = useCallback(async (): Promise<MergeResult | null> => {
    if (!navigator.onLine) {
      setState(prev => ({
        ...prev,
        mergeError: 'Cannot merge while offline'
      }));
      return null;
    }

    if (offlineOnlineMerger.isMergeInProgress()) {
      console.log('Merge already in progress');
      return null;
    }

    setState(prev => ({
      ...prev,
      isMerging: true,
      mergeError: null
    }));

    try {
      const result = await offlineOnlineMerger.triggerMerge();
      
      setState(prev => ({
        ...prev,
        isMerging: false,
        lastMergeTime: Date.now(),
        mergeHistory: [...prev.mergeHistory, result],
        pendingChanges: 0, // 合并后应该没有待处理的变更
        mergeError: result.success ? null : `Merge completed with ${result.errors.length} errors`
      }));

      // 如果有冲突，添加到状态中
      if (result.conflicts.length > 0) {
        setState(prev => ({
          ...prev,
          conflictsDetected: [...prev.conflictsDetected, ...result.conflicts]
        }));
      }

      console.log('Merge completed:', result.stats);
      return result;

    } catch (error) {
      console.error('Merge failed:', error);
      
      setState(prev => ({
        ...prev,
        isMerging: false,
        mergeError: error instanceof Error ? error.message : 'Merge failed'
      }));

      return null;
    }
  }, []);

  // 刷新待合并变更数量
  const refreshPendingChanges = useCallback(async (): Promise<void> => {
    try {
      const pendingCount = await offlineOnlineMerger.getPendingChangesCount();
      
      setState(prev => ({
        ...prev,
        pendingChanges: pendingCount
      }));

      // 如果有待合并的变更且在线且不在合并中，自动触发合并
      if (pendingCount > 0 && navigator.onLine && !offlineOnlineMerger.isMergeInProgress()) {
        // 延迟触发以避免频繁合并
        setTimeout(() => {
          triggerMerge();
        }, 2000);
      }

    } catch (error) {
      console.error('Failed to refresh pending changes:', error);
    }
  }, [triggerMerge]);

  // 清空合并历史
  const clearMergeHistory = useCallback(() => {
    setState(prev => ({
      ...prev,
      mergeHistory: []
    }));

    // 清空localStorage中的历史
    localStorage.removeItem('merge-history');
  }, []);

  // 忽略冲突
  const dismissConflicts = useCallback(() => {
    setState(prev => ({
      ...prev,
      conflictsDetected: []
    }));
  }, []);

  return {
    ...state,
    triggerMerge,
    clearMergeHistory,
    dismissConflicts,
    refreshPendingChanges
  };
};

// 合并统计信息的格式化函数
export const formatMergeStats = (stats: MergeResult['stats']): string => {
  const { totalOperations, successful, failed, conflicts, duration } = stats;
  
  if (totalOperations === 0) {
    return '没有需要合并的变更';
  }

  const parts = [];
  
  if (successful > 0) {
    parts.push(`${successful} 个成功`);
  }
  
  if (conflicts > 0) {
    parts.push(`${conflicts} 个冲突已解决`);
  }
  
  if (failed > 0) {
    parts.push(`${failed} 个失败`);
  }

  const timeStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;
  
  return `合并完成：${parts.join('，')}，耗时 ${timeStr}`;
};

// 冲突严重程度的描述
export const getConflictSeverityDescription = (conflictsCount: number): string => {
  if (conflictsCount === 0) return '无冲突';
  if (conflictsCount <= 2) return '轻微冲突';
  if (conflictsCount <= 5) return '中等冲突';
  return '严重冲突';
};

// 合并状态的颜色指示
export const getMergeStatusColor = (
  isMerging: boolean,
  pendingChanges: number,
  conflictsCount: number,
  hasError: boolean
): string => {
  if (hasError) return 'red';
  if (isMerging) return 'blue';
  if (conflictsCount > 0) return 'orange';
  if (pendingChanges > 0) return 'yellow';
  return 'green';
};