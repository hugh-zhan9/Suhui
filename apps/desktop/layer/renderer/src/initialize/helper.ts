import { tracker } from "@suhui/tracker"
import type { AuthUser } from "@follow-app/client-sdk"

export const setIntegrationIdentify = (user: AuthUser) => {
  tracker.identify(user)
}
