import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"

import path from "pathe"

import { backupApplicationService } from "~/application/backup/service"
import { logger } from "~/logger"
import { DBManager } from "~/manager/db"
import type { DbType } from "~/manager/db-config"

export type DbConversionResult = {
  from: DbType
  to: DbType
  /** 源库的连接串/文件路径。转换成功后源库**保留**，由用户自行删除。 */
  sourceDbConn: string
  targetDbConn: string
  recordCount: number
}

export type DbConversionInput = {
  to: DbType
  /** 目标库地址：sqlite 是文件路径，postgres 是 host:port/db 或 DSN。缺省用默认解析。 */
  targetDbConn?: string
  targetDbUser?: string
  targetDbPassword?: string
}

/**
 * Postgres ↔ SQLite 双向转换。
 *
 * 走备份格式而非逐表拷贝：`.suhui-backup` 已经带 SHA-256 校验、原子写入、
 * merge/replace 语义与安全快照，而 `BackupStorage` 是可注入接口，按方言换实现即可。
 *
 * 非破坏性：先导出 → 切到目标库 → replace 恢复 → 校验。任一步失败都切回源方言，
 * 源库分毫未动。成功后源库仍然保留。
 */
export class DbConversionApplicationService {
  async convert(input: DbConversionInput): Promise<DbConversionResult> {
    const sourceConfig = DBManager.getEffectiveConfig()
    if (sourceConfig.dbType === input.to) {
      throw new Error(`Database is already using ${input.to}`)
    }

    // 目标地址必须显式定下来：`normalizeDbConfigOverride` 遇到空 dbConn 会返回 null，
    // 于是 switchDatabase 退回按 env 解析——既有 Postgres 安装的 DB_CONN 仍在环境里，
    // 切库会静默不发生，接着 replace 恢复就打在源库上。
    const targetDbConn =
      input.targetDbConn?.trim() || (input.to === "sqlite" ? DBManager.getDefaultSqlitePath() : "")
    if (!targetDbConn) {
      throw new Error("Converting to postgres requires a target connection (host:port/db or DSN)")
    }

    const stagingDir = mkdtempSync(path.join(tmpdir(), "suhui-db-conversion-"))
    const bundlePath = path.join(stagingDir, "conversion.suhui-backup")

    try {
      // 1. 从源库导出（此时数据库仍正常服务）
      const exported = await backupApplicationService.exportToFile(bundlePath)
      logger.info("[DbConversion] exported source database", {
        from: sourceConfig.dbType,
        recordCount: exported.footer.recordCount,
      })

      // 2. 切到目标库。switchDatabase 会先建候选连接并跑迁移，失败自动回滚
      await DBManager.switchDatabase({
        dbType: input.to,
        dbConn: targetDbConn,
        dbUser: input.targetDbUser ?? "",
        dbPassword: input.targetDbPassword ?? "",
      })

      // 切库若没真正生效就绝不能往下走：replace 恢复会清空并重写当前库。
      const switched = DBManager.getEffectiveConfig()
      if (switched.dbType !== input.to) {
        throw new Error(
          `Database switch did not take effect: expected ${input.to}, still on ${switched.dbType}`,
        )
      }

      try {
        // 3. 以 replace 语义灌入目标库
        const release = await DBManager.beginMaintenance()
        try {
          const confirmation = await backupApplicationService.prepareReplace(bundlePath)
          await backupApplicationService.restoreFromFile({
            path: bundlePath,
            mode: "replace",
            confirmationToken: confirmation.token,
          })
        } finally {
          await release()
        }
      } catch (error) {
        // 恢复失败：切回源库，源数据未被触碰
        logger.error("[DbConversion] restore failed, reverting dialect", {
          error: error instanceof Error ? error.message : String(error),
        })
        await DBManager.switchDatabase({
          dbType: sourceConfig.dbType,
          dbConn: sourceConfig.dbConn,
          dbUser: sourceConfig.dbUser,
          dbPassword: sourceConfig.dbPassword,
        })
        throw error
      }

      const targetConfig = DBManager.getEffectiveConfig()
      return {
        from: sourceConfig.dbType,
        to: targetConfig.dbType,
        sourceDbConn: sourceConfig.dbConn,
        targetDbConn: targetConfig.dbConn,
        recordCount: exported.footer.recordCount,
      }
    } finally {
      rmSync(stagingDir, { recursive: true, force: true })
    }
  }
}

export const dbConversionApplicationService = new DbConversionApplicationService()
