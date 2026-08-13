import { createReadStream } from "node:fs"
import { open, rename, unlink } from "node:fs/promises"
import { dirname } from "node:path"
import { createInterface } from "node:readline"
import { StringDecoder } from "node:string_decoder"

export async function openUtf8LineSource(path: string) {
  const file = await open(path, "r")
  return {
    lines: async function* (): AsyncGenerator<string> {
      const decoder = new StringDecoder("utf8")
      const buffer = Buffer.allocUnsafe(64 * 1024)
      let pending = ""
      let position = 0
      while (true) {
        const { bytesRead } = await file.read(buffer, 0, buffer.length, position)
        if (bytesRead === 0) break
        position += bytesRead
        pending += decoder.write(buffer.subarray(0, bytesRead))
        let newline = pending.indexOf("\n")
        while (newline >= 0) {
          const line = pending.slice(0, newline).replace(/\r$/, "")
          yield `${line}\n`
          pending = pending.slice(newline + 1)
          newline = pending.indexOf("\n")
        }
      }
      pending += decoder.end()
      if (pending) yield `${pending.replace(/\r$/, "")}\n`
    },
    close: () => file.close(),
  }
}

export async function* readUtf8Lines(path: string): AsyncGenerator<string> {
  const input = createReadStream(path, { encoding: "utf8" })
  const reader = createInterface({ input, crlfDelay: Infinity })
  for await (const line of reader) yield `${line}\n`
}

export async function writeFileAtomically(path: string, chunks: AsyncIterable<string>) {
  const partialPath = `${path}.${process.pid}.${Date.now()}.partial`
  const file = await open(partialPath, "w", 0o600)
  try {
    for await (const chunk of chunks) await file.write(chunk)
    await file.sync()
    await file.close()
    await rename(partialPath, path)
    const directory = await open(dirname(path), "r")
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } catch (error) {
    await file.close().catch(() => undefined)
    await unlink(partialPath).catch(() => undefined)
    throw error
  }
}
