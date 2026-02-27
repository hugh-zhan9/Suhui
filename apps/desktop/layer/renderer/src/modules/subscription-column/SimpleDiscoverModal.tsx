import { Button } from "@follow/components/ui/button/index.js"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@follow/components/ui/form/index.jsx"
import { Input } from "@follow/components/ui/input/index.js"
import { SegmentGroup, SegmentItem } from "@follow/components/ui/segment/index.js"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import type { ChangeEvent } from "react"
import { useCallback } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { useModalStack } from "~/components/ui/modal/stacked/hooks"
import { ipcServices } from "~/lib/client"
import { toastFetchError } from "~/lib/error-parser"

import { FeedForm } from "../discover/FeedForm"
import type { RsshubRuntimeStatus } from "./rsshub-precheck"
import { isRsshubRuntimeRunning, toRsshubRuntimeError } from "./rsshub-precheck"
import { getSimpleDiscoverModes, shouldShowDiscoverJumpHint } from "./simple-discover-options"

const formSchema = z.object({
  keyword: z.string().min(1),
  type: z.enum(["rss", "rsshub"]),
})

const typeConfig = {
  rss: {
    label: "discover.rss_url",
    placeholder: "https://example.com/feed.xml",
    prefix: ["https://", "http://"],
    default: "https://",
  },
  rsshub: {
    label: "discover.rss_hub_route",
    placeholder: "rsshub://github/issue/follow/follow",
    prefix: ["rsshub://"],
    default: "rsshub://",
  },
} as const

export function SimpleDiscoverModal({ dismiss }: { dismiss: () => void }) {
  const { t } = useTranslation()
  const { present } = useModalStack()
  const discoverModes = getSimpleDiscoverModes()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      keyword: "",
      type: "rss",
    },
  })

  const watchedType = form.watch("type")
  const currentConfig = typeConfig[watchedType]

  const ensureLocalRsshubReady = async () => {
    const dbIpc = ipcServices?.db as
      | {
          getRsshubStatus?: () => Promise<{ status?: RsshubRuntimeStatus }>
          restartRsshub?: () => Promise<unknown>
        }
      | undefined

    const state = await dbIpc?.getRsshubStatus?.()
    if (isRsshubRuntimeRunning(state?.status)) {
      return
    }

    await dbIpc?.restartRsshub?.()
    const stateAfterRestart = await dbIpc?.getRsshubStatus?.()
    if (!isRsshubRuntimeRunning(stateAfterRestart?.status)) {
      throw toRsshubRuntimeError(stateAfterRestart?.status || state?.status)
    }
  }

  const mutation = useMutation({
    mutationFn: async ({ keyword, type }: { keyword: string; type: string }) => {
      if (type === "rsshub") {
        await ensureLocalRsshubReady()
      }
      present({
        title: t("feed_form.add_feed"),
        content: ({ dismiss: dismissFeedForm }) => (
          <FeedForm
            url={keyword}
            onSuccess={() => {
              dismissFeedForm()
              dismiss()
            }}
          />
        ),
      })
      return []
    },
    onError: (error) => {
      toastFetchError(error as Error)
    },
  })

  const handleKeywordChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const trimmedKeyword = event.target.value.trimStart()
      const { prefix } = currentConfig

      if (!prefix || prefix.length === 0) {
        form.setValue("keyword", trimmedKeyword, { shouldValidate: true })
        return
      }

      const isValidPrefix = prefix.find((p) => trimmedKeyword.startsWith(p))
      if (!isValidPrefix) {
        form.setValue("keyword", prefix[0]!)
        return
      }

      if (trimmedKeyword.startsWith(`${isValidPrefix}${isValidPrefix}`)) {
        form.setValue("keyword", trimmedKeyword.slice(isValidPrefix.length))
        return
      }

      form.setValue("keyword", trimmedKeyword)
    },
    [form, currentConfig],
  )

  const handleTypeChange = useCallback(
    (value: string) => {
      form.setValue("type", value as any)
      const newConfig = typeConfig[value as keyof typeof typeConfig]
      if (newConfig.default) {
        form.setValue("keyword", newConfig.default)
      } else {
        form.setValue("keyword", "")
      }
    },
    [form],
  )

  function onSubmit(values: z.infer<typeof formSchema>) {
    mutation.mutate(values)
  }

  return (
    <div className="flex min-h-[400px] w-[600px] flex-col">
      <div className="mb-6">
        <p className="text-sm text-text-secondary">
          {t("discover.find_feeds_description", "Find and add new feeds to your collection")}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Type Selector */}
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem className="relative">
                <FormControl>
                  <SegmentGroup value={field.value} onValueChanged={handleTypeChange}>
                    {discoverModes.map((mode) => (
                      <SegmentItem
                        key={mode}
                        value={mode}
                        label={mode === "rss" ? t("words.rss") : t("words.rsshub")}
                      />
                    ))}
                  </SegmentGroup>
                </FormControl>
                {shouldShowDiscoverJumpHint() ? (
                  <div className="absolute bottom-0 right-0 flex flex-col flex-wrap items-end gap-1 text-sm text-text-secondary" />
                ) : null}
              </FormItem>
            )}
          />

          {/* Input Field */}
          <FormField
            control={form.control}
            name="keyword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t(currentConfig.label)}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={currentConfig.placeholder}
                    {...field}
                    onChange={handleKeywordChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={dismiss}>
              {t("words.cancel", { ns: "common" })}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t("words.searching", "Searching...") : t("discover.preview")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
