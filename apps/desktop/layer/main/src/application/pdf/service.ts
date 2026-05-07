import { BrowserWindow } from "electron"

export type EntryPdfInput = {
  title?: string
  contentHtml?: string
  sourceName?: string
  author?: string
  publishedAt?: string
  url?: string
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

export class PdfApplicationService {
  buildEntryPrintHtml(input: EntryPdfInput): string {
    const title = escapeHtml(input.title || "Untitled")
    const sourceName = input.sourceName ? escapeHtml(input.sourceName) : ""
    const author = input.author ? escapeHtml(input.author) : ""
    const publishedAt = input.publishedAt ? escapeHtml(input.publishedAt) : ""
    const url = input.url ? escapeHtml(input.url) : ""
    const content = input.contentHtml || ""

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      @page { size: A4; margin: 18mm 16mm; }
      body {
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.65;
      }
      main { max-width: 760px; margin: 0 auto; }
      h1 { font-size: 28px; line-height: 1.25; margin: 0 0 12px; }
      .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
      .content :is(img, video) { max-width: 100%; height: auto; }
      .source-link { color: #6b7280; font-size: 12px; margin-top: 28px; word-break: break-all; }
      pre, code { white-space: pre-wrap; word-break: break-word; }
      blockquote { border-left: 3px solid #d1d5db; color: #374151; margin-left: 0; padding-left: 14px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <div class="meta">
        ${sourceName ? `<span>${sourceName}</span>` : ""}
        ${author ? `<span> · ${author}</span>` : ""}
        ${publishedAt ? `<span> · ${publishedAt}</span>` : ""}
      </div>
      <article class="content">${content}</article>
      ${url ? `<div class="source-link">原文链接：${url}</div>` : ""}
    </main>
  </body>
</html>`
  }

  async renderEntryPdf(input: EntryPdfInput): Promise<Buffer> {
    if (!input.contentHtml?.trim()) {
      throw new Error("Entry content is required for PDF export")
    }

    const printWindow = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    try {
      const printHtml = this.buildEntryPrintHtml(input)
      await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(printHtml)}`)
      await printWindow.webContents.executeJavaScript(
        "document.fonts ? document.fonts.ready.then(() => true) : Promise.resolve(true)",
      )
      return await printWindow.webContents.printToPDF({
        preferCSSPageSize: true,
        printBackground: true,
      })
    } finally {
      if (!printWindow.isDestroyed()) {
        printWindow.destroy()
      }
    }
  }
}

export const pdfApplicationService = new PdfApplicationService()
