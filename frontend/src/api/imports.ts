import client from './client'

/**
 * Обмен через Excel (ТЗ v2, блок 8).
 *
 * Описание шаблона приходит с сервера — по нему и строится файл, и проверяются
 * загруженные строки. Второго, «фронтового» набора правил не существует.
 */
export interface TemplateColumn {
  key: string
  title: string
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'ENUM'
  required: boolean
  values: string[] | null
  hint: string | null
}

export interface ImportTemplate {
  kind: string
  title: string
  sheet: string
  version: string
  columns: TemplateColumn[]
  instructions: string[]
  examples: Record<string, unknown>[]
}

export interface ImportIssue {
  sheet: string
  row: number
  field: string | null
  message: string
}

export interface ImportChange {
  row: number
  external_id: string
  title: string
  note?: string
}

export interface ImportReport {
  kind: string
  template_version: string
  row_count: number
  creates: ImportChange[]
  updates: ImportChange[]
  duplicates: ImportIssue[]
  errors: ImportIssue[]
}

export interface ImportBatchRow {
  id: number
  kind: string
  template_version: string
  filename: string | null
  update_mode: 'SKIP' | 'UPDATE'
  created_count: number
  updated_count: number
  skipped_count: number
  created_by: string | null
  created_at: string
}

export interface ImportPayload {
  version: string
  columns: string[]
  rows: Record<string, unknown>[]
  update_mode?: 'SKIP' | 'UPDATE'
  filename?: string
}

export const importsApi = {
  templates: () => client.get<ImportTemplate[]>('/api/import/templates').then(r => r.data),

  validate: (kind: string, payload: ImportPayload) =>
    client.post<ImportReport>(`/api/import/${kind}/validate`, payload).then(r => r.data),

  commit: (kind: string, payload: ImportPayload) =>
    client.post<{ batch_id: number; created: number; updated: number; skipped: number }>(
      `/api/import/${kind}/commit`, payload).then(r => r.data),

  batches: (limit = 20) =>
    client.get<ImportBatchRow[]>('/api/import/batches', { params: { limit } }).then(r => r.data),
}

export default importsApi
