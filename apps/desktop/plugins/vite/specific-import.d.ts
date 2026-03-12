import type { Plugin } from "vite"
type Platform = "electron" | "web" | "main"
export declare function createPlatformSpecificImportPlugin(platform: Platform): Plugin
export {}
