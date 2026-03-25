import type { Logger } from '../../shared/logger.ts'
import type { WorkerEnv } from '../../shared/types.ts'
import {
  getGroqMessageContent,
  getHuggingFacePayload,
  getTotalTokens,
  parseAIResponse,
} from './parsing.ts'
import { buildOptimizedPrompt } from './prompt.ts'
import type { AIInferRequest, AIModel, AIResponse } from './types.ts'

const AI_MODELS: AIModel[] = ['workers-ai', 'groq', 'huggingface']

interface AIProviderContext {
  env: WorkerEnv
  logger: Logger
}

export function getFallbackModels(preferredModel: AIModel): AIModel[] {
  return AI_MODELS.filter(model => model !== preferredModel)
}

export async function callAIModel(
  model: AIModel,
  request: AIInferRequest,
  startTime: number,
  context: AIProviderContext
): Promise<AIResponse | null> {
  switch (model) {
    case 'workers-ai':
      return callWorkersAI(request, startTime, context)
    case 'groq':
      return callGroq(request, startTime, context)
    case 'huggingface':
      return callHuggingFace(request, startTime, context)
  }
}

async function callWorkersAI(
  request: AIInferRequest,
  startTime: number,
  context: AIProviderContext
): Promise<AIResponse | null> {
  if (!context.env.AI) {
    return null
  }

  try {
    const prompt = buildOptimizedPrompt(request)
    const response = await context.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 1000,
      temperature: 0.1,
    })

    const result = parseAIResponse(response.response || response)
    if (!result) {
      return null
    }

    return {
      entities: result.entities || [],
      processingTime: Date.now() - startTime,
      modelUsed: 'workers-ai',
      tokensUsed: response.usage?.total_tokens || prompt.length / 4,
    }
  } catch (error) {
    context.logger.error('Workers AI failed:', error)
    return null
  }
}

async function callGroq(
  request: AIInferRequest,
  startTime: number,
  context: AIProviderContext
): Promise<AIResponse | null> {
  if (!context.env.GROQ_API_KEY) {
    return null
  }

  try {
    const prompt = buildOptimizedPrompt(request)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    })

    const data: unknown = await response.json()
    const content = getGroqMessageContent(data)
    if (!content) {
      return null
    }

    const result = parseAIResponse(content)
    if (!result) {
      return null
    }

    return {
      entities: result.entities || [],
      processingTime: Date.now() - startTime,
      modelUsed: 'groq',
      tokensUsed: getTotalTokens(data) || prompt.length / 4,
    }
  } catch (error) {
    context.logger.error('Groq AI failed:', error)
    return null
  }
}

async function callHuggingFace(
  request: AIInferRequest,
  startTime: number,
  context: AIProviderContext
): Promise<AIResponse | null> {
  if (!context.env.HF_API_KEY) {
    return null
  }

  try {
    const prompt = buildOptimizedPrompt(request)
    const response = await fetch(
      'https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${context.env.HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 1000,
            temperature: 0.1,
            do_sample: false,
          },
        }),
      }
    )

    const data: unknown = await response.json()
    const result = parseAIResponse(getHuggingFacePayload(data))
    if (!result) {
      return null
    }

    return {
      entities: result.entities || [],
      processingTime: Date.now() - startTime,
      modelUsed: 'huggingface',
      tokensUsed: prompt.length / 4,
    }
  } catch (error) {
    context.logger.error('HuggingFace AI failed:', error)
    return null
  }
}
