/**
 * AI Worker
 * 在独立线程中运行 AI 推理，避免阻塞 UI
 */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

// 创建 Worker 端的 Handler
const handler = new WebWorkerMLCEngineHandler()

// 监听主线程消息
self.onmessage = (msg: MessageEvent) => {
    // 验证消息来源以防止恶意网站通过 Web Worker 推理
    if (msg.origin && msg.origin !== self.location.origin) {
        return
    }
    handler.onmessage(msg)
}
