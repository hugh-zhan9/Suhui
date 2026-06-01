export const shouldShowOriginalActionButton = ({
  showOriginalAction = false,
  url,
}: {
  showOriginalAction?: boolean
  url?: string | null
}) => Boolean(showOriginalAction && url)

export const shouldShowReadabilityActionButton = ({
  showOriginalAction = false,
  url,
}: {
  showOriginalAction?: boolean
  url?: string | null
}) => Boolean(showOriginalAction && url)
