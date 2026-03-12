# ESLint 单文件放行 console 设计

> 日期：2026-03-12  
> 目标：仅放行 `packages/internal/database/src/migrate-indexed-db.ts` 中的 `console` 使用，不影响其他文件的 ESLint 规则。

## 背景与问题

提交时 `lint-staged` 触发 `eslint --fix`，该迁移文件内存在 `console.log`，违反 `no-console` 规则导致提交失败。

## 设计目标

- 仅对单一文件放行 `console`。
- 不影响全局 `no-console` 规则覆盖范围。
- 规则可追踪、可维护。

## 方案对比

1. **ESLint override（推荐）**  
   在 `eslint.config.mjs` 增加文件级 override，将 `no-console` 对该文件关闭。
   - 优点：范围最小、规则集中、易审计。
   - 缺点：需要改动全局配置文件。

2. 文件内 `eslint-disable` 注释
   - 优点：局部改动，不改全局配置。
   - 缺点：规则散落在代码中，维护一致性差。

3. 改用 `console.info/warn/error`
   - 优点：不改配置。
   - 缺点：不符合“仅放行”的需求。

## 选型结论

采用 **方案 1（ESLint override）**。

## 影响范围

仅 `packages/internal/database/src/migrate-indexed-db.ts` 允许 `console`，其他文件保持原有规则。

## 测试与验证

- 运行 `pnpm exec eslint packages/internal/database/src/migrate-indexed-db.ts`  
  期望：不再因 `no-console` 报错。
