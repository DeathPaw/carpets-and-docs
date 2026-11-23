/**
 * ПР-003: листалка списка с выбором размера страницы (20/50/100/200).
 * Выбор запоминается на странице (usePersistentState у вызывающего), смена
 * размера возвращает на первую страницу — иначе номер страницы теряет смысл.
 */
export const PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

export default function Pagination({ page, setPage, hasMore, pageSize, setPageSize }: {
  page: number
  setPage: (updater: (p: number) => number) => void
  hasMore: boolean
  pageSize: number
  setPageSize: (size: number) => void
}) {
  return (
    <div className="pagination">
      {(page > 0 || hasMore) && (
        <>
          <button className="btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>&#8592; Назад</button>
          <span>Стр. {page + 1}</span>
          <button className="btn-secondary btn-sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Вперёд &#8594;</button>
        </>
      )}
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 12, fontSize: 'var(--font-sm)', color: '#666' }}>
        На странице:
        <select
          value={pageSize}
          style={{ width: 'auto', height: 'var(--control-h)' }}
          onChange={e => { setPageSize(Number(e.target.value)); setPage(() => 0) }}
        >
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  )
}
