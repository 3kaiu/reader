/**
 * React Hook for KV Storage Management
 * 
 * Provides easy integration with the KV Storage Manager for React components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  KVStorageManager, 
  StorageUsage, 
  StorageMetrics, 
  CleanupResult,
  KVStorageConfig 
} from '../utils/kvStorageManager';

export interface UseKVStorageManagerOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableRealTimeUpdates?: boolean;
}

export interface KVStorageManagerState {
  usage: StorageUsage | null;
  metrics: StorageMetrics | null;
  isLoading: boolean;
  error: string | null;
  lastCleanup: CleanupResult | null;
}

export function useKVStorageManager(
  config?: Partial<KVStorageConfig>,
  options: UseKVStorageManagerOptions = {}
) {
  const {
    autoRefresh = true,
    refreshInterval = 60000, // 1 minute
    enableRealTimeUpdates = true
  } = options;

  const [state, setState] = useState<KVStorageManagerState>({
    usage: null,
    metrics: null,
    isLoading: true,
    error: null,
    lastCleanup: null
  });

  const managerRef = useRef<KVStorageManager | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize storage manager
  useEffect(() => {
    managerRef.current = new KVStorageManager(config);
    
    // Initial load
    loadStorageData();

    return () => {
      if (managerRef.current) {
        managerRef.current.destroy();
      }
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  // Setup auto refresh
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      refreshTimerRef.current = setInterval(() => {
        loadStorageData();
      }, refreshInterval);

      return () => {
        if (refreshTimerRef.current) {
          clearInterval(refreshTimerRef.current);
        }
      };
    }
  }, [autoRefresh, refreshInterval]);

  const loadStorageData = useCallback(async () => {
    if (!managerRef.current) return;

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const [usage, metrics] = await Promise.all([
        managerRef.current.getStorageUsage(),
        managerRef.current.getStorageMetrics()
      ]);

      setState(prev => ({
        ...prev,
        usage,
        metrics,
        isLoading: false
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load storage data',
        isLoading: false
      }));
    }
  }, []);

  const performCleanup = useCallback(async (): Promise<CleanupResult | null> => {
    if (!managerRef.current) return null;

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const result = await managerRef.current.performCleanup();
      
      setState(prev => ({
        ...prev,
        lastCleanup: result,
        isLoading: false
      }));

      // Refresh data after cleanup
      await loadStorageData();

      return result;

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Cleanup failed',
        isLoading: false
      }));
      return null;
    }
  }, [loadStorageData]);

  const checkStorageHealth = useCallback(async () => {
    if (!managerRef.current) return null;

    try {
      return await managerRef.current.checkStorageHealth();
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Health check failed'
      }));
      return null;
    }
  }, []);

  const optimizeStorage = useCallback(async () => {
    if (!managerRef.current) return null;

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const result = await managerRef.current.optimizeStorage();
      
      setState(prev => ({ ...prev, isLoading: false }));

      // Refresh data after optimization
      await loadStorageData();

      return result;

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Storage optimization failed',
        isLoading: false
      }));
      return null;
    }
  }, [loadStorageData]);

  const refreshData = useCallback(() => {
    loadStorageData();
  }, [loadStorageData]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Computed values
  const isStorageHealthy = state.usage ? state.usage.usagePercentage < 0.8 : true;
  const isStorageCritical = state.usage ? state.usage.usagePercentage >= 0.95 : false;
  const storagePercentage = state.usage ? Math.round(state.usage.usagePercentage * 100) : 0;

  return {
    // State
    ...state,
    
    // Computed values
    isStorageHealthy,
    isStorageCritical,
    storagePercentage,
    
    // Actions
    performCleanup,
    checkStorageHealth,
    optimizeStorage,
    refreshData,
    clearError,
    
    // Manager instance (for advanced usage)
    manager: managerRef.current
  };
}

export default useKVStorageManager;