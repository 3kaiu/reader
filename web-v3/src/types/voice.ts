/**
 * 自定义音色相关类型定义
 */

/**
 * 音色元数据
 */
export interface VoiceModel {
  id: string; // 唯一标识
  name: string; // 音色名称
  createdAt: number; // 创建时间戳
  updatedAt: number; // 更新时间戳
  sampleDuration: number; // 样本时长（秒）
  modelSize: number; // 模型大小（字节）
  version: string; // 模型版本
  metadata: VoiceMetadata; // 元数据
}

/**
 * 音色元数据详情
 */
export interface VoiceMetadata {
  language: string; // 语言代码（如 'zh-CN', 'en-US'）
  gender?: "male" | "female" | "neutral"; // 性别
  age?: "child" | "young" | "adult" | "elder"; // 年龄
  description?: string; // 描述
  tags?: string[]; // 标签
  quality?: "low" | "medium" | "high"; // 音质评级
}

/**
 * 音色训练设置
 */
export interface VoiceTrainingSettings {
  name: string; // 音色名称
  language: string; // 语言
  epochs?: number; // 训练轮数（默认 100）
  batchSize?: number; // 批次大小
  learningRate?: number; // 学习率
  enableDataAugmentation?: boolean; // 是否启用数据增强
}

/**
 * 音色训练进度
 */
export interface VoiceTrainingProgress {
  voiceId: string;
  status: "preparing" | "training" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  currentEpoch?: number;
  totalEpochs?: number;
  estimatedTimeRemaining?: number; // 剩余时间（秒）
  error?: string;
}

/**
 * TTS 引擎类型
 */
export type TTSEngine = "web-speech" | "custom" | "hybrid";

/**
 * TTS 配置
 */
export interface TTSConfig {
  engine: TTSEngine; // 使用的引擎
  voiceId?: string; // 自定义音色 ID（custom 模式）
  rate: number; // 语速 0.5-2
  pitch: number; // 音调 0.5-2
  volume: number; // 音量 0-1
}
