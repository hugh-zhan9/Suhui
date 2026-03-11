# Postgres Docker Compose 文件设计

**目标**：在仓库根目录新增 `docker-compose.yaml`，包含 PostgreSQL 18 的最小可用配置，所有参数写在 compose 内。

## 背景与约束

- 用户要求使用 Docker Compose。
- 所有参数放在 `docker-compose.yaml` 中，不依赖外部 `.env`。
- 使用 PostgreSQL 18。

## 方案对比

1. 最小可用 Compose（选定）：仅包含镜像、端口、环境变量与数据卷。
2. 增加健康检查：更稳健但配置更复杂。
3. 增加资源限制：需要额外确认配额。

## 设计与范围

- 新增文件：`/docker-compose.yaml`
- 内容：
  - `image: postgres:18`
  - `container_name: suhui-postgres`
  - `ports: 5432:5432`
  - `environment`: `POSTGRES_USER=postgres`、`POSTGRES_PASSWORD=your_password`（不指定 `POSTGRES_DB`，默认库与用户同名）
  - `volumes`: `suhui_pgdata:/var/lib/postgresql/data`

## 验收

- 根目录存在 `docker-compose.yaml`
- 文件内容与上述配置一致
