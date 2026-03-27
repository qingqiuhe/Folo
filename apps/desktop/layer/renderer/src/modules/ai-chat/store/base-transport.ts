import type { HttpChatTransportInitOptions, UIMessageChunk } from "ai"
import { HttpChatTransport, parseJsonEventStream, uiMessageChunkSchema } from "ai"

import { AIPersistService } from "../services"
import type { BizUIMessage } from "./types"

export type TitleHandlerPersistOption = boolean | ((title: string) => void | Promise<void>)

export interface TitleHandlerOptions {
  chatId?: string
  shouldHandle?: () => boolean
  onTitleChange?: (title: string) => void
  persist?: TitleHandlerPersistOption
}

export type ExtendChatTransportOptions = HttpChatTransportInitOptions<BizUIMessage> & {
  onValue?: (value: UIMessageChunk) => void
  titleHandler?: TitleHandlerOptions
}

type UIMessageChunkParseResult =
  ReturnType<typeof parseJsonEventStream<UIMessageChunk>> extends ReadableStream<infer T>
    ? T
    : never

const coerceFinishChunk = (chunk: UIMessageChunkParseResult): UIMessageChunk | null => {
  const { rawValue } = chunk
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return null
  }

  if ((rawValue as { type?: unknown }).type !== "finish") {
    return null
  }

  const { finishReason, messageMetadata } = rawValue as {
    finishReason?: unknown
    messageMetadata?: unknown
  }

  return {
    type: "finish",
    finishReason: typeof finishReason === "string" ? finishReason : undefined,
    messageMetadata,
  } as UIMessageChunk
}

export class ExtendChatTransport extends HttpChatTransport<BizUIMessage> {
  constructor(private options: ExtendChatTransportOptions) {
    super(options)
  }

  protected processUIMessageChunkStream(
    stream: ReadableStream<UIMessageChunk>,
  ): ReadableStream<UIMessageChunk> {
    const { onValue } = this.options || {}
    const handleGeneratedTitle = this.handleGeneratedTitle.bind(this)

    return stream.pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        async transform(chunk, controller) {
          await handleGeneratedTitle(chunk)
          onValue?.(chunk)
          controller.enqueue(chunk)
        },
      }),
    )
  }

  protected processResponseStream(
    stream: ReadableStream<Uint8Array<ArrayBufferLike>>,
  ): ReadableStream<UIMessageChunk> {
    return this.processUIMessageChunkStream(
      parseJsonEventStream({
        stream,
        schema: uiMessageChunkSchema,
      }).pipeThrough(
        new TransformStream<UIMessageChunkParseResult, UIMessageChunk>({
          transform(chunk, controller) {
            const parsedChunk = chunk.success ? chunk.value : coerceFinishChunk(chunk)
            if (!parsedChunk) {
              throw chunk.error
            }

            controller.enqueue(parsedChunk)
          },
        }),
      ),
    )
  }

  private async handleGeneratedTitle(chunk: UIMessageChunk) {
    const { titleHandler } = this.options
    if (!titleHandler) {
      return
    }

    if (chunk.type !== "data-generated-title" || typeof chunk.data !== "string") {
      return
    }

    const shouldHandle = titleHandler.shouldHandle?.() ?? true
    if (!shouldHandle) {
      return
    }

    titleHandler.onTitleChange?.(chunk.data)

    const persistOption = titleHandler.persist
    const shouldPersist = persistOption === undefined ? true : persistOption

    if (!shouldPersist) {
      return
    }

    try {
      if (typeof persistOption === "function") {
        await persistOption(chunk.data)
        return
      }

      if (titleHandler.chatId) {
        await AIPersistService.updateSessionTitle(titleHandler.chatId, chunk.data)
      }
    } catch (error) {
      console.error("Failed to persist generated title:", error)
    }
  }

  override reconnectToStream(
    options: Parameters<HttpChatTransport<BizUIMessage>["reconnectToStream"]>[0],
  ) {
    options.chatId = encodeURIComponent(options.chatId)
    return super.reconnectToStream(options)
  }
}
