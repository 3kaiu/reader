/**
 * AI 服务管理器
 * 管理实验性的本地运行时模型加载与缓存
 */

import { ref, shallowRef } from "vue";
import { AdaptiveLoader } from "../../utils/adaptiveAssetLoader";
import { logger } from "../../utils/logger";
import { syncChannel } from "../../utils/broadcast";
import {
  getDefaultModel,
  saveLastModel,
  getAllModels,
} from "../../stores/ai/models";
import { modelCacheManager } from "./modelCache";
import type { ModelInfo } from "@/types/ai";

// WebGPU 类型声明
declare global {
  interface Navigator {
    gpu?: {
      requestAdapter(): Promise<GPUAdapter | null>;
    };
  }
  interface GPUAdapter {}
}

// AI库接口定义
interface WebLLMInterface {
  CreateWebWorkerMLCEngine: (
    worker: Worker,
    modelId: string,
    config?: any,
  ) => Promise<MLCEngineInterface>;
}

interface MLCEngineInterface {
  unload: () => Promise<void>;
  terminate?: () => Promise<void>;
}

/**
 * AI服务管理器类
 */
export class AIServiceManager {
  private static instance: AIServiceManager;

  // 状态管理
  public readonly isSupported = ref(false);
  public readonly isLoading = ref(false);
  public readonly isModelLoaded = ref(false);
  public readonly loadProgress = ref(0);
  public readonly loadStatus = ref("");
  public readonly error = ref<string | null>(null);
  public readonly currentModel = ref<string | null>(null);

  // AI引擎实例
  private engine = shallowRef<MLCEngineInterface | null>(null);
  private webllm: WebLLMInterface | null = null;
  private aiWorker: Worker | null = null;

  // 自动卸载定时器
  private autoUnloadTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly AUTO_UNLOAD_TIMEOUT = 5 * 60 * 1000; // 5分钟

  private constructor() {
    this.initializeEventListeners();
  }

