/**
 * Утилиты режима тренажёра.
 *
 * Главный флаг — `VITE_TRAINING`, инжектится Vite при сборке через .env.training
 * (см. vite.config.ts). По нему всё остальное:
 *   • показывать баннер «Тренажёр» в Layout,
 *   • автоматически запускать тур при первом входе,
 *   • рендерить кнопку «Начать заново» (POST /api/training/reset).
 *
 * Прогресс прохождения тура хранится в localStorage, чтобы при перезагрузке
 * страницы не возвращаться к первому шагу.
 */

export const isTrainingMode = (): boolean =>
  import.meta.env.VITE_TRAINING === '1'

const TOUR_DONE_KEY = 'training_tour_done'

export const isTourCompleted = (): boolean =>
  localStorage.getItem(TOUR_DONE_KEY) === '1'

export const markTourCompleted = () => {
  localStorage.setItem(TOUR_DONE_KEY, '1')
}

export const resetTourProgress = () => {
  localStorage.removeItem(TOUR_DONE_KEY)
}
