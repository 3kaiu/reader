import type { AIInferRequest } from './types.ts'

export function generateCacheKey(request: AIInferRequest): string {
  const keyData = {
    text: request.text.slice(0, 1000),
    context: request.context,
    unknownTerms: request.unknownTerms.slice(0, 10),
    bookId: request.bookId,
    chapterId: request.chapterId,
  }

  return `ai:${btoa(JSON.stringify(keyData)).slice(0, 100)}`
}

export function buildOptimizedPrompt(request: AIInferRequest): string {
  const { text, context, unknownTerms } = request
  const bookType = typeof context.bookType === 'string' ? context.bookType : '通用'

  return `你是一个专业的中文网文解密专家。请分析以下文本中的潜在暗语、代称或隐晦表达，并给出其真实含义。

文本内容（${text.length}字符）：
${text.slice(0, 2000)}

上下文信息：
- 类型：${bookType}
- 需要关注的关键词：${unknownTerms.slice(0, 20).join('、')}

要求：
1. 只识别真正存在暗语或代称的部分
2. 提供准确的真实含义
3. 按JSON格式返回结果

输出格式：
{
  "entities": [
    {
      "original": "原文中的暗语",
      "real": "真实含义",
      "type": "person|company|place|organization|other",
      "confidence": 0.0-1.0,
      "reason": "识别依据的简要说明"
    }
  ]
}

如果没有发现暗语，请返回 {"entities": []}`
}
