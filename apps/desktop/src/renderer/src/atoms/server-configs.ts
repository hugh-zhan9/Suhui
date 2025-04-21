import type { ServerConfigs } from "@follow/models/types"
import { atom } from "jotai"

import { createAtomHooks } from "~/lib/jotai"
import { isInMAS } from "~/lib/utils"

export const [, , useServerConfigs, , getServerConfigs, setServerConfigs] = createAtomHooks(
  atom<Nullable<ServerConfigs>>(null),
)

export const useIsInMASReview = () => {
  const serverConfigs = useServerConfigs()
  return isInMAS() && serverConfigs?.MAS_IN_REVIEW
}
