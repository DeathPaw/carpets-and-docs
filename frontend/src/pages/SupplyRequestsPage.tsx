import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getSupplyRequests, createSupplyRequest, updateSupplyRequest,
  changeSupplyStatus,
  SUPPLY_STATUS_LABELS, SUPPLY_STATUS_COLORS,
  type SupplyRequest, type SupplyStatus,
} from '../api/supplyRequests'
import { useToast } from '../components/Toast'
import { useAuth } from '../auth/AuthContext'
import { useEscapeClose } from '../hooks/useEscapeClose'
import StyledSelect from '../components/StyledSelect'
import MultiSelectFilter from '../components/MultiSelectFilter'
import { pageActionBtn, FILTER_WIDTHS, FILTER_CENTER } from '../components/PageFilterBar'

/**
 * Колонки доски. «Отменено» стоит первой и показывается всегда: раньше
 * отменённые прятались под галкой «Закрытые», и заявка после отмены просто
 * исчезала с экрана — оператор не понимал, куда она делась.
 *
 * Столбец и статус соответствуют один к одному (V36): промежуточная
 * «Согласована» убрана — оператор не отличал её от «Заказана», и она только
 * дробила колонку «В работе» на два неразличимых этапа.
 */
type ColumnKey = SupplyStatus

const COLUMNS: { key: ColumnKey; title: string; color: string }[] = [
  { key: 'CANCELLED', title: 'Отменено', color: '#c0392b' },
  { key: 'NEW',       title: 'Создано',  color: '#17a2b8' },
  { key: 'ORDERED',   title: 'В работе', color: '#f39c12' },
  { key: 'RECEIVED',  title: 'Готово',   color: '#27ae60' },
]

const today = () => new Date().toISOString().slice(0, 10)

/** Текущий месяц (YYYY-MM) по локальному времени, а не по UTC —
 *  иначе в последний день месяца фильтр по умолчанию уезжал на следующий. */
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Месяц, к которому относится заявка (YYYY-MM).
 *
 * Для купленной — месяц закупки: именно в него легли деньги в «Расходах»,
 * и именно его оператор ищет, когда сверяет отчёт. Для остальных — месяц
 * срока, а если срока нет — месяц создания.
 */
function monthOf(r: SupplyRequest): string {
  const d = r.received_on || r.needed_by || r.created_at
  return d ? String(d).slice(0, 7) : ''
}

const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

