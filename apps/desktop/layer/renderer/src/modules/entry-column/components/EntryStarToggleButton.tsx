import { useIsEntryStarred } from "@follow/store/collection/hooks"

import { CommandActionButton } from "~/components/ui/button/CommandActionButton"
import { useRouteParams } from "~/hooks/biz/useRouteParams"
import { COMMAND_ID } from "~/modules/command/commands/id"
import { useRunCommandFn } from "~/modules/command/hooks/use-command"

export const EntryStarToggleButton = ({
  entryId,
  className,
  size = "xs",
}: {
  entryId: string
  className?: string
  size?: "base" | "sm" | "lg" | "xs"
}) => {
  const { view } = useRouteParams()
  const isStarred = useIsEntryStarred(entryId)
  const runCmdFn = useRunCommandFn()
  const toggleStar = runCmdFn(COMMAND_ID.entry.star, [{ entryId, view }])

  return (
    <div
      className={className}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <CommandActionButton
        commandId={COMMAND_ID.entry.star}
        active={isStarred}
        size={size}
        onClick={toggleStar}
        id={`${entryId}/${COMMAND_ID.entry.star}/inline`}
      />
    </div>
  )
}
