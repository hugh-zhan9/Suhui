import type { ListSchema } from "@suhui/database/schemas/types"

export type CreateListModel = Pick<ListModel, "description" | "image" | "view"> & {
  title: string
}

export type ListModel = Omit<ListSchema, "feedIds"> & {
  feedIds: string[]
  type: "list"
}
