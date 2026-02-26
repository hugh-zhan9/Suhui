import { fileURLToPath } from "node:url"
import { app, protocol } from "electron"
import path from "pathe"

// Polyfill CommonJS globals for ESM context (some transitive deps need these)
const __filename = fileURLToPath(import.meta.url)
const __dirname = fileURLToPath(new URL(".", import.meta.url))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).__filename = __filename
;(globalThis as any).__dirname = __dirname

if (import.meta.env.DEV) app.setPath("userData", path.join(app.getPath("appData"), "FreeFolo(dev)"))
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      bypassCSP: true,
      supportFetchAPI: true,
      secure: true,
    },
  },
])
