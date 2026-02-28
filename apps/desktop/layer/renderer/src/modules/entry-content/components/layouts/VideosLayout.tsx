import { IN_ELECTRON } from "@follow/shared/constants"
import { useEntry } from "@follow/store/entry/hooks"
import { transformVideoUrl } from "@follow/utils/url-for-video"
import { useMemo } from "react"

import { Media } from "~/components/ui/media/Media"
import { extractVideoUrlFromHtml } from "~/lib/extract-video-url"

import { EntryTitle } from "../EntryTitle"
import { ContentBody } from "./shared"
import type { EntryLayoutProps } from "./types"

const ViewTag = IN_ELECTRON ? "webview" : "iframe"

export const VideosLayout: React.FC<EntryLayoutProps> = ({
  entryId,
  compact = false,
  noMedia = false,
  translation,
}) => {
  const entry = useEntry(entryId, (state) => state)

  const inlineVideoUrl = useMemo(() => extractVideoUrlFromHtml(entry?.content), [entry?.content])

  const iframeSrc = useMemo(
    () =>
      transformVideoUrl({
        url: entry?.url || inlineVideoUrl || "",
        isIframe: !IN_ELECTRON,
        attachments: entry?.attachments,
      }),
    [entry?.attachments, entry?.url, inlineVideoUrl],
  )

  if (!entry) return null

  const viewProps: any = IN_ELECTRON ? { allowpopups: "true" } : { allowFullScreen: true }

  return (
    <div className="mx-auto flex h-full flex-col p-6">
      {!noMedia && (
        <div className="mb-6 w-full overflow-hidden shadow-lg rounded-xl bg-black">
          {iframeSrc ? (
            <ViewTag
              src={iframeSrc}
              referrerPolicy="strict-origin-when-cross-origin"
              className="aspect-video w-full border-none bg-black"
              {...viewProps}
            />
          ) : entry.media?.[0] ? (
            <Media
              src={entry.media[0].url}
              type={entry.media[0].type}
              className="aspect-video w-full object-contain"
            />
          ) : (
             <div className="center aspect-video w-full flex-col gap-2 bg-material-medium text-sm text-text-secondary">
               <i className="i-mgc-sad-cute-re size-8" />
               No playable video found
             </div>
          )}
        </div>
      )}

      {/* Content area below video */}
      <div className="flex-1 space-y-4">
        {/* Title */}
        <EntryTitle entryId={entryId} compact={compact} />

        {/* Description/Content or Transcript */}
        <ContentBody
          entryId={entryId}
          translation={translation}
          compact={compact}
          noMedia={true}
          className="text-base"
        />
      </div>
    </div>
  )
}
