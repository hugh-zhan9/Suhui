// Chromium validation: node apps/desktop/scripts/check-reader-mermaid.mjs
// Uses a separate temporary Electron profile; never opens the user's database.
import { spawn } from "node:child_process"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

const require = createRequire(import.meta.url)
const directory = await mkdtemp(join(tmpdir(), "suhui-reader-mermaid-"))
const source = await readFile(new URL("fixtures/reader-mermaid.txt", import.meta.url), "utf8")
await build({
  entryPoints: [
    fileURLToPath(
      new URL("../layer/renderer/src/components/ui/markdown/mermaid-render.ts", import.meta.url),
    ),
  ],
  bundle: true,
  format: "iife",
  globalName: "ReaderMermaid",
  outfile: join(directory, "reader.js"),
  logLevel: "warning",
})
await writeFile(
  join(directory, "index.html"),
  '<!doctype html><meta charset="utf-8"><style>body{margin:24px;font:16px sans-serif}img{max-width:100%;height:auto}</style><script src="reader.js"></script>',
)

// This function is serialized into a test BrowserWindow, with actual SVG layout.
async function check(source, dark) {
  document.body.style.background = dark ? "#181818" : "white"
  const uri = await globalThis.ReaderMermaid.renderMermaidImage(source, dark)
  const svg = decodeURIComponent(uri.split(",").slice(1).join(","))
  const xml = new DOMParser().parseFromString(svg, "image/svg+xml")
  const labels = xml.documentElement.textContent.replaceAll(/\s+/g, "")
  if (!labels.includes("传统SaaS") || !labels.includes("概率黑盒"))
    throw new Error(`Fixture labels missing: ${labels.slice(-1500)}`)
  if (xml.querySelector("parsererror")) throw new Error("Invalid output SVG")
  if (xml.querySelector("script, foreignObject"))
    throw new Error("Unexpected active/HTML SVG content")
  if (document.body.querySelector('[aria-hidden="true"]')) throw new Error("Layout host leaked")
  const img = document.createElement("img")
  img.src = uri
  img.alt = "Mermaid 图表"
  document.body.replaceChildren(img)
  await img.decode()
  if (img.naturalWidth < 100 || img.naturalHeight < 100) throw new Error("Empty image layout")
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  ctx.drawImage(img, 0, 0)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const expectedFill = dark ? [31, 32, 32] : [236, 236, 255]
  let matchingPixels = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      pixels[i] === expectedFill[0] &&
      pixels[i + 1] === expectedFill[1] &&
      pixels[i + 2] === expectedFill[2] &&
      pixels[i + 3] > 128
    )
      matchingPixels++
  }
  if (matchingPixels < 100) throw new Error("Diagram pixels do not match the selected theme")
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  return {
    dark,
    width: img.naturalWidth,
    height: img.naturalHeight,
    svgCharacters: svg.length,
    svg,
    png: canvas.toDataURL("image/png"),
    matchingPixels,
  }
}

async function checkBoundaries() {
  for (const source of ["", "a".repeat(50_001), "not-a-valid-diagram"]) {
    let failed = false
    try {
      await globalThis.ReaderMermaid.renderMermaidImage(source, false)
    } catch {
      failed = true
    }
    if (!failed) throw new Error("Invalid diagram accepted")
  }
  for (const source of [
    'flowchart TD\n A@{img: "https://example.com/hang", label: "Image"}',
    'flowchart TD\n A@{"img": "https://example.com/hang", label: "Image"}',
  ]) {
    let rejected = false
    try {
      await globalThis.ReaderMermaid.renderMermaidImage(source, false)
    } catch (error) {
      rejected = error.message.includes("图片节点")
    }
    if (!rejected) throw new Error(`Image node was not rejected before rendering: ${source}`)
  }
  const attack =
    '%%{init: {"securityLevel":"loose","htmlLabels":true,"themeCSS":"body{display:none}"}}%%\ngraph TD\n A["<img src=x onerror=alert(1)>"] --> B[Safe]\n click B "javascript:alert(1)"'
  const uri = await globalThis.ReaderMermaid.renderMermaidImage(attack, false)
  const svg = decodeURIComponent(uri.split(",").slice(1).join(","))
  const xml = new DOMParser().parseFromString(svg, "image/svg+xml")
  if (xml.querySelector("script, foreignObject, image, a[href], a[xlink\\:href]"))
    throw new Error("Active content survived strict rendering")
  if (
    [...xml.querySelectorAll("*")].some((node) =>
      [...node.attributes].some((a) => /^on/i.test(a.name)),
    )
  )
    throw new Error("Event handler survived")
  if (svg.includes("body{display:none}")) throw new Error("Source config overrode site policy")
  if (document.body.querySelector('[aria-hidden="true"]')) throw new Error("Failure host leaked")
  const results = await Promise.all([
    globalThis.ReaderMermaid.renderMermaidImage("graph TD; A-->B", false),
    globalThis.ReaderMermaid.renderMermaidImage("graph TD; C-->D", true),
    globalThis.ReaderMermaid.renderMermaidImage(
      'kanban\n column[Column]\n  task[Task]@{img: "https://example.com/ignored"}',
      false,
    ),
  ])
  if (!results.every((r) => r.startsWith("data:image/svg+xml")))
    throw new Error("Concurrent rendering failed")
  return {
    invalidInputsRejected: 3,
    imageNodesRejected: 2,
    strictRendering: true,
    concurrentDiagrams: results.length,
  }
}

await writeFile(
  join(directory, "main.cjs"),
  `
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
app.setPath('userData', ${JSON.stringify(join(directory, "profile"))});
app.whenReady().then(async () => {
  const requests = [];
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const external = /^https?:/.test(details.url);
    if (external) requests.push(details.url);
    callback({ cancel: external });
  });
  const win = new BrowserWindow({show:false,width:1400,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  try {
    await win.loadFile(${JSON.stringify(join(directory, "index.html"))});
    for (const dark of [false,true]) {
      const {svg, png, ...result} = await win.webContents.executeJavaScript('(' + ${JSON.stringify(check.toString())} + ')(' + ${JSON.stringify(JSON.stringify(source))} + ',' + dark + ')');
      console.log(JSON.stringify(result));
      await fs.writeFile(${JSON.stringify(directory)} + '/' + (dark ? 'dark' : 'light') + '.svg', svg);
      await fs.writeFile(${JSON.stringify(directory)} + '/' + (dark ? 'dark' : 'light') + '-diagram.png', Buffer.from(png.split(',')[1], 'base64'));
      await fs.writeFile(${JSON.stringify(directory)} + '/' + (dark ? 'dark' : 'light') + '.png', (await win.webContents.capturePage()).toPNG());
    }
    console.log(JSON.stringify(await win.webContents.executeJavaScript('(' + ${JSON.stringify(checkBoundaries.toString())} + ')()')));
    if(requests.length) throw new Error('Unexpected external requests: ' + requests.length);
    console.log('PASS: Reader Mermaid; screenshots: ' + ${JSON.stringify(directory)});
    app.exit(0);
  } catch(error) { console.error(error); app.exit(1); }
});
`,
)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(require("electron"), [join(directory, "main.cjs")], { env, stdio: "inherit" })

const timer = setTimeout(() => child.kill("SIGTERM"), 60_000)
child.on("exit", (code) => {
  clearTimeout(timer)
  process.exitCode = code ?? 1
})
