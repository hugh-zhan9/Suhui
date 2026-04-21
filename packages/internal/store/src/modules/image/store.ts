import type { ImageSchema } from "@suhui/database/schemas/types"
import { ImagesService } from "@suhui/database/services/image"

import type { Hydratable, Resetable } from "../../lib/base"
import { createImmerSetter, createTransaction, createZustandStore } from "../../lib/helper"
import type { ImageModel } from "./types"

type ImageStore = {
  images: Record<string, ImageModel>
}

const defaultState: ImageStore = {
  images: {},
}

export const useImagesStore = createZustandStore<ImageStore>("images")(() => defaultState)

const set = useImagesStore.setState
const immerSet = createImmerSetter(useImagesStore)

type ImageInput = Pick<ImageSchema, "url" | "colors"> & {
  createdAt?: number | Date | null
}

const normalizeImageTimestamp = (image: ImageInput): ImageModel => {
  const { createdAt } = image
  const normalizedCreatedAt =
    createdAt instanceof Date
      ? createdAt
      : typeof createdAt === "number"
        ? new Date(createdAt)
        : new Date()

  return {
    ...image,
    createdAt: normalizedCreatedAt,
  }
}

class ImageActions implements Hydratable, Resetable {
  async hydrate() {
    const images = await ImagesService.getImageAll()
    imageActions.upsertManyInSession(images.map((image) => normalizeImageTimestamp(image)))
  }

  async reset() {
    const tx = createTransaction()
    tx.store(() => {
      set(defaultState)
    })
    tx.persist(() => ImagesService.purgeAllForMaintenance())
    await tx.run()
  }

  upsertManyInSession(images: ImageModel[]) {
    immerSet((state) => {
      for (const rawImage of images) {
        const image = normalizeImageTimestamp(rawImage)
        state.images[image.url] = image
      }
    })
  }

  async upsertMany(images: ImageModel[]) {
    const tx = createTransaction()
    tx.store(() => this.upsertManyInSession(images))
    tx.persist(() => {
      const imagesForDb = images.map((image) => ({
        ...image,
        createdAt: image.createdAt.getTime(),
      }))
      return ImagesService.upsertMany(imagesForDb as ImageSchema[])
    })
    await tx.run()
  }
}

export const imageActions = new ImageActions()
