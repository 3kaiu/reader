/**
 * AI Store
 *
 * Manages AI features and conversation history
 */

import { defineStore } from "pinia";
import { ref } from "vue";
import { errorHandler } from "@/utils/unified-utils";
import type { AiMessage } from "../types";

export const useAiStore = defineStore("ai", () => {
  const isEnabled = ref(true);
  const currentModel = ref<string>("gpt-3.5-turbo");
  const conversationHistory = ref<AiMessage[]>([]);
  const isProcessing = ref(false);
  const analysisResults = ref<Record<string, unknown>>({});

  const sendMessage = async (message: string, _context?: string) => {
    if (!isEnabled.value) return;

    isProcessing.value = true;
    try {
      const userMessage: AiMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        timestamp: Date.now(),
      };
      conversationHistory.value.push(userMessage);

      // const response = await api.post('/ai/chat', {
      //   message,
      //   context,
      //   model: currentModel.value,
      //   history: conversationHistory.value.slice(-10), // 最近10条消息
      // })

      // const aiMessage: AiMessage = {
      //   id: crypto.randomUUID(),
      //   role: 'assistant',
      //   content: response.data.content,
      //   timestamp: Date.now(),
      // }
      // conversationHistory.value.push(aiMessage)

      console.log("AI message sent:", message);
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: "ai-store",
        operation: "send-message",
      });
    } finally {
      isProcessing.value = false;
    }
  };

  const analyzeContent = async (content: string, type: string) => {
    isProcessing.value = true;
    try {
      // const response = await api.post('/ai/analyze', { content, type })
      // analysisResults.value[type] = response.data
      console.log("Analyzing content:", type, content.substring(0, 100));
    } catch (error: unknown) {
      errorHandler.handle(error instanceof Error ? error : String(error), {
        component: "ai-store",
        operation: "analyze-content",
      });
    } finally {
      isProcessing.value = false;
    }
  };

  const clearHistory = () => {
    conversationHistory.value = [];
  };

  const switchModel = (model: string) => {
    currentModel.value = model;
  };

  return {
    isEnabled,
    currentModel,
    conversationHistory,
    isProcessing,
    analysisResults,
    sendMessage,
    analyzeContent,
    clearHistory,
    switchModel,
  };
});
