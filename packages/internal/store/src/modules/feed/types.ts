import type { FeedSchema } from "@suhui/database/schemas/types"

export type FeedModel = Omit<FeedSchema, "updatedAt"> & {
  updatedAt?: number | null
  type: "feed"
  nonce?: string
}
