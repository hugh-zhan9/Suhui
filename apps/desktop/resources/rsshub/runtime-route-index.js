const ROUTE_PARAM_PATTERN = /:(\w+)(?:\{[^}]*\})?[?*+]?/g

const extractPathParamKeys = (routePath) => {
  const keys = []
  if (!routePath) return keys
  for (const matched of routePath.matchAll(ROUTE_PARAM_PATTERN)) {
    const key = matched[1]
    if (key && !keys.includes(key)) keys.push(key)
  }
  return keys
}

const normalizeParameters = (routePath, parameters) => {
  const normalized = {}
  if (parameters && typeof parameters === "object") {
    for (const [key, value] of Object.entries(parameters)) {
      normalized[key] = typeof value === "string" ? value : ""
    }
  }
  for (const key of extractPathParamKeys(routePath)) {
    if (!(key in normalized)) {
      normalized[key] = ""
    }
  }
  return normalized
}

export const buildLiteRouteIndex = (routes) => {
  return routes.map((routePath) => ({
    namespace: "lite",
    path: routePath,
    name: routePath,
    siteUrl: "",
    example: routePath,
    description: "Lite 内置路由",
    parameters: normalizeParameters(routePath, null),
    categories: [],
    maintainers: [],
  }))
}

export const flattenOfficialNamespaces = (namespaces) => {
  const flattened = []
  if (!namespaces || typeof namespaces !== "object") return flattened

  for (const [namespaceKey, namespaceValue] of Object.entries(namespaces)) {
    const routes = namespaceValue?.routes
    if (!routes || typeof routes !== "object") continue

    for (const [routePath, routeConfig] of Object.entries(routes)) {
      const fullPath = `/${namespaceKey}${routePath.startsWith("/") ? routePath : `/${routePath}`}`
      flattened.push({
        namespace: namespaceKey,
        path: fullPath,
        name: typeof routeConfig?.name === "string" ? routeConfig.name : fullPath,
        siteUrl: typeof routeConfig?.url === "string" ? routeConfig.url : "",
        example:
          typeof routeConfig?.example === "string" && routeConfig.example.length > 0
            ? routeConfig.example.startsWith("/")
              ? routeConfig.example
              : `/${routeConfig.example}`
            : fullPath,
        description: typeof routeConfig?.description === "string" ? routeConfig.description : "",
        parameters: normalizeParameters(fullPath, routeConfig?.parameters),
        categories: Array.isArray(routeConfig?.categories)
          ? routeConfig.categories.filter((item) => typeof item === "string")
          : [],
        maintainers: Array.isArray(routeConfig?.maintainers)
          ? routeConfig.maintainers.filter((item) => typeof item === "string")
          : [],
      })
    }
  }

  flattened.sort((a, b) => a.path.localeCompare(b.path))
  return flattened
}
