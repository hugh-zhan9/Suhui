import { defineQuery } from "~/lib/defineQuery"

export const settings = {
  get: () =>
    defineQuery(["settings"], async () => {
      // [Local Mode] Return empty settings, no remote sync needed
      return { data: { settings: {}, updated: {} } } as any
    }),
}
