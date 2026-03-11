import { parseRsshubLocalError } from "../../lib/rsshub-local-error"

export const canRecoverRsshubByError = (errorMessage: string) =>
  parseRsshubLocalError(errorMessage) === "external_unconfigured"
