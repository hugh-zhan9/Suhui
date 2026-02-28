export const shouldDisableInlineMediaInSocialLayout = ({
  noMedia,
  mediaCount,
}: {
  noMedia: boolean
  mediaCount: number
}) => {
  if (noMedia) return true
  return mediaCount > 0
}
