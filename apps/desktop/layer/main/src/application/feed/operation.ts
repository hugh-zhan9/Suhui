const operations = new Map<string, Promise<unknown>>()

/** Coordinate feed identity writes, including both existing RSS refresh entry points. */
export const runFeedOperation = async <T>(
  feedId: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const previous = operations.get(feedId) ?? Promise.resolve()
  const current = previous.then(operation, operation)
  operations.set(feedId, current)
  try {
    return await current
  } finally {
    if (operations.get(feedId) === current) operations.delete(feedId)
  }
}
