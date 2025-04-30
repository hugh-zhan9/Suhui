import type { z } from "zod"

import type { languageSchema } from "./hono"

export type SupportedActionLanguage = z.infer<typeof languageSchema>
export const ACTION_LANGUAGE_MAP: Record<
  SupportedActionLanguage,
  {
    label: string
    value: string
    code?: string
  }
> =
  /// keep-sorted
  {
    "zh-CN": {
      label: "Simplified Chinese",
      value: "zh-CN",
      code: "cmn",
    },
    "zh-TW": {
      label: "Traditional Chinese (Taiwan)",
      value: "zh-TW",
    },
    en: {
      label: "English",
      value: "en",
      code: "eng",
    },
    ja: {
      label: "Japanese",
      value: "ja",
      code: "jpn",
    },
  }
export const ACTION_LANGUAGE_KEYS = Object.keys(ACTION_LANGUAGE_MAP) as SupportedActionLanguage[]
