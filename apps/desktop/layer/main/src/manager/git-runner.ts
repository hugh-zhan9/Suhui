import { exec } from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"
import { promisify } from "node:util"

const execAsync = promisify(exec)

export class GitRunner {
  private repoPath: string

  constructor(repoPath: string) {
    this.repoPath = repoPath
  }

  private async run(command: string, allowFail = false): Promise<string> {
    try {
      const { stdout } = await execAsync(command, { cwd: this.repoPath })
      return stdout.trim()
    } catch (err: any) {
      if (allowFail) {
        return err?.message || "Unknown error"
      }
      console.error(`[GitRunner] Command failed: ${command}`, err?.stderr)
      throw new Error(`Git error: ${err?.message || "Unknown error"}`)
    }
  }

  async checkIsRepo(): Promise<boolean> {
    try {
      await this.run("git status")
      return true
    } catch {
      return false
    }
  }

  async hasChanges(): Promise<boolean> {
    try {
      // 检查是否有已经被 add 到 staging 的文件
      const output = await this.run("git diff --cached --numstat")
      return output.trim().length > 0
    } catch {
      // 发生错误时保守认为有变更
      return true
    }
  }

  async ensureAuthorConfig(): Promise<void> {
    try {
      // 检查是否已经有 username，没有则为当前仓库局部配置
      const name = await this.run("git config user.name").catch(() => "")
      if (!name) {
        await this.run('git config user.name "FreeFolo Sync"')
        await this.run('git config user.email "sync@freefolo.local"')
      }
    } catch (e) {
      console.warn("[GitRunner] failed to ensure author config", e)
    }
  }

  async pullRebase(): Promise<string> {
    // 强制使用 rebase 拉取（不指定分支，使用当前追踪分支）
    return this.run("git pull --rebase")
  }

  async commitAll(message: string): Promise<string> {
    await this.run("git add .")
    
    // 如果没有任何变更，直接跳过 commit
    const changed = await this.hasChanges()
    if (!changed) {
      return "Nothing to commit"
    }

    // 确保有身份
    await this.ensureAuthorConfig()

    try {
      // 允许 commit 失败不抛出真正的 Error，防止截断流程
      const res = await this.run(`git commit -m "${message}"`, true)
      return res
    } catch (e: any) {
      console.warn("[GitRunner] commit threw an error, usually harmless 'nothing to commit'. Detail:", e.message)
      return "Nothing to commit or error swallowed"
    }
  }

  async push(retries: number = 2): Promise<string> {
    for (let i = 0; i <= retries; i++) {
      try {
        // 使用 origin HEAD 可以自适应分支名（不论是 main/master 还是新建库）
        return await this.run("git push -u origin HEAD")
      } catch (err: any) {
        if (i === retries) throw err
        console.warn(`[GitRunner] push failed (attempt ${i + 1} / ${retries + 1}), trying pull rebase...`)
        try {
          await this.pullRebase()
        } catch {
          // 忽略 rebase 报错，直接抛给外层或下一次 retry
        }
      }
    }
    throw new Error("Git push failed after retries")
  }

  /**
   * 综合的 Sync 逻辑：Pull(Rebase) -> Add -> Commit -> Push
   * 先尝试 pull 来解决前后的修改差异
   */
  async sync(message: string = "Sync state update"): Promise<void> {
    const isRepo = await this.checkIsRepo()
    if (!isRepo) {
      throw new Error(`Target path ${this.repoPath} is not a valid git repository.`)
    }

    try {
      // 0. Auto clean up index.lock if exists from previous crashed runs or race conditions
      const lockPath = path.join(this.repoPath, ".git", "index.lock")
      if (fs.existsSync(lockPath)) {
        try {
          fs.rmSync(lockPath, { force: true })
          console.warn("[GitRunner] Automatically removed stale .git/index.lock file")
        } catch (lockRmErr) {
          console.error("[GitRunner] Failed to remove stale .git/index.lock file:", lockRmErr)
        }
      }

      // 1. Pull changes first to avoid conflicts if possible
      await this.pullRebase().catch(e => {
        console.warn("[GitRunner] Pull rebase failed (could be first push or offline).", e.message)
      })

      // 2. Commit local changes
      await this.commitAll(message)

      // 3. Push to origin
      await this.push()
    } catch (err) {
      console.error("[GitRunner] Sync process failed:", err)
      throw err
    }
  }
}
