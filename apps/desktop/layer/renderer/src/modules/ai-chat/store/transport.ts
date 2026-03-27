import { env } from "@follow/shared/env.desktop"
import type { UIMessageChunk } from "ai"

import { getAISettings } from "~/atoms/settings/ai"
import { getActiveByokProvider, getStoredDirectByokEnabled } from "~/lib/ai-byok"

import { getAIModelState } from "../atoms/session"
import type { TitleHandlerOptions, TitleHandlerPersistOption } from "./base-transport"
import { ExtendChatTransport } from "./base-transport"
import { DirectLLMTransport } from "./direct-transport"

export interface CreateChatTransportOptions {
  onValue?: (value: UIMessageChunk) => void
  titleHandler?: TitleHandlerOptions
}

export interface CreateChatTitleHandlerOptions {
  chatId: string
  getActiveChatId: () => string | null | undefined
  onTitleChange?: (title: string) => void
  persist?: TitleHandlerPersistOption
}

export function createChatTitleHandler(
  options: CreateChatTitleHandlerOptions,
): TitleHandlerOptions {
  const { chatId, getActiveChatId, onTitleChange, persist } = options

  return {
    chatId,
    persist,
    onTitleChange,
    shouldHandle: () => getActiveChatId() === chatId,
  }
}

/**
 * Create a chat transport for AI SDK
 * This is used by the AbstractChat instance to communicate with AI providers
 */
export function createChatTransport({ onValue, titleHandler }: CreateChatTransportOptions = {}) {
  if (getStoredDirectByokEnabled()) {
    const { byok } = getAISettings()
    const { selectedModel } = getAIModelState()
    const activeProvider = getActiveByokProvider(byok, selectedModel)

    if (activeProvider) {
      return new DirectLLMTransport(activeProvider, {
        onValue,
        titleHandler,
      })
    }
  }

  return new ExtendChatTransport({
    onValue,
    titleHandler,
    // Custom fetch configuration
    api: `${env.VITE_API_URL}/ai/chat`,
    credentials: "include",
    // Add selected model to request body
    body: () => {
      const modelState = getAIModelState()
      const { selectedModel } = modelState

      return selectedModel ? { model: selectedModel } : {}
    },
  })
}
