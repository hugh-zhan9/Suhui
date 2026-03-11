# Add Docker Compose for PostgreSQL 18 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在仓库根目录新增 `docker-compose.yaml`，提供 PostgreSQL 18 最小可用配置（不指定 `POSTGRES_DB`，仅创建默认库）。

**Architecture:** 新增静态配置文件，包含镜像、端口、环境变量与数据卷。

**Tech Stack:** Docker Compose YAML

---

### Task 1: 新增 docker-compose.yaml

**Files:**

- Create: `docker-compose.yaml`

**Step 1: 确认是否允许跳过测试（仅新增配置文件）**

- 说明：此任务不涉及运行时代码，仅新增配置文件。请确认是否允许跳过测试步骤。

**Step 2: 写入配置内容**

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:18
    container_name: suhui-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_password
    volumes:
      - suhui_pgdata:/var/lib/postgresql/data

volumes:
  suhui_pgdata:
```

**Step 3: 提交**

```bash
git add docker-compose.yaml
git commit -m "docs: add postgres docker compose"
```
