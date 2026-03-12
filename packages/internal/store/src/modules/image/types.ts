import type { ImageSchema } from "@follow/database/schemas/types"

export type ImageModel = Omit<ImageSchema, "createdAt"> & {
  createdAt: Date
}
