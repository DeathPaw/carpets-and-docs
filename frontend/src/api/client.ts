import axios from 'axios'

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

// При 401 — перенаправляем на логин
client.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('auth')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default client
