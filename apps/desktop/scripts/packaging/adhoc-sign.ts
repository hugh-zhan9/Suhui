import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"

type AdhocSignOptions = {
  platform: string
  isNoSignBuild: boolean
}

export function shouldAdhocSignPackagedApp({ platform, isNoSignBuild }: AdhocSignOptions) {
  return platform === "darwin" && isNoSignBuild
}

export function resolveAdhocSignTargets(outputPaths: string[]) {
  return outputPaths.flatMap((outputPath) => {
    if (outputPath.endsWith(".app")) {
      return [outputPath]
    }

    if (!existsSync(outputPath)) {
      return []
    }

    return readdirSync(outputPath)
      .filter((entry) => entry.endsWith(".app"))
      .map((entry) => join(outputPath, entry))
  })
}

export function adhocSignPackagedApp(appPath: string) {
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  })
}
