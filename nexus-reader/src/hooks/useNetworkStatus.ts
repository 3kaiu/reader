import { useState, useEffect, useCallback } from 'react';

interface NetworkInformation extends EventTarget {
  readonly downlink: number;
  readonly effectiveType: '2g' | '3g' | '4g' | 'slow-2g';
  readonly rtt: number;
  readonly saveData: boolean;
  readonly type: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
}

interface NetworkStatus {
  isOnline: boolean;
  connectionType: string;
  effectiveType: '2g' | '3g' | '4g' | 'slow-2g' | 'unknown';
  downlink: number;
  rtt: number;
  saveData: boolean;
  isSlowConnection: boolean;
  connectionQuality: 'poor' | 'good' | 'excellent';
  lastOnlineTime: number | null;
  lastOfflineTime: number | null;
  connectionHistory: Array<{
    timestamp: number;
    isOnline: boolean;
    connectionType: string;
  }>;
}

interface NetworkActions {
  checkConnection: () => Promise<boolean>;
  getConnectionSpeed: () => Promise<number>;
  optimizeForConnection: () => void;
}

export const useNetworkStatus = (): NetworkStatus & NetworkActions => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(() => {
    const savedHistory = localStorage.getItem('network-history');
    const connectionHistory = savedHistory ? JSON.parse(savedHistory) : [];
    
    return {
      isOnline: navigator.onLine,
      connectionType: 'unknown',
      effectiveType: 'unknown' as const,
      downlink: 0,
      rtt: 0,
      saveData: false,
      isSlowConnection: false,
      connectionQuality: 'good' as const,
      lastOnlineTime: navigator.onLine ? Date.now() : null,
      lastOfflineTime: !navigator.onLine ? Date.now() : null,
      connectionHistory
    };
  });

  // 获取网络信息
  const getNetworkInformation = useCallback((): Partial<NetworkInformation> => {
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;
    
    if (!connection) {
      return {};
    }

    return {
      downlink: connection.downlink || 0,
      effectiveType: connection.effectiveType || 'unknown',
      rtt: connection.rtt || 0,
      saveData: connection.saveData || false,
      type: connection.type || 'unknown'
    };
  }, []);

  // 评估连接质量
  const assessConnectionQuality = useCallback((
    effectiveType: string,
    downlink: number,
    rtt: number
  ): 'poor' | 'good' | 'excellent' => {
    if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 0.5 || rtt > 2000) {
      return 'poor';
    } else if (effectiveType === '3g' || downlink < 2 || rtt > 1000) {
      return 'good';
    } else {
      return 'excellent';
    }
  }, []);

  // 更新网络状态
  const updateNetworkStatus = useCallback(() => {
    const isOnline = navigator.onLine;
    const networkInfo = getNetworkInformation();
    
    const connectionType = networkInfo.type || 'unknown';
    const effectiveType = networkInfo.effectiveType || 'unknown';
    const downlink = networkInfo.downlink || 0;
    const rtt = networkInfo.rtt || 0;
    const saveData = networkInfo.saveData || false;
    
    const isSlowConnection = effectiveType === 'slow-2g' || 
                           effectiveType === '2g' || 
                           downlink < 1;
    
    const connectionQuality = assessConnectionQuality(effectiveType, downlink, rtt);
    
    setNetworkStatus(prev => {
      const now = Date.now();
      const newHistory = [...prev.connectionHistory];
      
      // 添加新的连接记录
      if (prev.isOnline !== isOnline || prev.connectionType !== connectionType) {
        newHistory.push({
          timestamp: now,
          isOnline,
          connectionType
        });
        
        // 只保留最近100条记录
        if (newHistory.length > 100) {
          newHistory.splice(0, newHistory.length - 100);
        }
        
        // 保存到本地存储
        localStorage.setItem('network-history', JSON.stringify(newHistory));
      }
      
      return {
        ...prev,
        isOnline,
        connectionType,
        effectiveType,
        downlink,
        rtt,
        saveData,
        isSlowConnection,
        connectionQuality,
        lastOnlineTime: isOnline && !prev.isOnline ? now : prev.lastOnlineTime,
        lastOfflineTime: !isOnline && prev.isOnline ? now : prev.lastOfflineTime,
        connectionHistory: newHistory
      };
    });
  }, [getNetworkInformation, assessConnectionQuality]);

  // 检查连接状态
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      // 尝试获取一个小的资源来测试连接
      const response = await fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000) // 5秒超时
      });
      
      return response.ok;
    } catch (error) {
      console.warn('Connection check failed:', error);
      return false;
    }
  }, []);

  // 测量连接速度
  const getConnectionSpeed = useCallback(async (): Promise<number> => {
    try {
      const startTime = performance.now();
      
      // 下载一个小文件来测试速度
      const response = await fetch('/api/speed-test', {
        cache: 'no-cache',
        signal: AbortSignal.timeout(10000) // 10秒超时
      });
      
      if (!response.ok) {
        throw new Error('Speed test request failed');
      }
      
      const data = await response.blob();
      const endTime = performance.now();
      
      const duration = (endTime - startTime) / 1000; // 转换为秒
      const sizeInBits = data.size * 8; // 转换为位
      const speedMbps = (sizeInBits / duration) / (1024 * 1024); // 转换为Mbps
      
      console.log(`Connection speed: ${speedMbps.toFixed(2)} Mbps`);
      return speedMbps;
    } catch (error) {
      console.warn('Speed test failed:', error);
      return 0;
    }
  }, []);

  // 根据连接状况优化应用
  const optimizeForConnection = useCallback(() => {
    const { isSlowConnection, saveData, connectionQuality } = networkStatus;
    
    // 设置全局优化标志
    document.documentElement.setAttribute('data-connection-quality', connectionQuality);
    document.documentElement.setAttribute('data-save-data', saveData.toString());
    
    // 优化图片加载
    if (isSlowConnection || saveData) {
      // 启用低质量图片模式
      document.documentElement.classList.add('low-bandwidth-mode');
      
      // 禁用自动播放
      document.documentElement.classList.add('no-autoplay');
      
      // 减少动画
      document.documentElement.classList.add('reduced-motion');
    } else {
      // 移除优化类
      document.documentElement.classList.remove('low-bandwidth-mode', 'no-autoplay', 'reduced-motion');
    }
    
    // 通知其他组件连接状态变化
    window.dispatchEvent(new CustomEvent('networkoptimization', {
      detail: {
        connectionQuality,
        isSlowConnection,
        saveData,
        optimizations: {
          lowBandwidthMode: isSlowConnection || saveData,
          reducedAnimations: isSlowConnection,
          compressedImages: isSlowConnection || saveData
        }
      }
    }));
  }, [networkStatus]);

  // 监听网络状态变化
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network: Online');
      updateNetworkStatus();
    };

    const handleOffline = () => {
      console.log('Network: Offline');
      updateNetworkStatus();
    };

    const handleConnectionChange = () => {
      console.log('Network: Connection changed');
      updateNetworkStatus();
    };

    // 添加事件监听器
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // 监听连接信息变化
    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    // 初始化网络状态
    updateNetworkStatus();

    // 定期检查连接状态
    const connectionCheckInterval = setInterval(async () => {
      if (navigator.onLine) {
        const isActuallyOnline = await checkConnection();
        if (!isActuallyOnline) {
          // 浏览器认为在线但实际无法连接
          console.warn('Browser reports online but connection check failed');
        }
      }
    }, 30000); // 每30秒检查一次

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
      
      clearInterval(connectionCheckInterval);
    };
  }, [updateNetworkStatus, checkConnection]);

  // 当网络状态变化时优化应用
  useEffect(() => {
    optimizeForConnection();
  }, [networkStatus.connectionQuality, networkStatus.isSlowConnection, networkStatus.saveData, optimizeForConnection]);

  return {
    ...networkStatus,
    checkConnection,
    getConnectionSpeed,
    optimizeForConnection
  };
};