  static getInstance(): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager();
    }
    return AIServiceManager.instance;
  }

  /**
   * 初始化AI服务
   */
  async initialize(): Promise<void> {
    logger.info("[AI Service] Initializing AI service manager...");

    try {
      // 初始化模型缓存管理器
      await modelCacheManager.initialize();

      // 检测WebGPU支持
      const supported = await this.detectWebGPUSupport();
      if (!supported) {
        logger.warn(
          "[AI Service] WebGPU not supported, AI features will be limited",
        );
        return;
      }

      // 预热缓存（可选）
      const recommendedModels = (await getAllModels()).filter((model) => model.recommended);
      const topModels = recommendedModels.slice(0, 2); // 只预热前2个推荐模型
      if (topModels.length > 0) {
        await modelCacheManager.warmupCache(topModels.map((m) => m.id));
      }

      logger.info("[AI Service] AI service manager initialized successfully");
    } catch (error: any) {
      logger.error("[AI Service] Failed to initialize AI service:", error);
      this.error.value = `初始化失败: ${error instanceof Error ? error.message : "未知错误"}`;
    }
  }

  /**
   * 检测WebGPU支持
   */
  async detectWebGPUSupport(): Promise<boolean> {
    try {
      if (!navigator.gpu) {
        this.isSupported.value = false;
        this.error.value = "您的浏览器不支持 WebGPU";
        return false;
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        this.isSupported.value = false;
        this.error.value = "无法获取 GPU 适配器";
        return false;
      }

      this.isSupported.value = true;
      this.error.value = null;
      return true;
    } catch (error: any) {
      this.isSupported.value = false;
      this.error.value = "WebGPU 检测失败";
      logger.error("[AI Service] WebGPU detection failed:", error as Error);
      return false;
    }
  }

  /**
   * 动态加载WebLLM库
   */
  private async loadWebLLMLibrary(): Promise<WebLLMInterface> {
    if (this.webllm) {
      return this.webllm;
    }

    try {
      logger.info("[AI Service] Loading WebLLM library from CDN...");

      this.loadStatus.value = "正在加载AI运行时库...";

      // 使用 AdaptiveLoader 加载 WebLLM
      const webllmLib = await AdaptiveLoader.loadHeavyModule(
        "@mlc-ai/web-llm",
        async (data: any) => {
          const module = await import("@mlc-ai/web-llm");
          const _isDesc = !!(data as any).files;
          if (_isDesc) {
            logger.debug("WebLLM module descriptor found");
          }
          return module;
        },
      );

      if (!webllmLib || !webllmLib.CreateWebWorkerMLCEngine) {
        throw new Error("WebLLM library not properly loaded");
      }

      this.webllm = webllmLib;
      logger.info("[AI Service] WebLLM library loaded successfully");

      return webllmLib;
    } catch (error: any) {
      logger.error(
        "[AI Service] Failed to load WebLLM library:",
        error as Error,
      );

      const errorMessage = error instanceof Error ? error.message : "未知错误";
      this.error.value = `本地 AI 库加载失败: ${errorMessage}。请稍后重试。`;
      this.loadStatus.value = "加载失败";

      throw new Error(
        `AI库加载失败: ${errorMessage}。请稍后重试。`,
      );
    }
  }

  /**
   * 创建AI Worker
   */
  private async createAIWorker(): Promise<Worker> {
    if (this.aiWorker) {
      return this.aiWorker;
    }

    try {
      this.aiWorker = new Worker(
        new URL("../../workers/ai-worker.ts", import.meta.url),
        { type: "module" },
      );

      return this.aiWorker;
    } catch (error: any) {
      logger.error("[AI Service] Failed to create AI worker:", error as Error);
      throw new Error(
        `AI Worker创建失败: ${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  }

  /**
   * 加载模型
   */
  async loadModel(modelId?: string): Promise<boolean> {
    // 如果没有提供 modelId，获取默认模型
    const targetModelId = modelId || (await getDefaultModel());

    if (this.isLoading.value) {
      logger.warn("[AI Service] Model loading already in progress");
      return false;
    }

    // 检测WebGPU支持
    if (!this.isSupported.value) {
      const supported = await this.detectWebGPUSupport();
      if (!supported) {
        return false;
      }
    }

    this.isLoading.value = true;
    this.loadProgress.value = 0;
    this.loadStatus.value = "初始化...";
    this.error.value = null;

    try {
      // 使用Web锁确保只有一个加载过程
      const { webLocks } = await import("@/utils/webLocks");

      return await webLocks.withExclusive("ai-engine-load", async () => {
        // 再次检查是否已加载
        if (
          this.isModelLoaded.value &&
          this.currentModel.value === targetModelId
        ) {
          this.isLoading.value = false;
          return true;
        }

        // 1. 动态加载WebLLM库。
        // 模型下载与浏览器缓存由 WebLLM 自己管理，避免写入伪造本地缓存。
        const webllmLib = await this.loadWebLLMLibrary();

        // 2. 创建AI Worker
        this.loadStatus.value = "创建AI Worker...";
        this.loadProgress.value = 30;
        const worker = await this.createAIWorker();

        // 3. 创建引擎实例
        this.loadStatus.value = "正在初始化模型...";
        this.loadProgress.value = 40;

        const engine = await webllmLib.CreateWebWorkerMLCEngine(
          worker,
          targetModelId,
          {
            initProgressCallback: (report: any) => {
              // 40-100%用于模型初始化
              const modelProgress = 40 + Math.round(report.progress * 60);
              this.loadProgress.value = modelProgress;
              this.loadStatus.value = report.text || "初始化模型中...";
            },
          },
        );

        // 4. 设置状态
        this.engine.value = engine;
        this.currentModel.value = targetModelId;
        this.isModelLoaded.value = true;
        this.loadStatus.value = "模型加载完成";
        this.loadProgress.value = 100;

        // 5. 保存最后使用的模型
        saveLastModel(targetModelId);

        // 6. 启动自动卸载定时器
        this.resetAutoUnloadTimer();

        // 7. 广播状态
        syncChannel.publish("ai-engine-status", {
          status: "loaded",
          modelId: targetModelId,
        });

        logger.info(`[AI Service] Model ${targetModelId} loaded successfully`);
        return true;
      });
    } catch (error: any) {
      logger.error("[AI Service] Failed to load model:", error as Error);
      this.error.value = `模型加载失败: ${error instanceof Error ? error.message : "未知错误"}`;
      return false;
    } finally {
      this.isLoading.value = false;
    }
  }

  /**
   * 获取所有可用模型
   */
  async getAllModels(): Promise<ModelInfo[]> {
    return await getAllModels();
  }

  /**
   * 卸载当前模型
   */
  async unloadModel(): Promise<void> {
    this.clearAutoUnloadTimer();

    if (this.engine.value) {
      try {
        logger.info("[AI Service] Unloading current model...");

        await this.engine.value.unload();

        // 终止Worker
        if (this.engine.value.terminate) {
          await this.engine.value.terminate();
        }

        // 清理Worker
        if (this.aiWorker) {
          this.aiWorker.terminate();
          this.aiWorker = null;
        }

        // 广播状态
        syncChannel.publish("ai-engine-status", { status: "unloaded" });

        logger.info("[AI Service] Model unloaded successfully");
      } catch (error: any) {
        logger.warn("[AI Service] Error during model unload:", error as Error);
      }

      this.engine.value = null;
      this.currentModel.value = null;
      this.isModelLoaded.value = false;
      this.loadProgress.value = 0;
      this.loadStatus.value = "";
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats() {
    return await modelCacheManager.getCacheStats();
  }

  /**
   * 清理模型缓存
   */
  async clearModelCache(): Promise<void> {
    await modelCacheManager.clearCache();
    logger.info("[AI Service] Model cache cleared");
  }

  async cleanup(): Promise<void> {
    await this.unloadModel();
    this.clearAutoUnloadTimer();

    // 清理WebLLM库引用
    this.webllm = null;

    logger.info("[AI Service] AI service manager cleaned up");
  }

  /**
   * 检查AI引擎是否就绪
   */
  isReady(): boolean {
    return this.isModelLoaded.value && this.engine.value !== null;
  }

  // 计算属性
  get engineInstance() {
    return this.engine.value;
  }

  // 私有方法

  private initializeEventListeners(): void {
    // 监听页面卸载事件
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.cleanup();
      });
    }
  }

  private resetAutoUnloadTimer(): void {
    this.clearAutoUnloadTimer();
    this.autoUnloadTimer = setTimeout(async () => {
      logger.info(
        "[AI Service] Auto-unloading model after 5 minutes of inactivity",
      );
      await this.unloadModel();
    }, this.AUTO_UNLOAD_TIMEOUT);
  }

  private clearAutoUnloadTimer(): void {
    if (this.autoUnloadTimer) {
      clearTimeout(this.autoUnloadTimer);
      this.autoUnloadTimer = null;
    }
  }
}

// 延迟初始化的单例实例
let _aiServiceManager: AIServiceManager | null = null;

export function getAIServiceManager(): AIServiceManager {
  if (!_aiServiceManager) {
    _aiServiceManager = AIServiceManager.getInstance();
  }
  return _aiServiceManager;
}

// 为了向后兼容，提供一个 getter
export const aiServiceManager = {
  get instance() {
    return getAIServiceManager();
  },
  // 代理所有属性和方法
  get isSupported() {
    return getAIServiceManager().isSupported;
  },
  get isLoading() {
    return getAIServiceManager().isLoading;
  },
  get isModelLoaded() {
    return getAIServiceManager().isModelLoaded;
  },
  get loadProgress() {
    return getAIServiceManager().loadProgress;
  },
  get loadStatus() {
    return getAIServiceManager().loadStatus;
  },
  get error() {
    return getAIServiceManager().error;
  },
  get currentModel() {
    return getAIServiceManager().currentModel;
  },
  initialize: () => getAIServiceManager().initialize(),
  detectWebGPUSupport: () => getAIServiceManager().detectWebGPUSupport(),
  loadModel: (modelId?: string) => getAIServiceManager().loadModel(modelId),
  unloadModel: () => getAIServiceManager().unloadModel(),
  isReady: () => getAIServiceManager().isReady(),
  getAllModels: () => getAIServiceManager().getAllModels(),
  cleanup: () => getAIServiceManager().cleanup(),
  getCacheStats: () => getAIServiceManager().getCacheStats(),
  clearModelCache: () => getAIServiceManager().clearModelCache(),
};
