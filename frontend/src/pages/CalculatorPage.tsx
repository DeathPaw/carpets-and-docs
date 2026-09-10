import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getItemTypes, getPriceModifiers } from '../api/references'
import { getSkus } from '../api/sku'
import { quoteOrder, type QuoteItemInput, type QuoteLine, type QuoteResult } from '../api/quote'
import { addOrderItem, updateOrderItemDimensions, getOrder, getOrderModifiers, addOrderModifier } from '../api/orders'
import { addServiceToItem } from '../api/services'
import CreateOrderModal from '../components/orders/CreateOrderModal'
import StyledSelect from '../components/StyledSelect'
import { useToast } from '../components/Toast'
import { useAuth } from '../auth/AuthContext'
import { money } from '../print/printDocs'
import type { ItemType, Order, PriceModifier, Sku } from '../types'

/**
 * Правка №9 (09.09): предварительный калькулятор стоимости.
 *
 * «Холодный» клиент сначала хочет узнать цену и только потом решает, оформляться
 * ли. Раньше ради расчёта оператор начинал заказ и заводил карточку клиента —
 * спрашивал имя, телефон и адрес у человека, который ещё ничего не решил. Здесь
 * считаем без клиента и без заказа; если цена устроила — «Создать заказ на
 * основании расчёта» переносит изделия, размеры, услуги и скидки в новый заказ.
 *
 * Считает бэкенд (POST /api/orders/quote) по правилам настоящего заказа, чтобы
 * названная по телефону цифра не разошлась с заказом. Черновик живёт в
 * sessionStorage: оператор может отвлечься на другую страницу посреди разговора.
 */

interface CalcRow {
  key: string
  itemTypeId: number | null
  length: string
  width: string
  /** Площадь вручную — для круглых и овальных ковров. Пусто — длина × ширина. */
  area: string
  weight: string
  /** null — основную услугу подбирает бэкенд по типу и размерам. */
  mainSkuId: number | null
  extraSkuIds: number[]
}

interface Draft {
  rows: CalcRow[]
  modifierIds: number[]
}

const STORAGE_KEY = 'calculator_draft_v1'

/** Служебные позиции заказа — этапы работы, а не изделия: в калькуляторе их не выбирают. */
const SERVICE_ITEM_TYPES = new Set(['Приём', 'Доставка', 'Оформление'])

const UNIT: Record<string, string> = {
  BY_AREA: 'м²', BY_WEIGHT: 'кг', BY_PERIMETER: 'м', BY_LENGTH: 'м', BY_WIDTH: 'м', BY_RUNNING_METERS: 'п. м',
}

const newRow = (): CalcRow => ({
  key: Math.random().toString(36).slice(2),
  itemTypeId: null, length: '', width: '', area: '', weight: '',
  mainSkuId: null, extraSkuIds: [],
})

const emptyDraft = (): Draft => ({ rows: [newRow()], modifierIds: [] })

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>
      if (Array.isArray(d.rows) && d.rows.length > 0) {
        return { rows: d.rows, modifierIds: Array.isArray(d.modifierIds) ? d.modifierIds : [] }
      }
    }
  } catch { /* повреждённый черновик — начинаем с чистого */ }
  return emptyDraft()
}

