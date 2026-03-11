# Add Postgres .env Example Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在仓库根目录新增 `.env-example`，仅包含 Postgres 示例配置。

**Architecture:** 新增静态示例文件，不参与运行时读取，仅用于用户参考。

**Tech Stack:** 文本文件（无运行时逻辑）

---

### Task 1: 新增 Postgres 示例文件

**Files:**

- Create: `.env-example`

**Step 1: 确认是否允许跳过测试（仅新增示例文件）**

- 说明：此任务不涉及运行时代码，仅新增示例配置文件。请确认是否允许跳过测试步骤。

**Step 2: 写入示例内容**

```env
DB_TYPE=postgres
DB_CONN=127.0.0.1:5432/suhui
DB_USER=postgres
DB_PASSWORD=your_password
```

**Step 3: 提交**

```bash
git add .env-example
git commit -m "docs: add postgres env example"
```
