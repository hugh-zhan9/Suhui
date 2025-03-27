import { OpenPanel } from "@follow/tracker/src/op"
import { getAnalytics } from "@react-native-firebase/analytics"

import { proxyEnv } from "./proxy-env"

const firebaseAnalytics = getAnalytics()

export const op = new OpenPanel({
  clientId: proxyEnv.OPENPANEL_CLIENT_ID ?? "",
  apiUrl: proxyEnv.OPENPANEL_API_URL,
  headers: {
    Origin: "https://app.follow.is",
  },
  sdk: "react-native",
  sdkVersion: "1.0.0",
  firebaseAnalytics,
})
