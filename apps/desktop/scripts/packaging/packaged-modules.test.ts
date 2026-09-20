import assert from "node:assert/strict"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { test } from "node:test"

import path from "pathe"

import { retainedPackagedModules } from "../forge-ignore.ts"
import {
  assertPackagedModulesCovered,
  collectExternalPackages,
  findUnretainedPackages,
  toPackageName,
} from "./packaged-modules.ts"

const writeBundle = (contents: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), "suhui-packaged-modules-"))
  writeFileSync(path.join(dir, "index.js"), contents)
  return dir
}

test("reads package names out of every specifier form the bundles use", () => {
  const packages = collectExternalPackages(
    [
      `import dotenv from "dotenv";`,
      `import { a } from "@protobufjs/aspromise";`,
      `import "ajv-formats";`,
      `const pg = require("pg");`,
      `const types = require("pg-types/lib/textParsers");`,
      `await import("font-list");`,
    ].join("\n"),
  )

  assert.deepEqual([...packages].sort(), [
    "@protobufjs/aspromise",
    "ajv-formats",
    "dotenv",
    "font-list",
    "pg",
    "pg-types",
  ])
})

test("ignores builtins, electron and relative specifiers", () => {
  const packages = collectExternalPackages(
    [
      `import { app } from "electron";`,
      `import fs from "node:fs";`,
      `import path from "path";`,
      `import { helper } from "./helper.js";`,
      `import shared from "../shared/index.js";`,
      `const abs = require("/opt/thing");`,
    ].join("\n"),
  )

  assert.deepEqual([...packages], [])
})

test("keeps the scope when naming a scoped package", () => {
  assert.equal(toPackageName("@protobufjs/aspromise"), "@protobufjs/aspromise")
  assert.equal(toPackageName("@protobufjs/aspromise/index.js"), "@protobufjs/aspromise")
  assert.equal(toPackageName("pg-types/lib/textParsers"), "pg-types")
})

test("reports imports the allowlist does not cover", () => {
  const bundleDir = writeBundle(`import dotenv from "dotenv";\nimport fresh from "left-pad";`)

  assert.deepEqual(
    findUnretainedPackages({ bundleDirs: [bundleDir], retainedModules: retainedPackagedModules }),
    ["left-pad"],
  )
})

test("fails packaging when a bundle import would not ship", () => {
  const bundleDir = writeBundle(`import missing from "left-pad";`)

  assert.throws(
    () =>
      assertPackagedModulesCovered({
        bundleDirs: [bundleDir],
        retainedModules: retainedPackagedModules,
      }),
    /left-pad/,
  )
})

test("refuses to pass when the bundle directory was never built", () => {
  assert.throws(
    () =>
      assertPackagedModulesCovered({
        bundleDirs: [path.join(tmpdir(), "suhui-packaged-modules-missing")],
        retainedModules: retainedPackagedModules,
      }),
    /Build the app before packaging/,
  )
})

test("the built main and preload bundles are fully covered", (t) => {
  const bundleDirs = [
    path.resolve(import.meta.dirname, "../../dist/main"),
    path.resolve(import.meta.dirname, "../../dist/preload"),
  ]

  if (!bundleDirs.every((dir) => existsSync(dir))) {
    t.skip("dist is not built")
    return
  }

  assert.deepEqual(
    findUnretainedPackages({ bundleDirs, retainedModules: retainedPackagedModules }),
    [],
  )
})

test("every retained module ships its own dependencies", (t) => {
  const nodeModules = path.resolve(import.meta.dirname, "../../../../node_modules")
  if (!existsSync(nodeModules)) {
    t.skip("node_modules is not installed")
    return
  }

  const retained = new Set<string>(retainedPackagedModules)
  const uncovered: string[] = []

  for (const name of retainedPackagedModules) {
    const manifestPath = path.join(nodeModules, name, "package.json")
    if (!existsSync(manifestPath)) {
      continue
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      dependencies?: Record<string, string>
    }

    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      if (!retained.has(dependency)) {
        uncovered.push(`${name} -> ${dependency}`)
      }
    }
  }

  assert.deepEqual(uncovered, [])
})

test("does not read an object property named import as a specifier", () => {
  const packages = collectExternalPackages(
    [
      `const routes = {`,
      `  import: defineRoute("POST", "/import", { requestType: "formData" }),`,
      `  export: defineRoute("GET", "/export"),`,
      `};`,
    ].join("\n"),
  )

  assert.deepEqual([...packages], [])
})

test("reads specifiers out of minified single-line bundles", () => {
  const packages = collectExternalPackages(`import{a}from"dotenv";import*as b from"pg";import"ajv"`)

  assert.deepEqual([...packages].sort(), ["ajv", "dotenv", "pg"])
})