/** «2,5» и «2.5» — оба ввода считаем числом; ноль и мусор — «не задано». */
function num(s: string): number | null {
  const t = s.replace(',', '.').trim()
  if (!t) return null
  const v = Number(t)
  return Number.isFinite(v) && v > 0 ? v : null
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const signed = (n: number) => (n > 0 ? '+' : '') + money(n)
const percentLabel = (p: number) => `${p > 0 ? '+' : '−'}${Math.abs(p).toLocaleString('ru-RU')}%`

/**
 * Переносит расчёт в только что созданный заказ: изделия, размеры, услуги и
 * модификаторы. Забор и доставку заказ добавляет себе сам при создании.
 * Возвращает то, что перенести не удалось, — заказ при этом уже создан, и
 * оператор доправит остальное в карточке.
 */
async function applyQuoteToOrder(orderId: number, rows: CalcRow[], quote: QuoteResult, modifierIds: number[]): Promise<string[]> {
  const problems: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const result = quote.items[i]
    if (row.itemTypeId == null || !result) continue
    try {
      const item = await addOrderItem(orderId, { item_type_id: row.itemTypeId })
      const dims = {
        length: num(row.length) ?? undefined,
        width: num(row.width) ?? undefined,
        weight: num(row.weight) ?? undefined,
        // Площадь уходит, только если её вписали вручную, — иначе бэк посчитает длина × ширина.
        area: num(row.area) ?? undefined,
      }
      // Размеры — до услуг: цена услуги считается от них в момент добавления.
      if (Object.values(dims).some(v => v != null)) {
        await updateOrderItemDimensions(orderId, item.id, dims)
      }
      for (const line of result.services) {
        await addServiceToItem(orderId, item.id, { sku_id: line.sku_id })
      }
    } catch (e: unknown) {
      problems.push(`изделие ${i + 1}: ${(e as any)?.response?.data?.message || 'ошибка'}`)
    }
  }
  if (modifierIds.length > 0) {
    // Модификаторы из карточки клиента заказ уже скопировал себе — повторно не добавляем.
    const existing = new Set((await getOrderModifiers(orderId).catch(() => [])).map(m => m.modifier_id))
    for (const id of modifierIds) {
      if (existing.has(id)) continue
      try {
        await addOrderModifier(orderId, id)
      } catch (e: unknown) {
        problems.push(`скидка/надбавка: ${(e as any)?.response?.data?.message || 'ошибка'}`)
      }
    }
  }
  return problems
}

