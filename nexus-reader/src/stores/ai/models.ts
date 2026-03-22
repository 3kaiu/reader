/**
 * AI Models Store
 * Manages AI model configurations and preferences
 */

import type { ModelInfo } from "@/types/ai";
import { getLocalStorageItem, setLocalStorageItem } from "@/utils/browserStorage";
import { logger } from "@/utils/logger";

const DEFAULT_MODEL_KEY = "nexus_default_model";
const MODELS_KEY = "nexus_available_models";

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "Llama-3-8B-Instruct-q4f16_1-MLC",
    name: "Llama 3 8B (4-bit)",
    fullName: "Llama-3-8B-Instruct-q4f16_1-MLC",
    vendor: "Meta",
    description: "轻量级通用模型，适合日常问答",
    recommended: true,
    size: "4.9GB",
    params: "8B",
    quantization: "q4f16_1",
    contextWindow: 8192,
    series: "Llama-3",
  },
  {
    id: "Llama-3-8B-Instruct-q4f32_1-MLC",
    name: "Llama 3 8B (4-bit, higher precision)",
    fullName: "Llama-3-8B-Instruct-q4f32_1-MLC",
    vendor: "Meta",
    description: "更高精度的8B模型",
    recommended: false,
    size: "5.2GB",
    params: "8B",
    quantization: "q4f32_1",
    contextWindow: 8192,
    series: "Llama-3",
  },
  {
    id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    name: "Phi-3 Mini (4-bit)",
    fullName: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    vendor: "Microsoft",
    description: "超轻量级模型，适合低配设备",
    recommended: true,
    size: "2.3GB",
    params: "3.8B",
    quantization: "q4f16_1",
    contextWindow: 4096,
    series: "Phi-3",
  },
  {
    id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
    name: "Mistral 7B (4-bit)",
    fullName: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
    vendor: "Mistral AI",
    description: "高质量7B模型，适合复杂任务",
    recommended: false,
    size: "4.3GB",
    params: "7B",
    quantization: "q4f16_1",
    contextWindow: 8192,
    series: "Mistral",
  },
];

/**
 * Get the default model ID
 */
export async function getDefaultModel(): Promise<string> {
  try {
    const saved = getLocalStorageItem(DEFAULT_MODEL_KEY);
    if (saved) {
      return saved;
    }
  } catch (error) {
    logger.warn("Failed to read default model from localStorage", { error });
  }

  // Return first recommended model as default
  const recommended = AVAILABLE_MODELS.find((m) => m.recommended);
  return recommended?.id || AVAILABLE_MODELS[0].id;
}

/**
 * Save the last used model ID
 */
export async function saveLastModel(modelId: string): Promise<void> {
  try {
    setLocalStorageItem(DEFAULT_MODEL_KEY, modelId);
  } catch (error) {
    logger.warn("Failed to save default model to localStorage", { error });
  }
}

/**
 * Get all available models
 */
export async function getAllModels(): Promise<ModelInfo[]> {
  try {
    const saved = getLocalStorageItem(MODELS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    logger.warn("Failed to read models from localStorage", { error });
  }

  return AVAILABLE_MODELS;
}
