import { useQuery } from "@tanstack/react-query"

import { useAISettingKey } from "~/atoms/settings/ai"
import type { AIConfiguration } from "~/lib/ai-byok"
import { buildLocalAIConfiguration } from "~/lib/ai-byok"
import { followApi } from "~/lib/api-client"

export const useAIConfiguration = (): { data: AIConfiguration | undefined; isLoading: boolean } => {
  const byok = useAISettingKey("byok")
  const localConfiguration = buildLocalAIConfiguration(byok)

  const query = useQuery({
    queryKey: ["aiConfiguration"],
    queryFn: async () => {
      return followApi.ai.config()
    },
    enabled: !localConfiguration,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  if (localConfiguration) {
    return {
      data: localConfiguration,
      isLoading: false,
    }
  }

  return {
    data: query.data,
    isLoading: query.isLoading,
  }
}
