import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAInstallState {
  canInstall: boolean;
  isInstalled: boolean;
  showInstallPrompt: boolean;
  installPromptEvent: BeforeInstallPromptEvent | null;
  installationSource: 'browser' | 'standalone' | 'twa' | null;
  supportedPlatforms: string[];
}

interface PWAInstallActions {
  installApp: () => Promise<boolean>;
  dismissInstallPrompt: () => void;
  checkInstallability: () => void;
}

export const usePWAInstall = (): PWAInstallState & PWAInstallActions => {
  const [state, setState] = useState<PWAInstallState>({
    canInstall: false,
    isInstalled: false,
    showInstallPrompt: false,
    installPromptEvent: null,
    installationSource: null,
    supportedPlatforms: []
  });

  // 检测PWA安装状态
  const detectInstallationStatus = useCallback(() => {
    // 检查是否在独立模式下运行
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        (window.navigator as any).standalone ||
                        document.referrer.includes('android-app://');

    // 检测安装来源
    let installationSource: 'browser' | 'standalone' | 'twa' | null = null;
    
    if (isStandalone) {
      installationSource = 'standalone';
    } else if ((window.navigator as any).standalone) {
      installationSource = 'standalone'; // iOS Safari
    } else if (document.referrer.includes('android-app://')) {
      installationSource = 'twa'; // Trusted Web Activity
    } else {
      installationSource = 'browser';
    }

    setState(prev => ({
      ...prev,
      isInstalled: isStandalone,
      installationSource
    }));
  }, []);

  // 处理beforeinstallprompt事件
  const handleBeforeInstallPrompt = useCallback((event: BeforeInstallPromptEvent) => {
    // 阻止默认的安装提示
    event.preventDefault();
    
    console.log('PWA install prompt available');
    
    setState(prev => ({
      ...prev,
      canInstall: true,
      installPromptEvent: event,
      supportedPlatforms: event.platforms || [],
      showInstallPrompt: shouldShowInstallPrompt()
    }));
  }, []);

  // 处理应用安装事件
  const handleAppInstalled = useCallback(() => {
    console.log('PWA installed successfully');
    
    setState(prev => ({
      ...prev,
      isInstalled: true,
      canInstall: false,
      showInstallPrompt: false,
      installPromptEvent: null
    }));

    // 记录安装事件
    trackInstallEvent('installed');
  }, []);

  // 判断是否应该显示安装提示
  const shouldShowInstallPrompt = (): boolean => {
    // 检查用户是否已经拒绝过安装提示
    const dismissedCount = parseInt(localStorage.getItem('pwa-install-dismissed') || '0');
    const lastDismissed = parseInt(localStorage.getItem('pwa-install-last-dismissed') || '0');
    const now = Date.now();
    
    // 如果用户拒绝超过3次，或者最近24小时内拒绝过，则不显示
    if (dismissedCount >= 3 || (now - lastDismissed) < 24 * 60 * 60 * 1000) {
      return false;
    }

    // 检查用户是否已经使用应用一段时间（增加安装意愿）
    const firstVisit = parseInt(localStorage.getItem('pwa-first-visit') || now.toString());
    const usageTime = now - firstVisit;
    const minUsageTime = 5 * 60 * 1000; // 5分钟

    return usageTime > minUsageTime;
  };

  // 安装PWA
  const installApp = useCallback(async (): Promise<boolean> => {
    if (!state.installPromptEvent) {
      console.warn('No install prompt event available');
      return false;
    }

    try {
      // 显示安装提示
      await state.installPromptEvent.prompt();
      
      // 等待用户选择
      const choiceResult = await state.installPromptEvent.userChoice;
      
      console.log('User choice:', choiceResult.outcome);
      
      if (choiceResult.outcome === 'accepted') {
        trackInstallEvent('accepted');
        
        setState(prev => ({
          ...prev,
          showInstallPrompt: false,
          installPromptEvent: null
        }));
        
        return true;
      } else {
        trackInstallEvent('dismissed');
        dismissInstallPrompt();
        return false;
      }
    } catch (error) {
      console.error('Install prompt failed:', error);
      trackInstallEvent('error', error);
      return false;
    }
  }, [state.installPromptEvent]);

  // 拒绝安装提示
  const dismissInstallPrompt = useCallback(() => {
    const dismissedCount = parseInt(localStorage.getItem('pwa-install-dismissed') || '0');
    localStorage.setItem('pwa-install-dismissed', (dismissedCount + 1).toString());
    localStorage.setItem('pwa-install-last-dismissed', Date.now().toString());
    
    setState(prev => ({
      ...prev,
      showInstallPrompt: false
    }));

    trackInstallEvent('dismissed');
  }, []);

  // 检查安装能力
  const checkInstallability = useCallback(() => {
    // 检查浏览器支持
    const supportsInstall = 'serviceWorker' in navigator && 'BeforeInstallPromptEvent' in window;
    
    // 检查设备类型
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isDesktop = !isMobile;
    
    console.log('PWA installability check:', {
      supportsInstall,
      isMobile,
      isDesktop,
      userAgent: navigator.userAgent
    });

    // 对于不支持标准安装提示的浏览器，提供手动安装指导
    if (!supportsInstall && (isMobile || isDesktop)) {
      setState(prev => ({
        ...prev,
        canInstall: true,
        showInstallPrompt: shouldShowManualInstallPrompt()
      }));
    }
  }, []);

  // 判断是否显示手动安装提示
  const shouldShowManualInstallPrompt = (): boolean => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    // 对于iOS Safari，显示手动安装指导
    return isIOS && isSafari && !state.isInstalled;
  };

  // 跟踪安装事件
  const trackInstallEvent = (event: string, data?: any) => {
    // 发送分析事件
    if ('gtag' in window) {
      (window as any).gtag('event', 'pwa_install', {
        event_category: 'PWA',
        event_label: event,
        value: data ? JSON.stringify(data) : undefined
      });
    }

    // 记录到本地存储用于调试
    const installEvents = JSON.parse(localStorage.getItem('pwa-install-events') || '[]');
    installEvents.push({
      event,
      timestamp: Date.now(),
      data,
      userAgent: navigator.userAgent
    });
    
    // 只保留最近50个事件
    if (installEvents.length > 50) {
      installEvents.splice(0, installEvents.length - 50);
    }
    
    localStorage.setItem('pwa-install-events', JSON.stringify(installEvents));
  };

  // 设置事件监听器
  useEffect(() => {
    // 记录首次访问时间
    if (!localStorage.getItem('pwa-first-visit')) {
      localStorage.setItem('pwa-first-visit', Date.now().toString());
    }

    // 检测当前安装状态
    detectInstallationStatus();
    
    // 检查安装能力
    checkInstallability();

    // 监听安装提示事件
    const handleBeforeInstall = (event: Event) => {
      handleBeforeInstallPrompt(event as BeforeInstallPromptEvent);
    };

    // 监听应用安装事件
    const handleInstalled = () => {
      handleAppInstalled();
    };

    // 监听显示模式变化
    const handleDisplayModeChange = () => {
      detectInstallationStatus();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    
    // 监听媒体查询变化
    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    displayModeQuery.addListener(handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
      displayModeQuery.removeListener(handleDisplayModeChange);
    };
  }, [detectInstallationStatus, handleBeforeInstallPrompt, handleAppInstalled, checkInstallability]);

  return {
    ...state,
    installApp,
    dismissInstallPrompt,
    checkInstallability
  };
};