import { stopPropagation } from "@follow/utils/dom"

export const EntryPlaceholderLogo = () => {
  return (
    <div
      data-hide-in-print
      onContextMenu={stopPropagation}
      className={
        "flex w-full min-w-0 flex-col items-center justify-center gap-2 px-12 pb-6 text-center text-lg font-medium text-text-secondary duration-500"
      }
    >
      <i className="i-mgc-folo-bot-original size-16 text-text-tertiary" />
      <div>Welcome to FreeFolo</div>
    </div>
  )
}
