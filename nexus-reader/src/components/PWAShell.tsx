import React, { useEffect, useState, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Helmet } from 'react-helmet-async';

// PWA相关hooks和组件
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useServiceWorker } from '../hooks/useServiceWorker';
import { useSyncManager } from '../hooks/useSyncManager';

// 核心组件
import { AppHeader } from './AppHeader';
import { AppNavigation } from './AppNavigation';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorFallback } from './ErrorFallback';
import { OfflineBanner } from './OfflineBanner';
import { UpdateAvailableBanner } from './UpdateAvailableBanner';
import { InstallPrompt } from './InstallPrompt';

// 页面组件 (懒加载)
const HomePage = React.lazy(() => import('../pages/HomePage'));
const LibraryPage = React.lazy(() => import('../pages/LibraryPage'));
const ReadingPage = React.lazy(() => import('../pages/ReadingPage'));
const DiscoverPage = React.lazy(() => import('../pages/DiscoverPage'));
const SettingsPage = React.lazy(() => import('../pages/SettingsPage'));
const OfflinePage = React.lazy(() => import('../pages/OfflinePage'));
const SyncPage = React.lazy(() => import('../pages/SyncPage'));

// PWA Shell配置
const PWA_CONFIG = {
  appName: 'Nexus Reader',
  version: '1.0.0',
  cacheVersion: 'v1',
  offlinePages: [
    '/',
    '/library',
    '/offline',
    '/settings'
  ],
  criticalResources: [
    '/static/css/main.css',
    '/static/js/main.js',
    '/manifest.json'
  ]
};

interface PWAShellProps {
  children?: React.ReactNode;
}

