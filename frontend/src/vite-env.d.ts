/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
/** Метка сборки из vite.config.ts: JSON {time, commit}. В dev-стенде без define её нет. */
declare const __BUILD_STAMP__: string | undefined
