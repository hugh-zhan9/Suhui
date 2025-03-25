import { OpenPanel } from "@openpanel/sdk"

import { proxyEnv } from "./proxy-env"

export const op = new OpenPanel({
  clientId: proxyEnv.OPENPANEL_CLIENT_ID ?? "",

  apiUrl: proxyEnv.OPENPANEL_API_URL,
  // waitForProfile: true,
})
