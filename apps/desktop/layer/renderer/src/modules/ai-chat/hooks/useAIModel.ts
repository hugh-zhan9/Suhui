import { useQuery } from "@tanstack/react-query"

import { followApi } from "~/lib/api-client"

const useAIConfiguration = () => {
  return useQuery({
    queryKey: ["aiConfiguration"],
    queryFn: async () => {
      return followApi.ai.config()
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

export const useAIModel = () => {
  const { data: configuration, isLoading } = useAIConfiguration()

  return {
    data: {
      currentModel: configuration?.currentModel,
      availableModels: configuration?.availableModels,
    },
    isLoading,
  }
}
