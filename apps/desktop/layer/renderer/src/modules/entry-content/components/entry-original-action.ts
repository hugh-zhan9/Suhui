export const shouldShowOriginalActionButton = ({
  showOriginalAction = false,
  url,
}: {
  showOriginalAction?: boolean
  url?: string | null
}) => Boolean(showOriginalAction && url)
