// Темы обращения от оператора. Те же ключи, что в БД и FeedbackTopic в types/index.ts.
import type { FeedbackTopic, FeedbackStatus } from '../types'

export const FEEDBACK_TOPIC_LABELS: Record<FeedbackTopic, string> = {
  SUGGESTION_HOW:  'А можем сделать вот так?',
  FEATURE_REQUEST: 'Хочу такую функцию',
  LOGIC_BUG:       'Ошибка в логике / поведении',
  VISUAL_BUG:      'Визуальная ошибка',
  UNCLEAR:         'Непонятно что делать',
}

/** Все темы в порядке частоты — этот же порядок будет в выпадающем списке. */
export const ALL_FEEDBACK_TOPICS: FeedbackTopic[] = [
  'SUGGESTION_HOW', 'FEATURE_REQUEST', 'LOGIC_BUG', 'VISUAL_BUG', 'UNCLEAR',
]

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  NEW:         'Новое',
  REVIEWED:    'Рассмотрено',
  IN_PROGRESS: 'Взято в работу',
  DONE:        'Реализовано',
  REJECTED:    'Отказано',
  NEED_INFO:   'Требуется пояснение',
}

/** Цветовые ключи для бейджа статуса — соответствуют CSS-классам badge-*. */
export const FEEDBACK_STATUS_BADGES: Record<FeedbackStatus, string> = {
  NEW:         'badge-lead',          // серый — ещё не смотрели
  REVIEWED:    'badge-in_progress',   // синий — посмотрели
  IN_PROGRESS: 'badge-partially_done',// жёлтый — в работе
  DONE:        'badge-done',          // зелёный — сделано
  REJECTED:    'badge-cancelled',     // красный — отказали
  NEED_INFO:   'badge-for_pickup',    // голубой — нужно пояснение
}

export const ALL_FEEDBACK_STATUSES: FeedbackStatus[] = [
  'NEW', 'REVIEWED', 'IN_PROGRESS', 'DONE', 'REJECTED', 'NEED_INFO',
]
