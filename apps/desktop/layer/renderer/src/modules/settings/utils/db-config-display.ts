export const formatDisplayValue = (value?: string, fallback = "") => {
  if (!value || value.trim().length === 0) return fallback
  return value
}

export const formatDisplayList = (values: string[], fallback = "") => {
  if (!values || values.length === 0) return fallback
  return values.join(", ")
}
