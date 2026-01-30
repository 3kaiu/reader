/**
 * AI Service (AI 推理服务)
 * 职责：提供基于 LLM 的文本解密与推理，支持多模型兜底
 */

import { type WorkerEnv } from '../shared/types.ts';
import { type Logger } from '../shared/logger.ts';

export interface AIInferRequest {
  text: string;
  context: any;
  unknownTerms: string[];
}

export class AIService {
  private env: WorkerEnv;
  private logger: Logger;
  private callCount = 0;
  private static readonly MAX_CALLS = 10;

  constructor(env: WorkerEnv, logger: Logger) {
    this.env = env;
    this.logger = logger;
  }

  async infer(request: AIInferRequest): Promise<any> {
    if (this.callCount >= AIService.MAX_CALLS) return null;
    this.callCount++;

    const prompt = this.buildPrompt(request);

    // 策略：Workers AI -> Groq -> HF
    return await this.callWorkersAI(prompt) ||
      await this.callGroq(prompt) ||
      await this.callHuggingFace(prompt);
  }

  private buildPrompt(request: AIInferRequest): string {
    return `你是一个网文解密专家。根据原文片段识别出的人名、地名、组织名等实体，并给出其真实含义。
    要求返回 JSON 格式：{"entities": [{"original": "加密词", "real": "真实词", "type": "person/location/org"}]}
    
    原文片段: ${request.text}
    已知需要识别的关键词: ${request.unknownTerms.join(',')}`;
  }

  private async callWorkersAI(prompt: string): Promise<any> {
    if (!this.env.AI) return null;
    try {
      // @ts-ignore - Workers AI binding
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', { prompt });
      return this.parseJSON(response);
    } catch (e) {
      this.logger.error('Workers AI failed:', e);
      return null;
    }
  }

  private async callGroq(prompt: string): Promise<any> {
    if (!this.env.GROQ_API_KEY) return null;
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });
      const data: any = await response.json();
      return this.parseJSON(data.choices?.[0]?.message?.content);
    } catch (e) {
      this.logger.error('Groq AI failed:', e);
      return null;
    }
  }

  private async callHuggingFace(prompt: string): Promise<any> {
    if (!this.env.HF_API_KEY) return null;
    try {
      const response = await fetch('https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.HF_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: prompt })
      });
      const data: any = await response.json();
      return this.parseJSON(data[0]?.generated_text);
    } catch (e) {
      this.logger.error('HuggingFace AI failed:', e);
      return null;
    }
  }

  private parseJSON(res: any): any {
    if (!res) return null;
    const text = typeof res === 'string' ? res : (res.response || res.generated_text || "");
    try {
      const match = text.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;
    } catch {
      return null;
    }
  }
}
