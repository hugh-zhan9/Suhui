# FreeFolo 内嵌 RSSHub 开发计划

> 版本：1.0 | 最后更新：2026-02-27
> 关联文档：[技术设计](./rsshub-technical-design.md) | [总方案](./rsshub-embedded-design.md)

---

## 一、范围

**进范围**：
- 主进程 RSSHub 子进程管理（启动、健康检查、重试、冷却、重启）
- URL 改写与本地转发（`rsshub.app` / `rsshub://` / 自定义域名）
- IPC 接口与设置页状态展示
- 资源打包（`extraResource`）
- 基础安全边界（`127.0.0.1` + token）

**不进范围（V1）**：
- 全量 1000+ 路由（仅内置 Top 30）
- 远程插件化安装路由
- 云端同步

---

## 二、整体节奏

```
M0（POC，半天）→ 决策继续/终止 → M1 → M2 → M3 → M4
```

**总估时**：~4.5 天（不含 M0 POC）

---

## 三、M0：POC 验收门槛（继续/终止决策点）

> [!CAUTION]
> **满足全部 3 条才进入 M1，否则退为方案 D（运行时下载）。**

| # | 验收项 | 通过条件 |
|---|--------|---------|
| 1 | **体积** | esbuild 按需打包 Top 10 路由，bundle < 30MB |
| 2 | **运行** | Electron 环境下 `fork()` / `spawn(ELECTRON_RUN_AS_NODE=1)` 至少一种可正常响应 `/healthz` 和 RSS 路由请求 |
| 3 | **稳定性** | 模拟崩溃后指数退避 + cooldown 流程正常触发，主进程不受影响；200 次请求成功率 ≥ 99% |

**M0 产出物**（必须交付才能进入 M1）：
- bundle 体积数据（各路由单独 + Top 10 合计）
- `fork()` vs `spawn(ELECTRON_RUN_AS_NODE=1)` 启动对比结论
- 方案继续/终止决策记录（写入 `rsshub-technical-design.md` §十三决策记录）

---

## 四、里程碑详情

### M1：最小闭环（预估 1 天）

**目标**：本地 RSSHub 跑起来，`rsshub.app` URL 能正确订阅。

| 任务 | 负责文件 |
|------|---------|
| `RsshubManager`（fork + 健康探针 + 指数退避 + cooldown + token）| `manager/rsshub.ts` |
| `resolveRsshubUrl`（query/hash 保留 + 明确错误码）| `ipc/services/db.ts` |
| `fetchUrl` 扩展 token header | `ipc/services/db.ts` |
| `db.previewFeed` / `db.addFeed` 接入改写 | `ipc/services/db.ts` |

**M1 验收标准**：
- `rsshub.app/github/trending` URL 在本地成功改写并返回 XML
- 关停内置 RSSHub 后，订阅提示明确错误"内置 RSSHub 未运行"，不再出现泛化错误
- 崩溃重启流程（退避 + cooldown）可手动验证

---

### M2：稳态与可运维（预估 1.5 天）

**目标**：用户可感知状态，可操作重启。

| 任务 | 负责文件 |
|------|---------|
| IPC 接口（`getRsshubStatus` / `toggleRsshub` / `restartRsshub`）| `ipc/services/db.ts` |
| 设置页 UI（开关 + 状态 + cooldown 提示 + 立即重启按钮）| `modules/settings/` |
| Token 校验中间件（RSSHub 子进程侧）| `resources/rsshub/` |
| 日志轮转配置（10MB/5 个）| `resources/rsshub/` |
| 缓存目录上限（500MB，LRU）| `resources/rsshub/` |

**M2 验收标准**：
- 设置页状态实时反映 `running / starting / error / cooldown`
- `cooldown` 时"立即重启"可用，点击后进入 `starting`
- 非法 token 请求返回 403

---

### M3：打包集成（预估 1 天）

**目标**：应用打包后 RSSHub 随产物分发，开箱即用。

| 任务 | 负责文件 |
|------|---------|
| `scripts/build-rsshub.ts`（esbuild 按白名单打包）| `scripts/` |
| `scripts/rsshub-routes.ts`（Top 30 路由白名单）| `scripts/` |
| `forge.config.cts` 新增 `extraResource: ["./resources/rsshub"]` | `forge.config.cts` |
| 开发环境路径兼容（`app.isPackaged` 分支）| `manager/rsshub.ts` |

