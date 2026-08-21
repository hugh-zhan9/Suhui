// 这两张表现在由 postgres.ts 定义、经生成器落到 sqlite.ts，
// 此处保留原有模块路径以兼容既有引用（含测试里的 vi.mock）。
export { appliedSyncOpsTable, pendingSyncOpsTable } from "./sqlite"
