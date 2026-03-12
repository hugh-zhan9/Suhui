# RSSHub Docker 部署实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提供一个可直接运行的 RSSHub Docker Compose 文件，并在 README 中说明默认与备用镜像方案。

**Architecture:** 在根目录新增独立的 `docker-compose.rsshub.yaml`，避免与现有 PostgreSQL compose 说明冲突。README 增加一个轻量部署小节，解释默认 `latest` 镜像和备用 `chromium-bundled` 镜像的适用场景。

**Tech Stack:** Docker Compose、RSSHub 官方镜像、Redis 7 Alpine、Markdown 文档

---

### Task 1: 为 compose 约定写失败验证

**Files:**

- Create: `docker-compose.rsshub.yaml`
- Modify: `README.md`

**Step 1: 写失败验证目标**

目标：

- `docker compose -f docker-compose.rsshub.yaml config` 能成功解析
- compose 中存在 `rsshub` 和 `redis` 两个服务
- `redis` 暴露宿主机端口
- `rsshub` 默认镜像为 `diygod/rsshub:latest`

**Step 2: 先运行不存在文件的校验，确认当前为红灯**

Run: `docker compose -f docker-compose.rsshub.yaml config`

Expected: FAIL，提示找不到 `docker-compose.rsshub.yaml`

**Step 3: 写最小实现**

- 新建 `docker-compose.rsshub.yaml`
- 增加 `rsshub` 与 `redis` 服务
- 配置端口、命名卷和基础环境变量

**Step 4: 再次运行校验，确认转绿**

Run: `docker compose -f docker-compose.rsshub.yaml config`

Expected: PASS，并输出标准化后的 compose 配置

### Task 2: 更新 README 文档

**Files:**

- Modify: `README.md`

**Step 1: 写失败验证目标**

目标：

- README 新增 RSSHub Docker 部署说明
- 说明默认使用 `latest`
- 说明可切换到 `chromium-bundled`

**Step 2: 定位现有部署文档位置**

Run: `rg -n "docker-compose|PostgreSQL|RSSHub" README.md`

Expected: 找到适合插入 RSSHub 部署说明的位置

**Step 3: 写最小文档实现**

- 增加启动命令
- 增加本地访问地址
- 增加 Redis 暴露风险说明
- 增加两种镜像的切换说明

**Step 4: 人工检查文档一致性**

Run: `sed -n '1,220p' README.md`

Expected: 端口、镜像名、文件名与 compose 保持一致

### Task 3: 验证与记录

**Files:**

- Modify: `docs/AI_CHANGELOG.md`

**Step 1: 运行最终验证**

Run: `docker compose -f docker-compose.rsshub.yaml config`

Expected: PASS

**Step 2: 执行 flight-recorder**

Run:

```bash
python3 "/Users/zhangyukun/.codex/skills/flight-recorder/scripts/log_change.py" "Feature" "新增RSSHub Docker Compose 部署文件与说明" "新增本地部署入口，主要风险是Redis裸暴露仅适合本机开发环境，若用户误用于公网会产生安全风险。" "S2" "docker-compose.rsshub.yaml,README.md"
```

Expected: `docs/AI_CHANGELOG.md` 追加本次变更记录
