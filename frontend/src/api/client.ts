import axios from 'axios'
import { emitApiSuccess } from './events'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Добавляем Basic Auth header из sessionStorage
client.interceptors.request.use(config => {
  const auth = sessionStorage.getItem('auth')
  if (auth) {
    config.headers.Authorization = `Basic ${auth}`
  }
  return config
})

// При 401 — перенаправляем на логин. На успешных ответах — кидаем событие в шину
// (используется челлендж-панелью тренажёра: при создании заказа, добавлении
// позиции и т.п. она автоматически отмечает шаг выполненным).
client.interceptors.response.use(
  response => {
    try {
      emitApiSuccess({
        method:       (response.config.method || 'GET').toUpperCase(),
        url:          response.config.url || '',
        status:       response.status,
        requestData:  response.config.data ? safeJson(response.config.data) : undefined,
        responseData: response.data,
      })
    } catch { /* шина не должна мешать основному флоу */ }
    return response
  },
  error => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('auth')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

/** axios передаёт тело запроса как string (после JSON.stringify). Парсим обратно. */
function safeJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return raw }
}

export default client
