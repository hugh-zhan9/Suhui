import { useQuery } from "@tanstack/react-query"

export const useServerConfigsQuery = () => {
  const { data } = useQuery({
    queryKey: ["server-configs"],
    queryFn: async () => {
      // [Local Mode] Return default configs instead of fetching from remote API
      return {
        data: {
          IS_IN_MAS_REVIEW: false,
          MAS_IN_REVIEW_VERSION: "",
          RELEASE_CHANNEL: "stable",
          AI_SHORTCUTS: [],
          PAYMENT_ENABLED: false,
          PAYMENT_PLAN_LIST: [],
        },
      }
    },
  })
  return data?.data
}
