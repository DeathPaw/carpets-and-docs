import client from './client'
import type { Feedback, CreateFeedbackRequest, FeedbackStatus } from '../types'

export const getFeedback = () =>
  client.get<Feedback[]>('/api/feedback').then(r => r.data)

export const createFeedback = (data: CreateFeedbackRequest) =>
  client.post<Feedback>('/api/feedback', data).then(r => r.data)

export const deleteFeedback = (id: number) =>
  client.delete(`/api/feedback/${id}`)

export const updateFeedbackStatus = (id: number, status: FeedbackStatus) =>
  client.patch<Feedback>(`/api/feedback/${id}/status`, { status }).then(r => r.data)
