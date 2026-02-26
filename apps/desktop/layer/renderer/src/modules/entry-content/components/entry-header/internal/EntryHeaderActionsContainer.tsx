import clsx from "clsx"
import { memo } from "react"

import { CommandActionButton } from "~/components/ui/button/CommandActionButton"
import { useRouteParams } from "~/hooks/biz/useRouteParams"
import { useIsEntryStarred } from "@follow/store/collection/hooks"
import { COMMAND_ID } from "~/modules/command/commands/id"
import { useRunCommandFn } from "~/modules/command/hooks/use-command"

import { EntryHeaderActions } from "../../../actions/header-actions"
import { MoreActions } from "../../../actions/more-actions"
import { useEntryHeaderContext } from "./context"

function EntryHeaderActionsContainerImpl({ isSmallWidth }: { isSmallWidth?: boolean }) {
  const { entryId } = useEntryHeaderContext()
  const { view } = useRouteParams()
  const isStarred = useIsEntryStarred(entryId)
  const runCmdFn = useRunCommandFn()

  return (
    <div className={clsx("relative flex shrink-0 items-center justify-end gap-2")}>
      <CommandActionButton
        commandId={COMMAND_ID.entry.star}
        active={isStarred}
        onClick={runCmdFn(COMMAND_ID.entry.star, [{ entryId, view }])}
        id={`${entryId}/${COMMAND_ID.entry.star}/quick`}
      />
      {!isSmallWidth && <EntryHeaderActions entryId={entryId} view={view} />}
      <MoreActions entryId={entryId} view={view} showMainAction={isSmallWidth} />
    </div>
  )
}

export const EntryHeaderActionsContainer = memo(EntryHeaderActionsContainerImpl)
