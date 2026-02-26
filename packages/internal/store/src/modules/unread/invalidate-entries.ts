export const invalidateEntriesForUnreadMutation = async () => {
  const { queryClient } = await import("../../context")
  await queryClient().invalidateQueries({
    queryKey: ["entries"],
  })
}
