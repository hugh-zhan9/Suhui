import { SafeAreaProvider } from "react-native-safe-area-context"

import { Pager } from "./demo/Pager"

export default function App() {
  return (
    <SafeAreaProvider>
      <Pager />
    </SafeAreaProvider>
  )
}
