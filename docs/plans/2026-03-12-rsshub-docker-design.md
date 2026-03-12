# RSSHub Docker 部署设计

> 日期：2026-03-12
> 目标：为本地外部 RSSHub 提供可直接运行的 Docker Compose 部署文件，并在文档中保留 `latest` 与 `chromium-bundled` 两种镜像方案。

## 背景

当前仓库已移除内嵌 RSSHub 运行时，桌面应用改为依赖外部 RSSHub 实例。为了降低本地部署成本，需要提供一个独立的 Docker Compose 文件，便于用户快速在本机启动 RSSHub，并将其配置到溯洄中使用。

现有 `README.md` 已使用根目录 `docker-compose.yaml` 描述 PostgreSQL 部署，因此 RSSHub 部署文件不能复用同名文件，否则会和现有数据库说明冲突。

## 约束

- RSSHub Compose 文件放在根目录，命名为 `docker-compose.rsshub.yaml`
- 默认镜像使用 `diygod/rsshub:latest`
- 使用 `redis:7-alpine`
- Redis 需要映射宿主机端口，供 RSSHub 之外的本地服务复用
- 默认不启用 Redis 密码
- README 中要保留 `latest` 和 `chromium-bundled` 两种镜像说明

## 方案对比

### 方案 A：`rsshub + redis`，默认 `latest`，README 说明备用镜像

- 优点：文件简单，资源占用低，满足当前本地部署需求
- 优点：后续切换到 `chromium-bundled` 时只需要修改镜像 tag
- 缺点：部分依赖浏览器渲染的 RSSHub 路由可能不可用

### 方案 B：默认 `chromium-bundled`

- 优点：路由兼容性更高
- 缺点：镜像更大，启动更慢，本地资源占用更高

### 方案 C：同时提供两套 compose 文件

- 优点：区分更明确
- 缺点：维护成本更高，README 和后续支持成本增加

## 选择

采用方案 A。

理由：

- 用户当前优先级是快速本地部署
- 默认走 `latest` 更轻量
- 通过 README 保留备用镜像说明，后续调整成本低

## 文件设计

### `docker-compose.rsshub.yaml`

包含两个服务：

- `rsshub`
- `redis`

关键行为：

- `rsshub` 暴露 `1200:1200`
- `redis` 暴露 `6379:6379`
- `rsshub` 使用容器内地址 `redis://redis:6379/0`
- Redis 使用命名卷持久化
- 保留可覆盖环境变量：
  - `RSSHUB_PORT`
  - `REDIS_PORT`
  - `CACHE_EXPIRE`
  - `RSSHUB_ACCESS_KEY`

### `README.md`

新增 RSSHub Docker 部署说明，包含：

- 启动命令
- 默认访问地址 `http://localhost:1200`
- 在溯洄中配置外部 RSSHub 的方式
- Redis 端口暴露的说明与边界
- `latest` 与 `chromium-bundled` 的切换说明

## 风险

### 风险 1：Redis 裸暴露

Redis 以无密码方式暴露宿主机端口，仅适合本机开发和单用户环境，不适合公网或多人共用主机。

### 风险 2：`latest` 路由兼容性有限

部分需要浏览器渲染的 RSSHub 路由可能无法工作。README 中需要明确：若遇到动态页面抓取失败，可切换到 `diygod/rsshub:chromium-bundled`。

## 验证方式

- `docker compose -f docker-compose.rsshub.yaml config`
- 检查 README 中的启动命令、端口、镜像说明与 compose 保持一致
