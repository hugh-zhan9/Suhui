import type { PropsWithChildren, ReactNode } from "react"

export const PersistentEntryListBody = ({
  entriesIds,
  isLoading,
  loadingFallback,
  emptyFallback,
  children,
}: PropsWithChildren<{
  entriesIds: string[]
  isLoading: boolean
  loadingFallback: ReactNode
  emptyFallback: ReactNode
}>) => (
  <>
    {children}
    {entriesIds.length === 0 &&
      (isLoading ? (
        <div className="absolute inset-0 overflow-hidden">{loadingFallback}</div>
      ) : (
        emptyFallback
      ))}
  </>
)
