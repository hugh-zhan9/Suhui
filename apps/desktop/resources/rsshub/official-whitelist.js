const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const compileRoutePattern = (pattern) => {
  const normalized = pattern.startsWith("/") ? pattern : `/${pattern}`
  const regexSource = normalized
    .split("/")
    .map((segment) => {
      if (!segment) return ""
      if (segment.startsWith(":")) {
        if (segment.endsWith("?")) {
          return "(?:[^/]+)?"
        }
        return "[^/]+"
      }
      return escapeRegex(segment)
    })
    .join("/")
  return new RegExp(`^${regexSource}$`)
}

export const createWhitelistMatcher = (patterns) => {
  const regexList = patterns.map((pattern) => compileRoutePattern(pattern))
  return (pathname) => regexList.some((regex) => regex.test(pathname))
}
