import client from './client'

/**
 * V32: баннер для попапа «Обновления». Настраивается в Справочниках —
 * релизные заметки можно менять без правки кода.
 */
export interface UpdateBanner {
  id: number
  title: string
  body: string
  /** Показывать начиная с даты (YYYY-MM-DD). null — без нижней границы. */
  starts_on: string | null
  /** Показывать по дату включительно. null — бессрочно. */
  ends_on: string | null
  sort_order: number
  is_active: boolean
}

/** Только то, что видно сегодня — для попапа «Обновления». */
export const getActiveBanners = () =>
  client.get<UpdateBanner[]>('/api/update-banners').then(r => r.data)

/** Все баннеры, включая скрытые и просроченные — для Справочников. */
export const getAllBanners = () =>
  client.get<UpdateBanner[]>('/api/update-banners/all').then(r => r.data)

export const createBanner = (data: Omit<UpdateBanner, 'id'>) =>
  client.post<UpdateBanner>('/api/update-banners', data).then(r => r.data)

export const updateBanner = (id: number, data: Omit<UpdateBanner, 'id'>) =>
  client.put<UpdateBanner>(`/api/update-banners/${id}`, data).then(r => r.data)

export const deleteBanner = (id: number) =>
  client.delete(`/api/update-banners/${id}`)