/** «2026-09» → «Сентябрь 2026». */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const name = MONTH_NAMES[Number(m) - 1] ?? m
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`
}

/**
 * V33: заявки на закупку расходных материалов (правка №5 от 31.08).
 *
 * Производство передавало потребности устно, заявки терялись. Здесь оператор
 * ведёт их по статусам, а при получении вносит дату и сумму закупки — сумма
 * автоматически попадает в «Расходы» за месяц ДАТЫ ЗАКУПКИ и участвует в
 * расчёте доходности.
 */
export default function SupplyRequestsPage() {
  const { showToast } = useToast()
  const { user, isReadonly } = useAuth()
  const [rows, setRows] = useState<SupplyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  /** Единственный отбор «что показывать» — месяц. По умолчанию текущий. */
  const [monthFilter, setMonthFilter] = useState<string[]>([currentMonth()])
  const [requestNo, setRequestNo] = useState('')

  /** ?id=N с Главной — открываем эту заявку сразу, вместе с её месяцем:
   *  иначе фильтр текущего месяца мог её отсечь, и переход выглядел как «ничего
   *  не произошло». */
  const [searchParams, setSearchParams] = useSearchParams()

  const [editing, setEditing] = useState<SupplyRequest | 'new' | null>(null)
  const [receiving, setReceiving] = useState<SupplyRequest | null>(null)
  const [cancelling, setCancelling] = useState<SupplyRequest | null>(null)

  /**
   * Перетаскиваемая заявка и колонка под курсором.
   *
   * Логика читает ref, а не state: ref обновляется синхронно в onDragStart,
   * тогда как state к моменту drop может ещё не доехать. State нужен только
   * для подсветки — там задержка в один кадр никому не мешает.
   */
  const dragIdRef = useRef<number | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<ColumnKey | null>(null)

  const startDrag = (id: number) => { dragIdRef.current = id; setDragId(id) }
  const endDrag = () => { dragIdRef.current = null; setDragId(null); setDragOver(null) }

  const load = async () => {
    setLoading(true)
    try {
      setRows(await getSupplyRequests())
    } catch {
      showToast('Не удалось загрузить заявки', 'error')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  useEffect(() => {
    const id = Number(searchParams.get('id'))
    if (!id || rows.length === 0) return
    const target = rows.find(r => r.id === id)
    if (target) {
      setMonthFilter(m => (m.includes(monthOf(target)) ? m : [...m, monthOf(target)]))
      setEditing(target)
    }
    searchParams.delete('id')
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  /**
   * Месяцы из данных плюс текущий — от свежих к старым. Текущий добавляем
   * всегда: он стоит в фильтре по умолчанию, и без него в пустом месяце
   * фильтр показывал бы выбранное значение, которого нет в списке.
   */
  const monthOptions = useMemo(() => {
    const set = new Set(rows.map(monthOf).filter(Boolean))
    set.add(currentMonth())
    return [...set].sort().reverse().map(ym => ({ value: ym, label: monthLabel(ym) }))
  }, [rows])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const no = requestNo.trim()
    return rows.filter(r => {
      if (monthFilter.length > 0 && !monthFilter.includes(monthOf(r))) return false
      if (no && String(r.id) !== no) return false
      if (!q) return true
      return [r.title, r.comment, r.created_by_name, r.unit]
        .some(v => v && v.toLowerCase().includes(q))
    })
  }, [rows, search, monthFilter, requestNo])


  /**
   * Перенос карточки в колонку. Кнопок смены статуса нет — только перетаскивание.
   *
   * Там, где одного статуса недостаточно, открываем окно вместо тихого перевода:
   * «Готово» требует дату и сумму закупки (иначе расход не попадёт в нужный
   * месяц), «Отменено» — причину. Остальные переходы применяются сразу.
   */
  const dropTo = async (col: ColumnKey) => {
    const r = rows.find(x => x.id === dragIdRef.current)
    endDrag()
    if (!r || isReadonly) return
    if (r.status === col) return                       // уже в этой колонке

    if (col === 'RECEIVED') { setReceiving(r); return }
    if (col === 'CANCELLED') { setCancelling(r); return }
    try {
      await changeSupplyStatus(r.id, { status: col })
      await load()
    } catch (e: unknown) {
      showToast((e as any)?.response?.data?.message || 'Ошибка смены статуса', 'error')
    }
  }

  return (
    <div>
      {/* Свой набор фильтров — район и № заказа тут не при чём, но место
          и центровка те же, что на остальных страницах. */}
      <SupplyFilterBar
        title="Закупки"
        months={monthOptions}
        monthValue={monthFilter}
        onMonthChange={setMonthFilter}
        requestNo={requestNo}
        onRequestNoChange={setRequestNo}
        search={search}
        onSearchChange={setSearch}
        right={!isReadonly && (
          <button className="btn-primary" style={pageActionBtn} onClick={() => setEditing('new')}>
            + Новая заявка
          </button>
        )}
      />

      <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)', marginBottom: 12 }}>
        Перетащите карточку в нужный столбец — статус изменится. Для «Готово»
        спросим дату и сумму закупки (сумма попадёт в «Расходы» за месяц этой даты),
        для «Отменено» — причину. Клик по карточке открывает её на редактирование —
        там же правятся дата и сумма уже проведённой закупки.
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <div className="supply-board">
          {COLUMNS.map(col => {
            const cards = visible.filter(r => r.status === col.key)
            const isTarget = !isReadonly && dragIdRef.current != null
            const isHover = isTarget && dragOver === col.key
            return (
              // Обработчики навешаны всегда, а не только пока что-то тащат:
              // условный вариант зависел от того, успел ли React перерисовать
              // колонки между dragstart и drop.
              <div
                key={col.key}
                onDragOver={e => { if (isTarget) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                onDragEnter={() => { if (isTarget) setDragOver(col.key) }}
                onDragLeave={e => {
                  if (isTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null)
                }}
                onDrop={e => { e.preventDefault(); void dropTo(col.key) }}
              >
                <div style={{
                  background: col.color, color: '#fff', borderRadius: '8px 8px 0 0',
                  padding: '10px 14px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', fontWeight: 600,
                }}>
                  <span>{col.title}</span>
                  <span>{cards.length}</span>
                </div>
                <div style={{
                  background: isHover ? 'var(--c-primary-light)' : 'var(--c-bg-hover)',
                  border: isHover ? '2px dashed var(--c-primary)' : '1px solid var(--c-border)',
                  borderTop: isHover ? '2px dashed var(--c-primary)' : 'none',
                  borderRadius: '0 0 8px 8px',
                  padding: 10, minHeight: 220,
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                }}>
                  {cards.length === 0 ? (
                    <div style={{ color: 'var(--c-text-muted)', textAlign: 'center', padding: '24px 0' }}>
                      {isTarget ? 'Отпустите для перевода' : 'Нет данных'}
                    </div>
                  ) : cards.map(r => (
                    <SupplyCard
                      key={r.id}
                      r={r}
                      readOnly={isReadonly}
                      dragging={dragId === r.id}
                      onDragStart={() => startDrag(r.id)}
                      onDragEnd={endDrag}
                      onEdit={() => setEditing(r)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <SupplyEditModal
          request={editing === 'new' ? null : editing}
          authorName={user?.display_name || user?.username || ''}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      )}
      {receiving && (
        <ReceiveModal
          request={receiving}
          onClose={() => setReceiving(null)}
          onSaved={async () => { setReceiving(null); await load() }}
        />
      )}
      {cancelling && (
        <CancelModal
          request={cancelling}
          onClose={() => setCancelling(null)}
          onSaved={async () => { setCancelling(null); await load() }}
        />
      )}
    </div>
  )
}

/**
 * Панель фильтров закупок. Геометрия — та же, что у PageFilterBar: заголовок
 * слева, три контрола строго по центру контента (те же ширины из FILTER_WIDTHS,
 * чтобы группа не «прыгала» по ширине при переходе между разделами), кнопка справа.
 *
 * Набор фильтров свой: район и № заказа к материалам отношения не имеют.
 * Отбор «что показывать» — только месяц: тумблеры «Просроченные» и «Закрытые»
 * убраны, отменённые и полученные теперь всегда видны в своих столбцах.
 */
function SupplyFilterBar({
  title, months, monthValue, onMonthChange, requestNo, onRequestNoChange,
  search, onSearchChange, right,
}: {
  title: string
  months: { value: string; label: string }[]
  monthValue: string[]
  onMonthChange: (v: string[]) => void
  requestNo: string
  onRequestNoChange: (v: string) => void
  search: string
  onSearchChange: (v: string) => void
  right?: React.ReactNode
}) {
  return (
    /* sticky на самой обёртке — иначе шапка «отлипает» сразу за границей
       собственного контейнера, как это было на остальных страницах. */
    <div className="page-sticky-head">
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, minHeight: 46,
      }}>
        <h1 style={{ margin: 0 }}>{title}</h1>
        <div className="page-filters" style={{
          position: 'absolute', left: FILTER_CENTER, transform: 'translateX(-50%)',
          zIndex: 100, display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <MultiSelectFilter
            options={months}
            searchable
            value={monthValue}
            onChange={onMonthChange}
            placeholder="Месяц: все"
            width={FILTER_WIDTHS.first}
          />
          <input
            type="number"
            value={requestNo}
            onChange={e => onRequestNoChange(e.target.value)}
            placeholder="№ закупки"
            style={{ width: FILTER_WIDTHS.second }}
            title="Фильтр по номеру заявки"
          />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Материал / автор / комментарий"
            style={{ width: FILTER_WIDTHS.third }}
            title="Частичное совпадение по названию, автору или комментарию"
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          {right}
        </div>
      </div>
    </div>
  )
}

/**
 * Карточка заявки. Кнопок на ней нет вовсе: статус меняется перетаскиванием в
 * другой столбец (в том числе отмена — переносом в «Отменено»), а клик по
 * карточке открывает её на редактирование. Ряд кнопок раньше занимал треть
 * высоты карточки и делал колонку пустой на вид.
 */
function SupplyCard({ r, readOnly, dragging, onDragStart, onDragEnd, onEdit }: {
  r: SupplyRequest
  readOnly: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onEdit: () => void
}) {
  const c = SUPPLY_STATUS_COLORS[r.status]
  const overdue = r.status !== 'RECEIVED' && r.status !== 'CANCELLED'
    && r.needed_by != null && r.needed_by < today()

  // Нижняя строка: у отменённой — причина, у остальных — комментарий.
  // Строка есть всегда, даже пустая: так все карточки одной высоты.
  const bottom = r.status === 'CANCELLED' && r.cancel_reason
    ? { text: `Причина: ${r.cancel_reason}`, color: '#c0392b' }
    : { text: r.comment ?? '', color: 'var(--c-text-secondary)' }

  return (
    <div
      className="supply-card"
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={readOnly ? undefined : onEdit}
      title={readOnly ? undefined : 'Открыть заявку · перетащите в другой столбец, чтобы сменить статус'}
      style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderLeft: `4px solid ${overdue ? '#c0392b' : c.fg}`,
        borderRadius: 6, padding: '10px 12px', marginBottom: 8,
        cursor: readOnly ? 'default' : 'pointer',
        opacity: dragging ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</strong>
        <span style={{ whiteSpace: 'nowrap', color: 'var(--c-text-secondary)', fontSize: 'var(--font-sm)' }}>
          {r.quantity != null ? `${r.quantity}${r.unit ? ' ' + r.unit : ''}` : ''}
        </span>
      </div>
      {/* Номер видим на карточке — по нему работает фильтр «№ закупки». */}
      <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-muted)' }}>заявка #{r.id}</div>

      <div className="supply-line" style={{ color: 'var(--c-text-secondary)', height: 20, lineHeight: '20px' }}>
        <span style={{
          display: 'inline-block', padding: '1px 7px', borderRadius: 10, lineHeight: '16px',
          background: c.bg, color: c.fg, fontWeight: 500, marginRight: 6,
        }}>{SUPPLY_STATUS_LABELS[r.status]}</span>
        {r.created_by_name}
      </div>

      <div className="supply-line" style={{
        color: overdue ? '#c0392b' : 'var(--c-text-secondary)',
        fontWeight: overdue ? 600 : 400,
      }}>
        {r.needed_by
          ? `Нужен к ${new Date(r.needed_by).toLocaleDateString('ru')}${overdue ? ' · просрочена' : ''}`
          : ''}
      </div>

      {/* План и факт рядом: видно, уложились ли в ожидаемую цену. */}
      <div className="supply-line">
        {r.expected_amount != null && (
          <span style={{ color: 'var(--c-text-secondary)' }}>
            план {Number(r.expected_amount).toFixed(0)} ₽
          </span>
        )}
        {r.actual_amount != null && (
          <span style={{ color: '#186a3b', fontWeight: 600, marginLeft: r.expected_amount != null ? 8 : 0 }}>
            факт {Number(r.actual_amount).toFixed(0)} ₽
            {r.received_on && ` · ${new Date(r.received_on).toLocaleDateString('ru')}`}
          </span>
        )}
      </div>

      <div className="supply-line" style={{ color: bottom.color }} title={bottom.text || undefined}>
        {bottom.text}
      </div>
    </div>
  )
}

/** Создание и правка заявки. */
function SupplyEditModal({ request, authorName, onClose, onSaved }: {
  request: SupplyRequest | null
  authorName: string
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [title, setTitle] = useState(request?.title ?? '')
  const [quantity, setQuantity] = useState(request?.quantity?.toString() ?? '')
  const [unit, setUnit] = useState(request?.unit ?? 'шт')
  const [neededBy, setNeededBy] = useState(request?.needed_by ?? '')
  const [comment, setComment] = useState(request?.comment ?? '')
  // Цену можно указать на любом этапе — при получении она подставится в факт.
  const [expected, setExpected] = useState(request?.expected_amount?.toString() ?? '')
  // Факт закупки правится и после получения: оператор мог ошибиться в дате или
  // сумме, а возвращать заявку в работу ради опечатки — лишние шаги и лишний
  // след в истории. Дата определяет месяц расхода, бэк пересчитает оба месяца.
  const received = request?.status === 'RECEIVED'
  const [receivedOn, setReceivedOn] = useState(request?.received_on ?? '')
  const [actualQty, setActualQty] = useState(request?.actual_quantity?.toString() ?? '')
  const [actualAmount, setActualAmount] = useState(request?.actual_amount?.toString() ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  /**
   * Закрытие с непустыми правками спрашивает подтверждения. Форму открывают
   * кликом по карточке и часто закрывают машинально — терять при этом введённое
   * нельзя. Сравниваем с исходным состоянием заявки, а не «трогали ли поле»:
   * вернул значение обратно — считаем, что менять нечего.
   */
  const dirty =
    title !== (request?.title ?? '') ||
    quantity !== (request?.quantity?.toString() ?? '') ||
    unit !== (request?.unit ?? 'шт') ||
    neededBy !== (request?.needed_by ?? '') ||
    comment !== (request?.comment ?? '') ||
    expected !== (request?.expected_amount?.toString() ?? '') ||
    receivedOn !== (request?.received_on ?? '') ||
    actualQty !== (request?.actual_quantity?.toString() ?? '') ||
    actualAmount !== (request?.actual_amount?.toString() ?? '')

  const tryClose = () => {
    if (dirty && !window.confirm('Закрыть без сохранения? Внесённые изменения пропадут.')) return
    onClose()
  }
  useEscapeClose(true, tryClose)

  const submit = async () => {
    if (!title.trim()) { setErr('Укажите, что нужно закупить'); return }
    if (received && !receivedOn) { setErr('Укажите дату закупки'); return }
    if (received && !actualAmount) { setErr('Укажите фактическую сумму'); return }
    setBusy(true); setErr('')
    const payload = {
      title: title.trim(),
      quantity: quantity ? Number(quantity) : null,
      unit: unit || null,
      needed_by: neededBy || null,
      comment: comment.trim() || null,
      expected_amount: expected ? Number(expected) : null,
      // Автор фиксируется один раз при создании — при правке не перезаписываем.
      created_by_name: request ? request.created_by_name : authorName,
      // Поля закупки уходят только у полученной заявки — по их наличию
      // бэк понимает, что нужно пересчитать месячный расход.
      ...(received ? {
        received_on: receivedOn,
        actual_quantity: actualQty ? Number(actualQty) : null,
        actual_amount: Number(actualAmount),
      } : {}),
    }
    try {
      if (request) await updateSupplyRequest(request.id, payload)
      else await createSupplyRequest(payload)
      await onSaved()
    } catch (e: unknown) {
      setErr((e as any)?.response?.data?.message || 'Не удалось сохранить')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={tryClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>{request ? 'Изменить заявку' : 'Новая заявка на закупку'}</h2>

        <div className="form-group">
          <label>Что нужно *</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Например: Шампунь для шерсти" autoFocus />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Количество</label>
            <input type="number" step="0.01" value={quantity}
              onChange={e => setQuantity(e.target.value)} placeholder="—" />
          </div>
          <div className="form-group" style={{ width: 120 }}>
            <label>Единица</label>
            <StyledSelect<string>
              value={unit}
              options={['шт', 'л', 'кг', 'упак', 'м'].map(u => ({ value: u, label: u }))}
              onChange={setUnit}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Нужен к</label>
            <input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Ожидаемая цена, ₽</label>
          <input type="number" step="0.01" value={expected}
            onChange={e => setExpected(e.target.value)} placeholder="Если известна" />
          <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)', marginTop: 4 }}>
            План. В расходы попадёт только фактическая сумма при получении.
          </div>
        </div>

        {/* Факт закупки правится и после получения — на случай опечатки. */}
        {received && (
          <div style={{
            border: '1px solid #aed6f1', background: 'var(--c-primary-light)',
            borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 14,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: '#1b4f72' }}>Факт закупки</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Дата закупки *</label>
                <input type="date" value={receivedOn} onChange={e => setReceivedOn(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Получено</label>
                <input type="number" step="0.01" value={actualQty}
                  onChange={e => setActualQty(e.target.value)} placeholder={unit || '—'} />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Сумма, ₽ *</label>
                <input type="number" step="0.01" value={actualAmount}
                  onChange={e => setActualAmount(e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize: 'var(--font-sm)', color: '#1b4f72', marginTop: 8 }}>
              Сумма лежит в «Расходах» за месяц даты закупки. Смените дату —
              расход переедет в другой месяц, оба пересчитаются автоматически.
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Комментарий</label>
          <textarea rows={3} value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Необязательно" />
        </div>

        {err && <div className="error-msg">{err}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={tryClose}>Отмена</button>
          <button className="btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Сохранение…' : (request ? 'Сохранить' : 'Создать')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Фиксация факта закупки. Дата определяет месяц расхода. */
function ReceiveModal({ request, onClose, onSaved }: {
  request: SupplyRequest
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [receivedOn, setReceivedOn] = useState(today())
  const [actualQty, setActualQty] = useState(request.quantity?.toString() ?? '')
  // Подставляем ожидаемую цену, если её указали раньше — оператору
  // остаётся только поправить, если факт разошёлся с планом.
  const [amount, setAmount] = useState(request.expected_amount?.toString() ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEscapeClose(true, onClose)

  const submit = async () => {
    if (!receivedOn) { setErr('Укажите дату закупки'); return }
    if (!amount) { setErr('Укажите фактическую сумму'); return }
    setBusy(true); setErr('')
    try {
      await changeSupplyStatus(request.id, {
        status: 'RECEIVED',
        received_on: receivedOn,
        actual_quantity: actualQty ? Number(actualQty) : null,
        actual_amount: Number(amount),
      })
      await onSaved()
    } catch (e: unknown) {
      setErr((e as any)?.response?.data?.message || 'Не удалось сохранить')
      setBusy(false)
    }
  }

  const month = receivedOn
    ? new Date(receivedOn).toLocaleDateString('ru', { month: 'long', year: 'numeric' })
    : ''

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Материал получен</h2>
        <p style={{ color: '#666', marginTop: 0, fontSize: 'var(--font-sm)' }}>
          {request.title}
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Дата закупки *</label>
            <input type="date" value={receivedOn} onChange={e => setReceivedOn(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Фактически получено</label>
            <input type="number" step="0.01" value={actualQty}
              onChange={e => setActualQty(e.target.value)}
              placeholder={request.unit || '—'} />
          </div>
        </div>

        <div className="form-group">
          <label>Сумма закупки, ₽ *</label>
          <input type="number" step="0.01" value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
        </div>

        {receivedOn && (
          <div style={{
            background: 'var(--c-primary-light)', border: '1px solid #aed6f1',
            borderRadius: 'var(--radius)', padding: '8px 10px',
            fontSize: 'var(--font-sm)', color: '#1b4f72', marginBottom: 12,
          }}>
            Сумма попадёт в «Расходы» → «Расходные материалы» за {month}.
          </div>
        )}

        {err && <div className="error-msg">{err}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-success" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Сохранение…' : 'Подтвердить закупку'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Отмена заявки — только с причиной, как отмена позиции/услуги в заказе. */
function CancelModal({ request, onClose, onSaved }: {
  request: SupplyRequest
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEscapeClose(true, onClose)

  const submit = async () => {
    if (reason.trim().length < 10) { setErr('Причина должна быть не короче 10 символов'); return }
    setBusy(true); setErr('')
    try {
      await changeSupplyStatus(request.id, { status: 'CANCELLED', cancel_reason: reason.trim() })
      await onSaved()
    } catch (e: unknown) {
      setErr((e as any)?.response?.data?.message || 'Не удалось отменить')
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h2 style={{ marginTop: 0 }}>Отмена заявки</h2>
        <p style={{ color: '#666', marginTop: 0, fontSize: 'var(--font-sm)' }}>
          «{request.title}» будет отменена. Укажите причину — она останется в истории.
        </p>
        <div className="form-group">
          <label>Причина отмены *</label>
          <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Например: нашли аналог дешевле у другого поставщика" autoFocus />
        </div>
        {err && <div className="error-msg">{err}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Назад</button>
          <button className="btn-danger" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Отмена…' : 'Отменить заявку'}
          </button>
        </div>
      </div>
    </div>
  )
}
