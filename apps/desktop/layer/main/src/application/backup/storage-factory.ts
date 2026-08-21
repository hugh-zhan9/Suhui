import { getMainDialect } from "@suhui/database/db.main"

import type { BackupStorage } from "./storage"
import { PostgresBackupStorage } from "./storage"
import { SqliteBackupStorage } from "./storage.sqlite"

/** 按当前方言选择备份存储实现。转换功能正是靠切换方言后换实现来完成的。 */
export const createBackupStorage = (): BackupStorage =>
  getMainDialect() === "sqlite" ? new SqliteBackupStorage() : new PostgresBackupStorage()
