import { stopPropagation } from "@follow/utils/dom"

export const EntryPlaceholderLogo = () => {
  return (
    <div
      data-hide-in-print
      onContextMenu={stopPropagation}
      className={
        "flex w-full min-w-0 flex-col items-center justify-center gap-3 px-12 pb-6 text-center duration-500"
      }
    >
      <p className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
        溯洄 (SuHui)
      </p>
      <p className="text-[14px] font-medium text-zinc-500 dark:text-zinc-400">溯源而读，回归纯粹</p>
    </div>
  )
}
