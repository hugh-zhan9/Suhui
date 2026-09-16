// Shared by all batches and manual retries for one article/language.
export const ARTICLE_TRANSLATION_CONCURRENCY = 5

export class TranslationRequestPool {
  private active = 0
  private waiters: Array<() => void> = []

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= ARTICLE_TRANSLATION_CONCURRENCY) {
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    } else {
      this.active += 1
    }
    try {
      return await operation()
    } finally {
      const next = this.waiters.shift()
      if (next) next()
      else this.active -= 1
    }
  }
}
