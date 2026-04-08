declare const _default: {
  plugins: (
    | import("vite").Plugin<any>
    | import("vite").Plugin<any>[]
    | {
        name: string
        transform(
          this: import("rollup").TransformPluginContext,
          code: string,
          id: string,
        ):
          | {
              code: string
            }
          | undefined
      }
  )[]
  root: string
  build: {
    outDir: string
    sourcemap: boolean
    target: string
    rollupOptions: {
      input: {
        main: string
        remote: string
      }
    }
    minify: boolean
  }
  define: {
    ELECTRON: string
    APP_VERSION: string
    APP_NAME: string
    APP_DEV_CWD: string
    GIT_COMMIT_SHA: string
    RELEASE_CHANNEL: string
    DEBUG: boolean
    I18N_COMPLETENESS_MAP: string
    CHANGELOG_CONTENT: string
    "process.env.NODE_ENV": string
  }
  worker: {
    format: "es"
  }
  optimizeDeps: {
    exclude: string[]
  }
  resolve: {
    alias: {
      "~": string
      "@pkg": string
      "@locales": string
      "@suhui/electron-main": string
    }
  }
  base: string
}
export default _default
