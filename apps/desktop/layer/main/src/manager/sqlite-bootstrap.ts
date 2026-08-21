import { mkdirSync } from "node:fs"

import path from "pathe"

/**
 * SQLite 的「确保数据库存在」等价物：文件由驱动按需创建，但父目录不会自动建。
 * 对应 postgres 侧的 ensurePostgresDatabaseExists。
 */
export const ensureSqliteDatabaseDirectory = (filePath: string) => {
  const directory = path.dirname(filePath)
  if (!directory || directory === ".") return directory
  mkdirSync(directory, { recursive: true })
  return directory
}
