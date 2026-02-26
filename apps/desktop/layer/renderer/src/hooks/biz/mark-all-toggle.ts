export const resolveMarkAllToggleAction = (unreadCount: number) => {
  if (unreadCount > 0) {
    return {
      labelKey: "sidebar.feed_actions.mark_all_as_read",
      shouldMarkAsRead: true,
    } as const
  }

  return {
    labelKey: "sidebar.feed_actions.mark_all_as_unread",
    shouldMarkAsRead: false,
  } as const
}
