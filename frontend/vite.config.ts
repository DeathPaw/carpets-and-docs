import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
