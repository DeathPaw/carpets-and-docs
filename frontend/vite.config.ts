import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

/**
 * Метка сборки: время и коммит. Показывается сбоку экрана (BuildStamp), чтобы
 * после автообновления на сервере было сразу видно, что новая сборка встала.
 */
function buildStamp(): string {
  let commit = ''
  try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { /* нет git */ }
  return JSON.stringify({ time: new Date().toISOString(), commit })
}

/**
 * Конфиг dev-сервера. Поддерживает два режима:
 *
 *   • npm run dev           → :3000, проксирует /api на http://localhost:8080  (боевой)
 *   • npm run dev:training  → :3001, проксирует /api на http://localhost:8081  (тренажёр)
 *
 * Режим тренажёра включается через `vite --mode training`. Vite автоматически
 * подгружает .env.training, где лежит VITE_TRAINING=1 — этот флаг видит фронт
 * через `import.meta.env.VITE_TRAINING` и показывает баннер + запускает тур.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isTraining = env.VITE_TRAINING === '1'

  return {
    plugins: [react()],
    define: { __BUILD_STAMP__: JSON.stringify(buildStamp()) },
    server: {
      port: isTraining ? 3001 : 3000,
      host: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: isTraining ? 'http://localhost:8081' : 'http://localhost:8080',
          changeOrigin: true,
        },
      },
    },
  }
})
