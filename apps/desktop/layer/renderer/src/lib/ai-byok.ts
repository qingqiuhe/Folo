import { defaultAISettings } from "@follow/shared/settings/defaults"
import type {
  AISettings,
  ByokProviderName,
  UserByokProviderConfig,
  UserByokSettings,
} from "@follow/shared/settings/interface"
import { getStorageNS } from "@follow/utils/ns"
import type { ConfigResponse } from "@follow-app/client-sdk"
import { useSyncExternalStore } from "react"

const AI_SETTINGS_STORAGE_KEY = getStorageNS("ai")

const DEFAULT_MODEL_BY_PROVIDER: Record<ByokProviderName, string> = {
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  "vercel-ai-gateway": "gpt-4o",
  openrouter: "gpt-4o",
  "openai-compatible": "gpt-4o",
}

export interface LocalAIConfiguration {
  kind: "byok"
  defaultModel: string | null
  availableModels: string[]
  availableModelsMenu: NonNullable<ConfigResponse["availableModelsMenu"]>
  usage: ConfigResponse["usage"]
  rateLimit: null
  freeQuota?: undefined
}

export type AIConfiguration = ConfigResponse | LocalAIConfiguration

const trimToUndefined = (value?: string | null) => {
  const trimmed = value?.trim()
  return trimmed || undefined
}

const getAISettingsSnapshot = (): AISettings => {
  if (typeof window === "undefined") {
    return defaultAISettings
  }

  try {
    const rawValue = localStorage.getItem(AI_SETTINGS_STORAGE_KEY)
    if (!rawValue) {
      return defaultAISettings
    }

    const parsedValue = JSON.parse(rawValue)
    if (!parsedValue || typeof parsedValue !== "object") {
      return defaultAISettings
    }

    return {
      ...defaultAISettings,
      ...parsedValue,
      byok: {
        ...defaultAISettings.byok,
        ...parsedValue.byok,
      },
    }
  } catch {
    return defaultAISettings
  }
}

export const getStoredByokSettings = (): UserByokSettings => {
  return getAISettingsSnapshot().byok ?? defaultAISettings.byok
}

export const getByokProviderLabel = (provider: ByokProviderName): string => {
  switch (provider) {
    case "openai": {
      return "OpenAI"
    }
    case "google": {
      return "Google"
    }
    case "vercel-ai-gateway": {
      return "Vercel AI Gateway"
    }
    case "openrouter": {
      return "OpenRouter"
    }
    case "openai-compatible": {
      return "OpenAI Compatible"
    }
    default: {
      return provider
    }
  }
}

export const getByokResolvedModel = (provider: UserByokProviderConfig): string => {
  return trimToUndefined(provider.model) ?? DEFAULT_MODEL_BY_PROVIDER[provider.provider]
}

export const getByokProviderDisplayName = (provider: UserByokProviderConfig): string => {
  return trimToUndefined(provider.name) ?? getByokProviderLabel(provider.provider)
}

export const getByokModelValue = (provider: UserByokProviderConfig): string => {
  return `${provider.provider}/${getByokResolvedModel(provider)}`
}

export const isByokProviderConfigured = (provider: UserByokProviderConfig): boolean => {
  return Boolean(trimToUndefined(provider.apiKey))
}

export const getConfiguredByokProviders = (
  byok?: UserByokSettings | null,
): UserByokProviderConfig[] => {
  if (!byok?.enabled) {
    return []
  }

  return (byok.providers ?? []).filter(isByokProviderConfigured)
}

export const isDirectByokEnabled = (byok?: UserByokSettings | null): boolean => {
  return getConfiguredByokProviders(byok).length > 0
}

export const getActiveByokProvider = (
  byok: UserByokSettings | null | undefined,
  selectedModel?: string | null,
): UserByokProviderConfig | null => {
  const providers = getConfiguredByokProviders(byok)
  if (providers.length === 0) {
    return null
  }

  if (selectedModel) {
    const matchingProvider = providers.find((provider) => getByokModelValue(provider) === selectedModel)
    if (matchingProvider) {
      return matchingProvider
    }
  }

  return providers[0] ?? null
}

export const buildLocalAIConfiguration = (
  byok?: UserByokSettings | null,
): LocalAIConfiguration | null => {
  const providers = getConfiguredByokProviders(byok)
  if (providers.length === 0) {
    return null
  }

  const availableModelsMenu = providers.map((provider) => {
    const model = getByokResolvedModel(provider)
    const name = trimToUndefined(provider.name)
    const providerLabel = getByokProviderLabel(provider.provider)

    return {
      value: getByokModelValue(provider),
      label:
        provider.provider === "openai-compatible" && name
          ? `${name} - ${model}`
          : `${providerLabel} - ${model}`,
    }
  })

  const availableModels = availableModelsMenu.reduce<string[]>((models, item) => {
    if (item.value) {
      models.push(item.value)
    }

    return models
  }, [])

  return {
    kind: "byok",
    defaultModel: availableModels[0] ?? null,
    availableModels,
    availableModelsMenu,
    usage: {
      used: 0,
      total: 0,
      remaining: 0,
      resetAt: new Date(0),
    },
    rateLimit: null,
    freeQuota: undefined,
  }
}

export const isLocalAIConfiguration = (
  configuration: AIConfiguration | null | undefined,
): configuration is LocalAIConfiguration => {
  return Boolean(configuration && "kind" in configuration && configuration.kind === "byok")
}

const subscribeToByokChanges = (callback: () => void) => {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleEventBusChange = (event: Event) => {
    const eventData = event as Event & {
      _type?: string
      data?: {
        key?: string
      }
    }

    if (eventData._type === "SETTING_CHANGE_EVENT" && eventData.data?.key === "ai") {
      callback()
    }
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === AI_SETTINGS_STORAGE_KEY) {
      callback()
    }
  }

  window.addEventListener("EventBusEvent", handleEventBusChange)
  window.addEventListener("storage", handleStorageChange)

  return () => {
    window.removeEventListener("EventBusEvent", handleEventBusChange)
    window.removeEventListener("storage", handleStorageChange)
  }
}

export const getStoredDirectByokEnabled = (): boolean => {
  return isDirectByokEnabled(getStoredByokSettings())
}

export const useStoredDirectByokEnabled = (): boolean => {
  return useSyncExternalStore(
    subscribeToByokChanges,
    getStoredDirectByokEnabled,
    getStoredDirectByokEnabled,
  )
}
