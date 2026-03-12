import type { ImageSchema } from "@suhui/database/schemas/types"

export type ImageModel = Omit<ImageSchema, "createdAt"> & {
  createdAt: Date
}
