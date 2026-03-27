import type { ByokProviderName } from "@follow/shared/settings/interface"

export const PROVIDER_OPTIONS: { value: ByokProviderName; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "vercel-ai-gateway", label: "Vercel AI Gateway" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai-compatible", label: "OpenAI Compatible (Custom)" },
]

export const PROVIDER_LABELS: Record<ByokProviderName, string> = Object.fromEntries(
  PROVIDER_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ByokProviderName, string>