export const PWAShell: React.FC<PWAShellProps> = ({ children }) => {
  // PWA状态管理
  const { isOnline, connectionType } = useNetworkStatus();
  const { 
    canInstall, 
    isInstalled, 
    showInstallPrompt, 
    installApp, 
    dismissInstallPrompt 
  } = usePWAInstall();
  const { 
    isUpdateAvailable, 
    isUpdating, 
    updateApp, 
    skipUpdate 
  } = useServiceWorker();
  const { 
    isSyncing, 
    lastSyncTime, 
    pendingChanges, 
    syncNow 
  } = useSyncManager();

  // 应用状态
  const [isAppReady, setIsAppReady] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 初始化PWA
  useEffect(() => {
    initializePWA();
  }, []);

  // 监听主题变化
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  // 监听全屏状态
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const initializePWA = async () => {
    try {
      // 设置视口元标签
      setupViewport();
      
      // 初始化主题
      const savedTheme = localStorage.getItem('nexus-theme') as 'light' | 'dark' | 'auto' || 'auto';
      setCurrentTheme(savedTheme);
      
      // 预加载关键资源
      await preloadCriticalResources();
      
      // 初始化离线存储
      await initializeOfflineStorage();
      
      // 标记应用就绪
      setIsAppReady(true);
      
      console.log('PWA Shell initialized successfully');
    } catch (error) {
      console.error('PWA initialization failed:', error);
      setIsAppReady(true); // 即使失败也要显示应用
    }
  };

  const setupViewport = () => {
    // 动态设置视口
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      );
    }

    // 设置状态栏样式
    const statusBarMeta = document.createElement('meta');
    statusBarMeta.name = 'apple-mobile-web-app-status-bar-style';
    statusBarMeta.content = 'black-translucent';
    document.head.appendChild(statusBarMeta);
  };

  const applyTheme = (theme: 'light' | 'dark' | 'auto') => {
    const root = document.documentElement;
    
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
    
    // 更新主题色
    const themeColor = theme === 'dark' ? '#1f2937' : '#ffffff';
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeColor);
    }
  };

  const preloadCriticalResources = async () => {
    const preloadPromises = PWA_CONFIG.criticalResources.map(resource => {
      return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = resource;
        
        if (resource.endsWith('.css')) {
          link.as = 'style';
        } else if (resource.endsWith('.js')) {
          link.as = 'script';
        } else {
          link.as = 'fetch';
          link.crossOrigin = 'anonymous';
        }
        
        link.onload = () => resolve(resource);
        link.onerror = () => reject(new Error(`Failed to preload ${resource}`));
        
        document.head.appendChild(link);
      });
    });

    try {
      await Promise.all(preloadPromises);
      console.log('Critical resources preloaded');
    } catch (error) {
      console.warn('Some critical resources failed to preload:', error);
    }
  };

  const initializeOfflineStorage = async () => {
    try {
      // 检查存储配额
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        console.log('Storage quota:', estimate);
      }

      // 初始化IndexedDB
      const dbRequest = indexedDB.open('NexusReaderDB', 1);
      
      dbRequest.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 创建对象存储
        if (!db.objectStoreNames.contains('novels')) {
          const novelStore = db.createObjectStore('novels', { keyPath: 'id' });
          novelStore.createIndex('title', 'title', { unique: false });
          novelStore.createIndex('author', 'author', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('readingProgress')) {
          const progressStore = db.createObjectStore('readingProgress', { keyPath: 'novelId' });
          progressStore.createIndex('lastRead', 'lastRead', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('userPreferences')) {
          db.createObjectStore('userPreferences', { keyPath: 'key' });
        }
        
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      return new Promise((resolve, reject) => {
        dbRequest.onsuccess = () => {
          console.log('Offline storage initialized');
          resolve(dbRequest.result);
        };
        dbRequest.onerror = () => reject(dbRequest.error);
      });
    } catch (error) {
      console.error('Failed to initialize offline storage:', error);
      throw error;
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto') => {
    setCurrentTheme(newTheme);
    localStorage.setItem('nexus-theme', newTheme);
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen toggle failed:', error);
    }
  };

  // 应用外壳结构
  if (!isAppReady) {
    return (
      <div className="pwa-loading">
        <LoadingSpinner size="large" />
        <p>正在初始化 Nexus Reader...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className={`pwa-shell ${isFullscreen ? 'fullscreen' : ''}`}>
        {/* PWA元数据 */}
        <Helmet>
          <title>Nexus Reader - 智能小说阅读器</title>
          <meta name="description" content="基于AI的智能小说阅读器，支持离线阅读、多设备同步和个性化推荐" />
          <meta name="application-name" content="Nexus Reader" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-title" content="Nexus Reader" />
          <meta name="mobile-web-app-capable" content="yes" />
          <link rel="manifest" href="/manifest.json" />
        </Helmet>

        {/* 状态横幅 */}
        {!isOnline && <OfflineBanner connectionType={connectionType} />}
        {isUpdateAvailable && (
          <UpdateAvailableBanner 
            onUpdate={updateApp}
            onSkip={skipUpdate}
            isUpdating={isUpdating}
          />
        )}
        {showInstallPrompt && !isInstalled && (
          <InstallPrompt 
            onInstall={installApp}
            onDismiss={dismissInstallPrompt}
          />
        )}

        {/* 应用头部 */}
        <AppHeader 
          title="Nexus Reader"
          theme={currentTheme}
          onThemeChange={handleThemeChange}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isOnline={isOnline}
          isSyncing={isSyncing}
          onSync={syncNow}
        />

        {/* 主要内容区域 */}
        <main className="app-main">
          <Router>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/reading/:novelId" element={<ReadingPage />} />
                <Route path="/discover" element={<DiscoverPage />} />
                <Route path="/offline" element={<OfflinePage />} />
                <Route path="/sync" element={<SyncPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/continue-reading" element={<Navigate to="/reading/last" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Router>
        </main>

        {/* 底部导航 */}
        <AppNavigation 
          currentPath={window.location.pathname}
          isOnline={isOnline}
          pendingChanges={pendingChanges}
        />

        {/* PWA功能组件 */}
        {children}
      </div>
    </ErrorBoundary>
  );
};

export default PWAShell;