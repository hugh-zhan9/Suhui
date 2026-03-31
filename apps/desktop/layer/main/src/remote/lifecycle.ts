import { logger } from "~/logger"

import { RemoteServerManager } from "./manager"

export async function initializeRemoteAccess() {
  try {
    const status = await RemoteServerManager.start()
    logger.info("[Remote] server started", status)
  } catch (error) {
    logger.error("[Remote] failed to start server", {
      error: error instanceof Error ? error.message : String(error),
      status: RemoteServerManager.getStatus(),
    })
  }
}

export async function shutdownRemoteAccess() {
  await RemoteServerManager.stop()
  logger.info("[Remote] server stopped")
}
