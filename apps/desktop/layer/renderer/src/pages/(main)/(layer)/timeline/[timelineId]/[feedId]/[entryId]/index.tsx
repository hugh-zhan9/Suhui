import { useRouteParamsSelector } from "~/hooks/biz/useRouteParams"
import { EntryContent } from "~/modules/entry-content/EntryContent"

export const Component = () => {
  const entryId = useRouteParamsSelector((s) => s.entryId)

  if (!entryId) return null

  return (
    <EntryContent
      entryId={entryId}
      className="h-full w-full"
    />
  )
}