export default function CalculatorPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { isReadonly } = useAuth()
  const [types, setTypes] = useState<ItemType[]>([])
  const [skus, setSkus] = useState<Sku[]>([])
  const [modifiers, setModifiers] = useState<PriceModifier[]>([])
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [applying, setApplying] = useState(false)
  const { rows, modifierIds } = draft

  useEffect(() => {
    Promise.all([getItemTypes(), getSkus(), getPriceModifiers()])
      .then(([t, s, m]) => { setTypes(t); setSkus(s); setModifiers(m) })
      .catch(() => showToast('Не удалось загрузить справочники', 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft)) } catch { /* приватный режим */ }
  }, [draft])

  const input = useMemo<QuoteItemInput[]>(() => rows.map(r => ({
    item_type_id: r.itemTypeId,
    length: num(r.length),
    width: num(r.width),
    weight: num(r.weight),
    area: num(r.area),
    main_sku_id: r.mainSkuId,
    extra_sku_ids: r.extraSkuIds,
  })), [rows])

  // Пересчёт с задержкой: пока оператор набирает «2,35», бэк не дёргаем на каждую цифру.
  const quoteSeq = useRef(0)
  useEffect(() => {
    const seq = ++quoteSeq.current
    const timer = window.setTimeout(() => {
      quoteOrder(input, modifierIds)
        .then(q => { if (seq === quoteSeq.current) { setQuote(q); setQuoteError('') } })
        .catch((e: unknown) => {
          if (seq === quoteSeq.current) setQuoteError((e as any)?.response?.data?.message || 'Не удалось посчитать')
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [input, modifierIds])

  const itemTypes = useMemo(() => types.filter(t => !SERVICE_ITEM_TYPES.has(t.name.trim())), [types])
  const serviceTypeIds = useMemo(
    () => new Set(types.filter(t => SERVICE_ITEM_TYPES.has(t.name.trim())).map(t => String(t.id))),
    [types],
  )
  const activeSkus = useMemo(() => skus.filter(s => s.is_active && !s.is_deleted && !s.is_auto_add), [skus])
  const surcharges = modifiers.filter(m => Number(m.percent) > 0)
  const discounts = modifiers.filter(m => Number(m.percent) < 0)

  /** Основные услуги для типа — по атрибуту item_type, как «✓ подходит» в карточке заказа. */
  const mainCandidates = (typeId: number | null) => typeId == null
    ? []
    : activeSkus.filter(s => (s.attributes?.item_type || []).includes(String(typeId)))

  /**
   * Что можно добавить сверх основной: услуги этого типа и универсальные (без
   * привязки к типу). Логистику — забор, доставку, самовывоз — не предлагаем:
   * она у заказа своя.
   */
  const extraCandidates = (typeId: number | null) => typeId == null
    ? []
    : activeSkus.filter(s => {
        const bound = s.attributes?.item_type || []
        if (bound.some(id => serviceTypeIds.has(id))) return false
        return bound.length === 0 || bound.includes(String(typeId))
      })

  const update = (key: string, patch: Partial<CalcRow>) =>
    setDraft(d => ({ ...d, rows: d.rows.map(r => (r.key === key ? { ...r, ...patch } : r)) }))
  const removeRow = (key: string) =>
    setDraft(d => ({ ...d, rows: d.rows.length > 1 ? d.rows.filter(r => r.key !== key) : [newRow()] }))
  const addRow = () => setDraft(d => ({ ...d, rows: [...d.rows, newRow()] }))
  const toggleModifier = (id: number) => setDraft(d => ({
    ...d,
    modifierIds: d.modifierIds.includes(id) ? d.modifierIds.filter(x => x !== id) : [...d.modifierIds, id],
  }))

  /** Основная и дополнительные строки услуг изделия из ответа расчёта. */
  const splitServices = (r: CalcRow, lines: QuoteLine[]) => {
    const main = r.mainSkuId != null
      ? lines.find(l => l.sku_id === r.mainSkuId)
      : lines.find(l => !r.extraSkuIds.includes(l.sku_id))
    return { main, extras: lines.filter(l => l !== main) }
  }

  /** Как считается цена основной услуги — от этого зависит, какие размеры спрашивать. */
  const pricingOf = (r: CalcRow, main: QuoteLine | undefined): string | null => {
    if (r.mainSkuId != null) return skus.find(s => s.id === r.mainSkuId)?.pricing_type ?? null
    return main?.pricing_type ?? mainCandidates(r.itemTypeId)[0]?.pricing_type ?? null
  }

  const filledCount = rows.filter(r => r.itemTypeId != null).length
  const canCreate = !isReadonly && quote != null && filledCount > 0 && quote.goods_amount > 0
  const summary = quote
    ? `${filledCount} ${plural(filledCount, 'изделие', 'изделия', 'изделий')} · ${money(quote.total_amount)}`
    : ''

  const handleCreated = async (order: Order) => {
    setShowCreate(false)
    setApplying(true)
    try {
      // Считаем заново: переносим ровно то, что сейчас на экране.
      const fresh = await quoteOrder(input, modifierIds)
      const problems = await applyQuoteToOrder(order.id, rows, fresh, modifierIds)
      const saved = await getOrder(order.id).catch(() => null)
      setDraft(emptyDraft())
      setQuote(null)
      if (problems.length > 0) {
        showToast(`Заказ создан, но перенеслось не всё — проверьте в карточке: ${problems.join('; ')}`, 'error')
      } else if (saved && Math.abs(Number(saved.total_amount) - fresh.total_amount) >= 1) {
        showToast(
          `Заказ создан. Итог ${money(Number(saved.total_amount))}, а не ${money(fresh.total_amount)}: `
          + 'у клиента в карточке свои скидки или надбавки',
          'warning',
        )
      } else {
        showToast('Заказ создан по расчёту')
      }
      navigate(`/orders/${order.id}`)
    } catch {
      showToast('Заказ создан, но расчёт в него не перенёсся — добавьте изделия в карточке', 'error')
      navigate(`/orders/${order.id}`)
    } finally {
      setApplying(false)
    }
  }

  const freeThreshold = quote?.free_threshold ?? null

  return (
    <div>
      <div className="page-sticky-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 46 }}>
          <h1 style={{ margin: 0 }}>Калькулятор</h1>
          <span className="calc-lead">Предварительный расчёт — без клиента и заказа</span>
        </div>
      </div>

      <div className="calc-layout">
        <div>
          <div className="card calc-card">
            <div className="calc-grid calc-grid-head">
              <span>№</span>
              <span>Изделие</span>
              <span>Длина, м</span>
              <span>Ширина, м</span>
              <span>Площадь, м²</span>
              <span>Услуги</span>
              <span className="calc-num">Стоимость</span>
              <span />
            </div>

            {rows.map((r, i) => {
              const result = quote?.items[i]
              const { main, extras } = splitServices(r, result?.services ?? [])
              const pricing = pricingOf(r, main)
              const candidates = mainCandidates(r.itemTypeId)
              const extraChoices = extraCandidates(r.itemTypeId)
                .filter(s => s.id !== main?.sku_id && !r.extraSkuIds.includes(s.id))
              const length = num(r.length), width = num(r.width)
              const autoArea = length && width ? Math.round(length * width * 100) / 100 : null
              return (
                <div className="calc-grid calc-row" key={r.key}>
                  <span className="calc-no">{i + 1}</span>
                  <StyledSelect<number>
                    value={r.itemTypeId}
                    placeholder="Выберите тип"
                    options={itemTypes.map(t => ({ value: t.id, label: t.name }))}
                    onChange={v => update(r.key, { itemTypeId: v, mainSkuId: null })}
                    width="100%"
                    ariaLabel={`Тип изделия ${i + 1}`}
                  />
                  {pricing === 'BY_WEIGHT' ? (
                    <div className="calc-span3">
                      <input
                        inputMode="decimal" value={r.weight} placeholder="Вес, кг"
                        onChange={e => update(r.key, { weight: e.target.value })}
                        aria-label="Вес, кг" style={{ width: 84 }}
                      />
                      <span className="calc-hint">считается по весу, кг</span>
                    </div>
                  ) : pricing === 'FIXED' ? (
                    <div className="calc-span3"><span className="calc-hint">цена за изделие — размеры не нужны</span></div>
                  ) : (
                    <>
                      <input
                        inputMode="decimal" value={r.length} placeholder="0"
                        onChange={e => update(r.key, { length: e.target.value })} aria-label="Длина, м"
                      />
                      <input
                        inputMode="decimal" value={r.width} placeholder="0"
                        onChange={e => update(r.key, { width: e.target.value })} aria-label="Ширина, м"
                      />
                      <input
                        inputMode="decimal" value={r.area}
                        placeholder={autoArea ? autoArea.toLocaleString('ru-RU') : '—'}
                        onChange={e => update(r.key, { area: e.target.value })}
                        aria-label="Площадь, м²"
                        title="Считается как длина × ширина. Для круглого или овального ковра впишите площадь сами."
                      />
                    </>
                  )}
                  <div className="calc-services">
                    {candidates.length > 1 ? (
                      <StyledSelect<number>
                        value={r.mainSkuId ?? main?.sku_id ?? null}
                        options={candidates.map(s => ({ value: s.id, label: s.name }))}
                        onChange={v => update(r.key, { mainSkuId: v })}
                        width="100%"
                        ariaLabel="Основная услуга"
                      />
                    ) : main ? (
                      <div className="calc-service-name" title={main.name}>
                        {main.name}
                        <span className="calc-hint">
                          {' · '}{money(main.unit_price)}{UNIT[main.pricing_type] ? `/${UNIT[main.pricing_type]}` : ''}
                        </span>
                      </div>
                    ) : (
                      <span className="calc-service-name calc-hint">
                        {r.itemTypeId != null ? 'в каталоге нет услуги для этого типа' : '—'}
                      </span>
                    )}
                    {main && !main.matches && <span className="calc-warn">услуга не подходит по размерам</span>}
                    {extras.map(x => (
                      <span className="calc-extra" key={x.sku_id}>
                        {x.name} · {money(x.price)}
                        <button
                          type="button"
                          aria-label={`Убрать «${x.name}»`}
                          onClick={() => update(r.key, { extraSkuIds: r.extraSkuIds.filter(id => id !== x.sku_id) })}
                        >×</button>
                      </span>
                    ))}
                    {extraChoices.length > 0 && (
                      <StyledSelect<number>
                        value={null}
                        placeholder="+ услуга"
                        options={extraChoices.map(s => ({ value: s.id, label: s.name }))}
                        onChange={v => update(r.key, { extraSkuIds: [...r.extraSkuIds, v] })}
                        width="100%"
                        ariaLabel="Добавить услугу"
                      />
                    )}
                  </div>
                  <span className="calc-price">
                    {result && r.itemTypeId != null ? money(result.price) : ''}
                  </span>
                  <button
                    type="button" className="calc-remove"
                    onClick={() => removeRow(r.key)}
                    title="Убрать изделие" aria-label="Убрать изделие"
                  >×</button>
                </div>
              )
            })}

            <button type="button" className="btn-secondary" onClick={addRow} style={{ marginTop: 12 }}>
              + Добавить изделие
            </button>
          </div>

          <div className="card calc-card">
            <h2>Надбавки и доп. услуги</h2>
            <div className="calc-chips">
              {surcharges.length === 0 && <span className="calc-hint">В справочнике нет надбавок</span>}
              {surcharges.map(m => (
                <button
                  key={m.id} type="button"
                  className={`chip calc-chip${modifierIds.includes(m.id) ? ' is-on' : ''}`}
                  onClick={() => toggleModifier(m.id)}
                >{m.name} {percentLabel(Number(m.percent))}</button>
              ))}
            </div>
            <h2>Скидки</h2>
            <div className="calc-chips">
              {discounts.length === 0 && <span className="calc-hint">В справочнике нет скидок</span>}
              {discounts.map(m => (
                <button
                  key={m.id} type="button"
                  className={`chip calc-chip${modifierIds.includes(m.id) ? ' is-on' : ''}`}
                  onClick={() => toggleModifier(m.id)}
                >{m.name} {percentLabel(Number(m.percent))}</button>
              ))}
            </div>
          </div>
        </div>

        <aside className="card calc-total">
          <h2>Итог расчёта</h2>
          {!quote || filledCount === 0 ? (
            <div className="calc-hint">Выберите тип изделия и укажите размеры — стоимость посчитается сразу.</div>
          ) : (
            <>
              <div className="calc-line"><span>Ковры и услуги</span><b>{money(quote.goods_amount)}</b></div>
              {quote.logistics.filter(l => l.unit_price > 0).map(l => (
                <div className="calc-line" key={l.sku_id}>
                  <span>{l.name}</span>
                  <b>{l.free ? 'бесплатно' : money(l.price)}</b>
                </div>
              ))}
              {quote.modifiers.map(m => (
                <div className="calc-line" key={m.modifier_id}>
                  <span>{m.name} {percentLabel(Number(m.percent))}</span>
                  <b>{signed(m.amount)}</b>
                </div>
              ))}
              {Math.abs(quote.rounding_amount) >= 0.01 && (
                <div className="calc-line calc-muted">
                  <span>Округление в пользу клиента</span>
                  <span>{money(quote.rounding_amount)}</span>
                </div>
              )}
              <div className="calc-grand"><span>Предварительно</span><b>{money(quote.total_amount)}</b></div>
              {freeThreshold != null && (
                quote.goods_amount >= freeThreshold
                  ? <div className="calc-note is-ok">Забор и доставка бесплатны — заказ от {money(freeThreshold)}</div>
                  : <div className="calc-note">До бесплатных забора и доставки — ещё {money(freeThreshold - quote.goods_amount)}</div>
              )}
            </>
          )}
          {quote && quote.warnings.length > 0 && (
            <ul className="calc-warnings">
              {quote.warnings.map(w => <li key={w}>{w}</li>)}
            </ul>
          )}
          {quoteError && <div className="error-msg">{quoteError}</div>}
          <div className="calc-actions">
            {!isReadonly && (
              <button
                className="btn-primary"
                disabled={!canCreate || applying}
                onClick={() => setShowCreate(true)}
                title={canCreate ? undefined : 'Сначала посчитайте хотя бы одно изделие'}
              >Создать заказ на основании расчёта</button>
            )}
            <button
              className="btn-secondary"
              disabled={applying}
              onClick={() => { setDraft(emptyDraft()); setQuote(null) }}
            >Очистить расчёт</button>
          </div>
        </aside>
      </div>

      {showCreate && (
        <CreateOrderModal
          quoteSummary={summary}
          onClose={() => setShowCreate(false)}
          onCreated={o => void handleCreated(o)}
        />
      )}

      {applying && (
        <div className="modal-overlay" style={{ zIndex: 1500 }}>
          <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
            Переносим расчёт в заказ…
          </div>
        </div>
      )}
    </div>
  )
}
