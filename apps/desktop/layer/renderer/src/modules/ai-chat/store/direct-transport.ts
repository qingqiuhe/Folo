import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type { UserByokProviderConfig } from "@follow/shared/settings/interface"
import type { ChatTransport, DataUIPart, TextPart, TextStreamPart, ToolSet } from "ai"
import { convertToModelMessages, streamText } from "ai"

import {
  getByokProviderDisplayName,
  getByokProviderLabel,
  getByokResolvedModel,
} from "~/lib/ai-byok"

import type { ExtendChatTransportOptions } from "./base-transport"
import { ExtendChatTransport } from "./base-transport"
import type { AIChatContextBlock, BizUIDataTypes, BizUIMessage, BizUIMetadata } from "./types"

const getContextBlockLine = (block: AIChatContextBlock): string | null => {
  switch (block.type) {
    case "mainView": {
      return `Current view: ${block.value}`
    }
    case "mainEntry": {
      return `Current entry ID: ${block.value}`
    }
    case "mainFeed": {
      return `Current feed: ${block.value}`
    }
    case "unreadOnly": {
      return "Filter: unread only"
    }
    case "fileAttachment": {
      return `Attached file: ${block.attachment.name}`
    }
    default: {
      return null
    }
  }
}

const convertDataPartToText = (
  part: DataUIPart<BizUIDataTypes>,
): TextPart | undefined => {
  switch (part.type) {
    case "data-rich-text": {
      return {
        type: "text",
        text: part.data.text,
      }
    }
    case "data-block": {
      const lines = part.data.reduce<string[]>((items, block) => {
        const line = getContextBlockLine(block)
        if (line) {
          items.push(line)
        }

        return items
      }, [])
      if (lines.length === 0) {
        return undefined
      }

      return {
        type: "text",
        text: `Context:\n${lines.map((line) => `- ${line}`).join("\n")}`,
      }
    }
    default: {
      return undefined
    }
  }
}

const getMessageMetadata = (
  provider: UserByokProviderConfig,
  part: TextStreamPart<ToolSet>,
): BizUIMetadata | undefined => {
  const baseMetadata: BizUIMetadata = {
    providerType: "byok",
    provider: getByokProviderDisplayName(provider),
    modelUsed: getByokResolvedModel(provider),
  }

  if (part.type === "finish") {
    return {
      ...baseMetadata,
      finishTime: new Date().toISOString(),
      billedTokens: part.totalUsage.totalTokens,
      totalTokens: part.totalUsage.totalTokens,
      contextTokens: part.totalUsage.inputTokens,
      outputTokens: part.totalUsage.outputTokens,
      reasoningTokens:
        part.totalUsage.outputTokenDetails.reasoningTokens ?? part.totalUsage.reasoningTokens,
      cachedInputTokens:
        part.totalUsage.inputTokenDetails.cacheReadTokens ?? part.totalUsage.cachedInputTokens,
    }
  }

  if (part.type === "start") {
    return baseMetadata
  }

  return undefined
}

export class DirectLLMTransport extends ExtendChatTransport implements ChatTransport<BizUIMessage> {
  constructor(
    private byokConfig: UserByokProviderConfig,
    options: Omit<ExtendChatTransportOptions, "api" | "credentials" | "body"> = {},
  ) {
    super(options)
  }

  override async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<BizUIMessage>["sendMessages"]>[0]) {
    const model = this.createModel()
    const uiMessages: Array<Omit<BizUIMessage, "id">> = messages.map(({ id: _id, ...message }) => message)
    const coreMessages = await convertToModelMessages(
      uiMessages,
      {
        convertDataPart: (part) => convertDataPartToText(part as DataUIPart<BizUIDataTypes>),
      },
    )

    const result = streamText({
      model,
      messages: coreMessages,
      abortSignal,
    })

    return this.processUIMessageChunkStream(
      result.toUIMessageStream<BizUIMessage>({
        messageMetadata: ({ part }) => getMessageMetadata(this.byokConfig, part),
        onError: (error) => (error instanceof Error ? error.message : "An error occurred."),
      }),
    )
  }

  override async reconnectToStream() {
    return null
  }

  private createModel() {
    const { headers, provider } = this.byokConfig
    const apiKey = this.byokConfig.apiKey?.trim() ?? ""
    const baseURL = this.byokConfig.baseURL?.trim() || undefined
    const model = getByokResolvedModel(this.byokConfig)

    if (provider === "google") {
      const google = createGoogleGenerativeAI({
        apiKey,
        baseURL,
        headers,
        name: this.byokConfig.name?.trim() || undefined,
      })
      return google(model)
    }

    if (provider === "openrouter") {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseURL ?? "https://openrouter.ai/api/v1",
        headers,
        name: getByokProviderLabel(provider),
      })
      return openai(model)
    }

    const openai = createOpenAI({
      apiKey,
      baseURL,
      headers,
      name: provider === "openai" ? undefined : getByokProviderDisplayName(this.byokConfig),
    })
    return openai(model)
  }
}
