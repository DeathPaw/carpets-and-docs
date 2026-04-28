import client from './client'
import type { ErrorLogEntry } from '../types'

export const getErrorLog = (page = 0, size = 20) =>
  client.get<ErrorLogEntry[]>('/api/error-log', { params: { page, size } }).then(r => r.data)
