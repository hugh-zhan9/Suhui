export const shouldShowInlineStarInEntryListHeader = ({
  isWideMode: _isWideMode,
  hasEntry: _hasEntry,
}: {
  isWideMode: boolean
  hasEntry: boolean
}) => {
  // 设计约束：收藏按钮仅保留在文章详情右上角，不在列表头部展示。
  return false
}
