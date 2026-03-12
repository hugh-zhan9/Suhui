import { ActionButton } from "@suhui/components/ui/button/action-button.js"
import { useIsEntryStarred } from "@suhui/store/collection/hooks"
import { useEntry } from "@suhui/store/entry/hooks"
import { useSubscriptionByFeedId } from "@suhui/store/subscription/hooks"
import clsx from "clsx"
import { memo } from "react"

import { CommandActionButton } from "~/components/ui/button/CommandActionButton"
import { isPDFExportSupportedView } from "~/hooks/biz/export-as-pdf"
import { useRouteParams } from "~/hooks/biz/useRouteParams"
import { COMMAND_ID } from "~/modules/command/commands/id"
import { useRunCommandFn } from "~/modules/command/hooks/use-command"

import { EntryHeaderActions } from "../../../actions/header-actions"
import { MoreActions } from "../../../actions/more-actions"
import { useEntryHeaderContext } from "./context"

function EntryHeaderActionsContainerImpl({ isSmallWidth }: { isSmallWidth?: boolean }) {
  const { entryId } = useEntryHeaderContext()
  const { view } = useRouteParams()
  const isStarred = useIsEntryStarred(entryId)
  const entry = useEntry(entryId, (state) => ({ feedId: state.feedId }))
  const subscription = useSubscriptionByFeedId(entry?.feedId)
  const runCmdFn = useRunCommandFn()
  const exportView = subscription?.view ?? view
  const canShowExportAsPDF = isPDFExportSupportedView(exportView)

  return (
    <div className={clsx("relative flex shrink-0 items-center justify-end gap-2")}>
      <CommandActionButton
        commandId={COMMAND_ID.entry.star}
        active={isStarred}
        onClick={runCmdFn(COMMAND_ID.entry.star, [{ entryId, view }])}
        id={`${entryId}/${COMMAND_ID.entry.star}/quick`}
      />
      {canShowExportAsPDF && (
        <ActionButton
          tooltip="导出 PDF"
          icon={<i className="i-mgc-pdf-cute-re" />}
          onClick={runCmdFn(COMMAND_ID.entry.exportAsPDF, [{ entryId }])}
          id={`${entryId}/${COMMAND_ID.entry.exportAsPDF}/quick`}
        />
      )}
      {!isSmallWidth && <EntryHeaderActions entryId={entryId} view={view} />}
      <MoreActions entryId={entryId} view={view} showMainAction={isSmallWidth} />
    </div>
  )
}

export const EntryHeaderActionsContainer = memo(EntryHeaderActionsContainerImpl)
