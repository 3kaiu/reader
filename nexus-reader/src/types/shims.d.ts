/**
 * Global Type Shims
 */
declare module 'piper-tts-web' {
  export const HuggingFaceVoiceProvider: any;
  export const PiperVoice: any;
  const module: any;
  export default module;
}

declare module '@/utils/adaptiveAssetLoader' {
  export const AdaptiveLoader: any;
}

declare module '@/utils/webLocks' {
  export const webLocks: any;
}

declare module '*/adaptiveAssetLoader' {
  export const AdaptiveLoader: any;
}

interface Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}