**M3 验收标准**：
- `pnpm build:electron:unsigned` 产物包含 `rsshub/index.js`，大小在预期范围
- 安装包在干净机器（无系统 Node）上正常订阅 RSSHub 路由

---

### M4：三平台验证（预估 1 天）

| 任务 | 说明 |
|------|------|
| macOS arm64 全流程验证 | 主开发平台，基准 |
| Windows x64 验证 | 重点：路径分隔符、防火墙弹框 |
| Linux AppImage 验证 | 重点：`process.resourcesPath` 路径解析 |

**M4 验收标准**：
- 三平台均可正常订阅 `rsshub.app/github/trending`
- 应用退出后子进程不残留（`ps aux | grep rsshub` 无输出）

---

### M5：安全审计与收尾（预估 0.5 天）

| 任务 | 说明 |
|------|------|
| Token 鉴权端到端验证 | 伪造 token 请求应返回 403 |
| 端口占用 edge case | 启动时目标端口被占，portfinder 是否正常避让 |
| Windows 防火墙 | 确认绑定 `127.0.0.1` 不触发弹框，必要时安装器预注册例外 |
| `AI-CONTEXT.md` 更新 | 同步内嵌 RSSHub 架构变更到项目上下文文件 |

---

## 五、测试规范

### 5.1 单元测试

| 用例 | 预期 |
|------|------|
| `rsshub.app` URL 改写（含 query + hash）| 正确改写到 `127.0.0.1:PORT/path?q=1#hash` |
| `rsshub://ns/route?q=1` 改写 | 正确改写到 `/ns/route?q=1` |
| 非 RSSHub URL | 原样返回，token 为 null |
| `status !== "running"` 时改写 | 抛出 code = `RSSHUB_LOCAL_UNAVAILABLE` 的错误 |
| 状态机：`stopped → running` | 正常流程 |
| 状态机：3 次失败 → `cooldown` | 退避次数和冷却时间正确 |
| 状态机：cooldown → `starting` | 用户手动触发或冷却期满后触发 |

### 5.2 集成测试

- 主进程 fork RSSHub，健康探针成功后 status = `running`
- `db.previewFeed("https://rsshub.app/github/trending")` 返回合法 XML
- 关停 RSSHub 后上述接口返回明确错误，不出现泛化"获取订阅源出错"

### 5.3 人工回归清单

- [ ] 编辑/取消订阅不受 RSSHub 进程波动影响
- [ ] 应用退出后子进程不残留
- [ ] `cooldown` UI 正确，"立即重启"可用
- [ ] 非内置路由给出友好提示（"该路由需要自建 RSSHub 实例"）
- [ ] Windows：127.0.0.1 绑定不触发防火墙弹框

---

## 六、风险与应对

| 风险 | 等级 | 应对 |
|------|:----:|------|
| bundle 体积 > 100MB | 🔴 高 | M0 验证，超限走方案 D |
| `fork()` 在某平台不稳定 | 🟡 中 | M0 对比 `spawn(ELECTRON_RUN_AS_NODE=1)` |
| 子进程持续崩溃 | 🟡 中 | cooldown 机制 + UI 告警，不影响主进程 |
| 端口冲突 | 🟢 低 | portfinder 自动避让 |
| Windows Defender 弹框 | 🟡 中 | 绑定 127.0.0.1；安装器预注册例外 |
| RSSHub 上游路由变更 | 🟡 中 | 锁定版本号，随应用版本升级 |

---

## 七、方案 D（兜底）

**触发条件**：M0 体积验证超过 100MB。

**方案**：首次使用 RSSHub 功能时，后台下载精简 RSSHub bundle 到 `userData/rsshub/`。

- 优点：安装包体积不变
- 缺点：(1) 首次使用需联网；(2) 需要下载进度 UI；(3) 需要 SHA256 完整性校验

若触发方案 D，需额外评估 ~2 天下载流程开发工时。

---

## 八、完成定义（DoD）

本功能完成的最终判定标准（**所有条件必须同时满足**）：

- [ ] 设计文档（`rsshub-technical-design.md`）与实现一致，决策记录已填写
- [ ] 本地打包后可开箱使用 RSSHub 路由（无需系统 Node，无需外部 rsshub.app）
- [ ] 错误可诊断：订阅失败时显示明确错误码和提示，不再只显示"获取订阅源出错"
- [ ] 崩溃可恢复：cooldown 后可手动触发重启并恢复正常
- [ ] 回归测试通过，人工回归清单全部打勾
- [ ] 应用退出后 RSSHub 子进程不残留

