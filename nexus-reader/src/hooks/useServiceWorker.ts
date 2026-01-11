import { useState, useEffect, useCallback } from 'react';

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isUpdateAvailable: boolean;
  isUpdating: boolean;
  registration: ServiceWorkerRegistration | null;
  controller: ServiceWorker | null;
  error: string | null;
  lastUpdateCheck: number | null;
  updateSize: number | null;
}

interface ServiceWorkerActions {
  registerServiceWorker: () => Promise<boolean>;
  updateApp: () => Promise<boolean>;
  skipUpdate: () => void;
  checkForUpdates: () => Promise<boolean>;
  unregisterServiceWorker: () => Promise<boolean>;
}

const SW_CONFIG = {
  swUrl: '/sw.js',
  scope: '/',
  updateCheckInterval: 60000, // 1分钟检查一次更新
  maxUpdateRetries: 3,
  updateTimeout: 30000 // 30秒更新超时
};

export const useServiceWorker = (): ServiceWorkerState & ServiceWorkerActions => {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: 'serviceWorker' in navigator,
    isRegistered: false,
    isUpdateAvailable: false,
    isUpdating: false,
    registration: null,
    controller: null,
    error: null,
    lastUpdateCheck: null,
    updateSize: null
  });

  // 注册Service Worker
  const registerServiceWorker = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      console.warn('Service Worker not supported');
      return false;
    }

    try {
      console.log('Registering Service Worker...');
      
      const registration = await navigator.serviceWorker.register(SW_CONFIG.swUrl, {
        scope: SW_CONFIG.scope,
        updateViaCache: 'none' // 总是检查SW文件更新
      });

      console.log('Service Worker registered successfully:', registration);

      setState(prev => ({
        ...prev,
        isRegistered: true,
        registration,
        controller: navigator.serviceWorker.controller,
        error: null
      }));

      // 设置更新监听器
      setupUpdateListeners(registration);
      
      // 立即检查更新
      await checkForUpdates();

      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Registration failed',
        isRegistered: false
      }));

      return false;
    }
  }, [state.isSupported]);

  // 设置更新监听器
  const setupUpdateListeners = useCallback((registration: ServiceWorkerRegistration) => {
    // 监听新的Service Worker安装
    registration.addEventListener('updatefound', () => {
      console.log('New Service Worker found');
      
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        console.log('New Service Worker state:', newWorker.state);
        
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // 有新版本可用
            console.log('New version available');
            setState(prev => ({
              ...prev,
              isUpdateAvailable: true
            }));
            
            // 估算更新大小
            estimateUpdateSize();
          } else {
            // 首次安装
            console.log('Service Worker installed for the first time');
          }
        }
      });
    });

    // 监听Service Worker控制器变化
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('Service Worker controller changed');
      
      setState(prev => ({
        ...prev,
        controller: navigator.serviceWorker.controller,
        isUpdating: false
      }));

      // 刷新页面以使用新的Service Worker
      if (state.isUpdating) {
        window.location.reload();
      }
    });

    // 监听Service Worker消息
    navigator.serviceWorker.addEventListener('message', (event) => {
      handleServiceWorkerMessage(event);
    });
  }, [state.isUpdating]);

  // 处理Service Worker消息
  const handleServiceWorkerMessage = useCallback((event: MessageEvent) => {
    const { type, payload } = event.data;
    
    switch (type) {
      case 'CACHE_UPDATED':
        console.log('Cache updated:', payload);
        break;
        
      case 'OFFLINE_READY':
        console.log('App ready for offline use');
        break;
        
      case 'UPDATE_PROGRESS':
        console.log('Update progress:', payload);
        setState(prev => ({
          ...prev,
          updateSize: payload.size
        }));
        break;
        
      case 'UPDATE_ERROR':
        console.error('Update error:', payload);
        setState(prev => ({
          ...prev,
          error: payload.message,
          isUpdating: false
        }));
        break;
        
      default:
        console.log('Unknown SW message:', type, payload);
    }
  }, []);

  // 估算更新大小
  const estimateUpdateSize = useCallback(async () => {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const usedSize = estimate.usage || 0;
        
        // 估算更新可能需要的额外空间（通常是当前使用量的10-20%）
        const estimatedUpdateSize = Math.floor(usedSize * 0.15);
        
        setState(prev => ({
          ...prev,
          updateSize: estimatedUpdateSize
        }));
      }
    } catch (error) {
      console.warn('Failed to estimate update size:', error);
    }
  }, []);

  // 检查更新
  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    if (!state.registration) {
      console.warn('No Service Worker registration found');
      return false;
    }

    try {
      console.log('Checking for Service Worker updates...');
      
      setState(prev => ({
        ...prev,
        lastUpdateCheck: Date.now()
      }));

      await state.registration.update();
      
      // 检查是否有等待中的Service Worker
      if (state.registration.waiting) {
        setState(prev => ({
          ...prev,
          isUpdateAvailable: true
        }));
        return true;
      }

      return false;
    } catch (error) {
      console.error('Update check failed:', error);
      
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Update check failed'
      }));

      return false;
    }
  }, [state.registration]);

  // 应用更新
  const updateApp = useCallback(async (): Promise<boolean> => {
    if (!state.registration || !state.registration.waiting) {
      console.warn('No update available');
      return false;
    }

    try {
      console.log('Applying Service Worker update...');
      
      setState(prev => ({
        ...prev,
        isUpdating: true,
        error: null
      }));

      // 向等待中的Service Worker发送跳过等待消息
      state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

      // 设置更新超时
      const updateTimeout = setTimeout(() => {
        console.error('Update timeout');
        setState(prev => ({
          ...prev,
          error: 'Update timeout',
          isUpdating: false
        }));
      }, SW_CONFIG.updateTimeout);

      // 等待控制器变化
      return new Promise((resolve) => {
        const handleControllerChange = () => {
          clearTimeout(updateTimeout);
          navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
          
          setState(prev => ({
            ...prev,
            isUpdateAvailable: false,
            isUpdating: false
          }));

          resolve(true);
        };

        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      });
    } catch (error) {
      console.error('Update failed:', error);
      
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Update failed',
        isUpdating: false
      }));

      return false;
    }
  }, [state.registration]);

  // 跳过更新
  const skipUpdate = useCallback(() => {
    console.log('Skipping Service Worker update');
    
    setState(prev => ({
      ...prev,
      isUpdateAvailable: false
    }));

    // 记录跳过更新的时间
    localStorage.setItem('sw-update-skipped', Date.now().toString());
  }, []);

  // 注销Service Worker
  const unregisterServiceWorker = useCallback(async (): Promise<boolean> => {
    if (!state.registration) {
      console.warn('No Service Worker registration to unregister');
      return false;
    }

    try {
      console.log('Unregistering Service Worker...');
      
      const success = await state.registration.unregister();
      
      if (success) {
        setState(prev => ({
          ...prev,
          isRegistered: false,
          registration: null,
          controller: null,
          isUpdateAvailable: false,
          error: null
        }));

        console.log('Service Worker unregistered successfully');
      }

      return success;
    } catch (error) {
      console.error('Service Worker unregistration failed:', error);
      
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unregistration failed'
      }));

      return false;
    }
  }, [state.registration]);

  // 初始化Service Worker
  useEffect(() => {
    if (state.isSupported) {
      registerServiceWorker();
    }
  }, [state.isSupported, registerServiceWorker]);

  // 定期检查更新
  useEffect(() => {
    if (!state.isRegistered) return;

    const updateCheckInterval = setInterval(() => {
      checkForUpdates();
    }, SW_CONFIG.updateCheckInterval);

    return () => clearInterval(updateCheckInterval);
  }, [state.isRegistered, checkForUpdates]);

  // 监听页面可见性变化，在页面重新可见时检查更新
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && state.isRegistered) {
        checkForUpdates();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state.isRegistered, checkForUpdates]);

  return {
    ...state,
    registerServiceWorker,
    updateApp,
    skipUpdate,
    checkForUpdates,
    unregisterServiceWorker
  };
};