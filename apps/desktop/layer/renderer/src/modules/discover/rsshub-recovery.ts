import { parseRsshubLocalError, shouldShowRsshubRestartAction } from "../../lib/rsshub-local-error"

export const canRecoverRsshubByError = (errorMessage: string) =>
  shouldShowRsshubRestartAction(parseRsshubLocalError(errorMessage))
