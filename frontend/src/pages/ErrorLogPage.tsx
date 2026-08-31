import { useEffect, useState } from 'react'
import { getErrorLog } from '../api/errorLog'
import type { ErrorLogEntry } from '../types'

export default function ErrorLogPage() {
  const [entries, setEntries] = useState<ErrorLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getErrorLog(page, 20)
      setEntries(data)
      // Поскольку API не возвращает информацию о пагинации, просто проверяем есть ли еще данные
      setTotalPages(data.length === 20 ? page + 2 : page + 1)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [page])

  return (
    <div>
      <div className="page-header">
        <h1>Лог ошибок</h1>
        <button className="btn-secondary" onClick={load}>🔄 Обновить</button>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Тип ошибки</th>
                <th>Сообщение</th>
                <th>Путь запроса</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={5} className="empty">Лог пуст</td></tr>
              ) : entries.map(e => (
                <tr key={e.id}>
                  <td>{e.id}</td>
                  <td><code style={{ fontSize: 'var(--font-sm)' }}>{e.error_type}</code></td>
                  <td style={{ maxWidth: 400, wordBreak: 'break-word' }}>{e.message}</td>
                  <td><code style={{ fontSize: 'var(--font-sm)' }}>{e.request_path || '—'}</code></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.occurred_at).toLocaleString('ru')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Назад</button>
              <span>Стр. {page + 1} / {totalPages}</span>
              <button className="btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
