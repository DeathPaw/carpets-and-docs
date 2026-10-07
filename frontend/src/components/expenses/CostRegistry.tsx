import { useEffect, useState } from 'react'
import {
  getCostEntries, createCostEntry, updateCostEntry, setCostAllocation, deleteCostEntry,
  getCostEntryFiles, addCostEntryFile, deleteCostEntryFile, costEntryFileUrl,
  type CostEntry, type CostKind, type CostAllocation, type CostEntryPayload, type CostEntryList,
  type CostEntryFile,
} from '../../api/costs'
import { useToast } from '../Toast'
import ConfirmModal from '../ConfirmModal'
import { todayIso } from '../../utils/format'

/**
 * Реестр затрат (ТЗ v2, блок 2): материальные закупки или прочие расходы.
 *
 * Оба реестра устроены одинаково, поэтому это один компонент с разным
 * `kind`: у закупки дополнительно спрашиваем количество и единицу, у прочей
 * затраты — нет. В строке видно способ учёта в себестоимости и сумму, рядом
 * кнопка, которой этот способ меняют.
 */

interface Props {
  kind: CostKind
  categories: { id: number; name: string }[]
}

export default function CostRegistry({ kind, categories }: Props) {
  const { showToast } = useToast()
  const [data, setData] = useState<CostEntryList | null>(null)
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [counterparty, setCounterparty] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<CostEntry | 'new' | null>(null)
  const [allocFor, setAllocFor] = useState<CostEntry | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setData(await getCostEntries({
        kind,
        from: from || undefined,
        to: to || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        counterparty: counterparty || undefined,
        search: search || undefined,
      }))
    } catch {
      showToast('Не удалось загрузить реестр', 'error')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [kind, from, to, categoryId, counterparty, search])

  const remove = (e: CostEntry) => setConfirm({
    title: 'Удалить запись',
    message: `«${e.title}» на ${Number(e.amount).toFixed(0)} ₽ будет удалена из реестра и из себестоимости.`,
    action: async () => {
      try { await deleteCostEntry(e.id); await load() }
      catch { showToast('Не удалось удалить запись', 'error') }
    },
  })

  const rows = data?.rows ?? []
  const isMaterial = kind === 'MATERIAL'

  return (
    <div>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>С даты</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>По дату</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="form-group" style={{ width: 200, marginBottom: 0 }}>
          <label>Категория</label>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">Все</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ width: 200, marginBottom: 0 }}>
          <label>{isMaterial ? 'Поставщик' : 'Контрагент'}</label>
          <input value={counterparty} onChange={e => setCounterparty(e.target.value)} placeholder="Все" />
        </div>
        <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
          <label>Поиск</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Наименование или комментарий" />
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')} style={{ marginLeft: 'auto' }}>
          + {isMaterial ? 'Закупка' : 'Затрата'}
        </button>
      </div>

      {data && (
        <div className="card" style={{ display: 'flex', gap: 28 }}>
          <div>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)' }}>Записей</div>
            <div style={{ fontSize: '1.3em', fontWeight: 700 }}>{data.totals.entries}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)' }}>Сумма, ₽</div>
            <div style={{ fontSize: '1.3em', fontWeight: 700 }}>
              {Number(data.totals.total).toLocaleString('ru')}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading">Загрузка…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Записей нет</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Дата</th>
                  <th>Наименование</th>
                  <th style={{ width: 170 }}>Категория</th>
                  {isMaterial && <th style={{ width: 120 }}>Количество</th>}
                  <th style={{ width: 170 }}>{isMaterial ? 'Поставщик' : 'Контрагент'}</th>
                  <th style={{ width: 120 }}>Сумма, ₽</th>
                  <th style={{ width: 230 }}>Учёт в себестоимости</th>
                  {/* Двум кнопкам нужна ширина: в 90 px они вставали друг под друга. */}
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(e => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.entry_date).toLocaleDateString('ru')}</td>
                    <td>
                      {e.title}
                      {e.comment && (
                        <div style={{ color: 'var(--c-text-secondary)', fontSize: 'var(--font-sm)' }}>{e.comment}</div>
                      )}
                    </td>
                    <td>{e.category_name || '—'}</td>
                    {isMaterial && (
                      <td>{e.quantity != null ? `${Number(e.quantity)} ${e.unit || ''}`.trim() : '—'}</td>
                    )}
                    <td>{e.counterparty || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{Number(e.amount).toLocaleString('ru')}</td>
                    <td>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setAllocFor(e)}
                        title="Изменить способ учёта в себестоимости"
                      >
                        {allocationText(e)}
                      </button>
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn-secondary btn-sm" title="Изменить" onClick={() => setEditing(e)}>✏️</button>
                        <button className="btn-danger btn-sm" title="Удалить" onClick={() => remove(e)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CostEntryModal
          kind={kind}
          categories={categories}
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      )}

      {allocFor && (
        <AllocationModal
          entry={allocFor}
          onClose={() => setAllocFor(null)}
          onSaved={async () => { setAllocFor(null); await load() }}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          danger
          onConfirm={() => { const a = confirm.action; setConfirm(null); a() }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

/** Короткая подпись способа учёта — она же текст кнопки в строке. */
function allocationText(e: CostEntry): string {
  if (e.allocation === 'MONTH') {
    return e.alloc_month
      ? `Месяц: ${new Date(e.alloc_month).toLocaleDateString('ru', { month: 'long', year: 'numeric' })}`
      : 'Месяц'
  }
  if (e.allocation === 'PERIOD') {
    const f = e.alloc_from ? new Date(e.alloc_from).toLocaleDateString('ru') : '?'
    const t = e.alloc_to ? new Date(e.alloc_to).toLocaleDateString('ru') : '?'
    return `Период: ${f} — ${t}`
  }
  return `Заказ #${String(e.alloc_order_id ?? '').padStart(5, '0')}`
}

function CostEntryModal({ kind, categories, entry, onClose, onSaved }: {
  kind: CostKind
  categories: { id: number; name: string }[]
  entry: CostEntry | null
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const isMaterial = kind === 'MATERIAL'
  const [form, setForm] = useState({
    entry_date: entry?.entry_date ? entry.entry_date.slice(0, 10) : todayIso(),
    category_id: entry?.category_id ? String(entry.category_id) : '',
    title: entry?.title ?? '',
    quantity: entry?.quantity != null ? String(entry.quantity) : '',
    unit: entry?.unit ?? '',
    amount: entry?.amount != null ? String(entry.amount) : '',
    counterparty: entry?.counterparty ?? '',
    comment: entry?.comment ?? '',
  })
  const [error, setError] = useState('')
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))

  const save = async () => {
    if (!form.title.trim()) { setError('Укажите наименование'); return }
    const amount = Number(form.amount)
    if (!amount || amount < 0) { setError('Укажите сумму'); return }
    const payload: CostEntryPayload = {
      kind,
      entry_date: form.entry_date,
      category_id: form.category_id ? Number(form.category_id) : null,
      title: form.title.trim(),
      quantity: isMaterial && form.quantity ? Number(form.quantity) : null,
      unit: isMaterial ? (form.unit.trim() || null) : null,
      amount,
      counterparty: form.counterparty.trim() || null,
      comment: form.comment.trim() || null,
      // Новая запись по умолчанию ложится на месяц своей даты; способ меняется
      // отдельной кнопкой в строке — так же, как просит документ.
      allocation: entry?.allocation ?? 'MONTH',
      alloc_month: entry?.alloc_month ?? form.entry_date,
      alloc_from: entry?.alloc_from ?? null,
      alloc_to: entry?.alloc_to ?? null,
      alloc_order_id: entry?.alloc_order_id ?? null,
    }
    try {
      if (entry) await updateCostEntry(entry.id, payload)
      else await createCostEntry(payload)
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Не удалось сохранить запись')
      showToast(msg ?? 'Не удалось сохранить запись', 'error')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>
          {entry ? 'Изменить запись' : (isMaterial ? 'Новая закупка' : 'Новая затрата')}
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label>Дата</label>
            <input type="date" value={form.entry_date} onChange={e => set({ entry_date: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label>Категория</label>
            <select value={form.category_id} onChange={e => set({ category_id: e.target.value })}>
              <option value="">— без категории —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>{isMaterial ? 'Наименование' : 'Описание'}</label>
          <input
            value={form.title}
            onChange={e => set({ title: e.target.value })}
            placeholder={isMaterial ? 'Химия для стирки' : 'Электроэнергия за сентябрь'}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {isMaterial && (
            <>
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label>Количество</label>
                <input type="number" step="0.001" value={form.quantity} onChange={e => set({ quantity: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: '0 0 100px' }}>
                <label>Единица</label>
                <input value={form.unit} onChange={e => set({ unit: e.target.value })} placeholder="л, шт" />
              </div>
            </>
          )}
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label>Сумма, ₽</label>
            <input type="number" step="0.01" value={form.amount} onChange={e => set({ amount: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label>{isMaterial ? 'Поставщик' : 'Контрагент'}</label>
            <input value={form.counterparty} onChange={e => set({ counterparty: e.target.value })} placeholder="Необязательно" />
          </div>
        </div>
        <div className="form-group">
          <label>Комментарий</label>
          <textarea rows={2} value={form.comment} onChange={e => set({ comment: e.target.value })} />
        </div>
        {/* Документы прикрепляем только к сохранённой записи: до сохранения у неё
            нет id, а держать файлы в памяти формы незачем. */}
        {entry ? <EntryFiles entryId={entry.id} /> : (
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)', marginBottom: 8 }}>
            Счёт или акт можно будет прикрепить после сохранения.
          </div>
        )}
        {error && <div className="error-msg" style={{ marginBottom: 8 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={save}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}

/** Документы затраты: счёт, акт, фото чека. */
function EntryFiles({ entryId }: { entryId: number }) {
  const { showToast } = useToast()
  const [files, setFiles] = useState<CostEntryFile[]>([])
  const [busy, setBusy] = useState(false)

  const reload = () => getCostEntryFiles(entryId).then(setFiles).catch(() => setFiles([]))
  useEffect(() => { void reload() }, [entryId])

  const upload = async (file: File) => {
    setBusy(true)
    try {
      // Файл уходит base64 — отдельного файлового хранилища в проекте нет,
      // вложения лежат в той же базе, что и фотографии ковров.
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      await addCostEntryFile(entryId, {
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        data,
      })
      await reload()
    } catch {
      showToast('Не удалось прикрепить документ', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-group">
      <label>Документы</label>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          {files.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <a href={costEntryFileUrl(entryId, f.id)} target="_blank" rel="noreferrer">
                {f.filename || `документ #${f.id}`}
              </a>
              <button
                className="btn-danger btn-sm"
                title="Удалить документ"
                onClick={async () => {
                  try { await deleteCostEntryFile(entryId, f.id); await reload() }
                  catch { showToast('Не удалось удалить документ', 'error') }
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
      <input
        type="file"
        disabled={busy}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Кнопка «Учёт в себестоимости»: месяц, период или прямо на заказ. */
function AllocationModal({ entry, onClose, onSaved }: {
  entry: CostEntry
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [allocation, setAllocation] = useState<CostAllocation>(entry.allocation)
  const [month, setMonth] = useState(entry.alloc_month ? entry.alloc_month.slice(0, 7) : entry.entry_date.slice(0, 7))
  const [from, setFrom] = useState(entry.alloc_from ? entry.alloc_from.slice(0, 10) : entry.entry_date.slice(0, 10))
  const [to, setTo] = useState(entry.alloc_to ? entry.alloc_to.slice(0, 10) : entry.entry_date.slice(0, 10))
  const [orderId, setOrderId] = useState(entry.alloc_order_id ? String(entry.alloc_order_id) : '')
  const [error, setError] = useState('')

  const save = async () => {
    try {
      await setCostAllocation(entry.id, {
        allocation,
        alloc_month: allocation === 'MONTH' ? `${month}-01` : null,
        alloc_from: allocation === 'PERIOD' ? from : null,
        alloc_to: allocation === 'PERIOD' ? to : null,
        alloc_order_id: allocation === 'ORDER' ? Number(orderId) : null,
      })
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Не удалось сохранить способ учёта')
      showToast(msg ?? 'Не удалось сохранить способ учёта', 'error')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Учёт в себестоимости</h2>
        <p style={{ color: 'var(--c-text-secondary)', marginTop: 0 }}>
          «{entry.title}» — {Number(entry.amount).toLocaleString('ru')} ₽
        </p>
        <div className="form-group">
          <label>Способ учёта</label>
          <select value={allocation} onChange={e => setAllocation(e.target.value as CostAllocation)}>
            <option value="MONTH">Конкретный месяц</option>
            <option value="PERIOD">Период</option>
            <option value="ORDER">Прямо на заказ</option>
          </select>
        </div>
        {allocation === 'MONTH' && (
          <div className="form-group">
            <label>Месяц</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)', marginTop: 4 }}>
              Вся сумма ляжет на обработанные метры этого месяца и на следующий не перейдёт.
            </div>
          </div>
        )}
        {allocation === 'PERIOD' && (
          <>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Начало</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Конец</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)', marginBottom: 10 }}>
              Сумма делится между месяцами периода пропорционально календарным дням, а доля
              месяца дальше ложится на его обработанные метры.
            </div>
          </>
        )}
        {allocation === 'ORDER' && (
          <div className="form-group">
            <label>Номер заказа</label>
            <input
              type="number"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              placeholder="89"
            />
            <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)', marginTop: 4 }}>
              Прямой расход целиком относится на заказ и в общую базу распределения не попадает.
            </div>
          </div>
        )}
        {error && <div className="error-msg" style={{ marginBottom: 8 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={save}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}
