import type { Order, OrderItem, OrderItemService, OrderModifier } from '../types'
import type { CompanySettings } from '../api/companySettings'
import { PAYMENT_LABELS } from '../constants/statuses'
import { formatOrderNumber } from '../utils/format'
import { formatPhone } from '../components/PhoneInput'

/**
 * Печатные формы для клиента: накладные на приём и выдачу ковров и их пустые бланки.
 *
 * Правки от 09.09:
 *   №3 — накладная на приём крупнее: её читают и подписывают в том числе пожилые
 *        клиенты; отметки о загрязнении, износе и дефектах; строки для «лишних»
 *        ковров и дополнительных услуг; согласие клиента с оценкой;
 *   №4 — пустые бланки: водитель берёт их на смену, если забирает или отдаёт ковры
 *        вне распечатанного заказа;
 *   №5 — итоги отдельным блоком под таблицей; позиция и её услуга больше не
 *        печатаются двумя строками с одной и той же суммой (клиент читал это как
 *        двойную цену); «Оформление» за 0 ₽ не печатается;
 *   №6 — шапка «Коврокот» и реквизиты из Справочников;
 *   №7 — в экземпляре организации накладной на выдачу — отметка о сдаче денег.
 *
 * Каждый экземпляр — на своём листе A4: с крупным шрифтом и новыми полями два
 * экземпляра на одном листе, как раньше, уже не помещаются.
 */

export type InvoiceMode = 'pickup' | 'delivery'

export interface InvoiceLine {
  label: string
  amount: number
}

export interface InvoiceItem {
  typeName: string
  description: string | null
  defects: string | null
  /** «2 × 3 м», «4,5 кг». */
  size: string
  area: number | null
  price: number
  /** Выполненные работы — названия услуг позиции, без их сумм. */
  works: string[]
}

export interface InvoiceData {
  orderNo: string
  clientName: string
  clientPhone: string | null
  /** Адрес забора или доставки — смотря какая накладная, с квартирой. */
  address: string | null
  date: string | null
  timeSlot: string | null
  comment: string | null
  legacyId: number | null
  isWarranty: boolean
  /** Только изделия клиента — без служебных позиций «Приём», «Доставка», «Оформление». */
  items: InvoiceItem[]
  goodsAmount: number
  /** Забор и доставка. null — их нет: клиент привёз и заберёт сам. */
  logistics: InvoiceLine | null
  /** Прочие служебные позиции с ненулевой ценой — например, платное оформление. */
  extras: InvoiceLine[]
  discounts: InvoiceLine[]
  surcharges: InvoiceLine[]
  /** Округление итога вниз до сотни, ≤ 0. */
  rounding: number
  total: number
  paid: boolean
  paymentLabel: string | null
}

/** Служебные позиции заказа (V22) — этапы работы, а не изделия клиента. */
const SERVICE_ITEM_TYPES = new Set(['Приём', 'Доставка', 'Оформление'])

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Как на бэке: до копеек, половина — от нуля. */
const round2 = (x: number) => Math.sign(x) * Math.round(Math.abs(x) * 100) / 100

/** «2 880 ₽», «1 234,50 ₽», «−640 ₽». Копейки — только если они есть. */
export function money(n: number): string {
  const v = round2(Number(n) || 0)
  const abs = Math.abs(v)
  const s = abs.toLocaleString('ru-RU', {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `${v < 0 ? '−' : ''}${s} ₽`
}

const fmtNum = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })

/** 2026-09-10 → 10.09.2026. */
function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}.${m}.${y}` : iso
}

function sizeText(it: OrderItem): string {
  const n = (v: number | null | undefined) => (v == null ? null : Number(v))
  const length = n(it.length), width = n(it.width), weight = n(it.weight), running = n(it.running_meters)
  const parts: string[] = []
  if (length && width) parts.push(`${fmtNum(length)} × ${fmtNum(width)} м`)
  else if (length) parts.push(`длина ${fmtNum(length)} м`)
  else if (width) parts.push(`ширина ${fmtNum(width)} м`)
  if (weight) parts.push(`${fmtNum(weight)} кг`)
  if (running) parts.push(`${fmtNum(running)} п. м`)
  return parts.join(', ')
}

/**
 * Данные накладной из заказа.
 *
 * Суммы берём те же, что показывает карточка заказа: цена позиции уже равна сумме
 * её услуг, поэтому услуги в таблице — только названиями (правка №5: раньше
 * позиция и её услуга печатались двумя строками с одной суммой). Скидки и
 * надбавки — процент от base_amount, как считает бэкенд; разница до total_amount —
 * округление итога вниз до сотни.
 */
export function buildInvoiceData(
  order: Order,
  items: OrderItem[],
  services: OrderItemService[],
  modifiers: OrderModifier[],
  mode: InvoiceMode,
): InvoiceData {
  const byItem = new Map<number, OrderItemService[]>()
  services.forEach(s => {
    const list = byItem.get(s.order_item_id) || []
    list.push(s)
    byItem.set(s.order_item_id, list)
  })
  const activeServices = (it: OrderItem) => (byItem.get(it.id) || []).filter(s => s.status !== 'CANCELLED')
  const active = items.filter(i => i.status !== 'CANCELLED')
  const isServiceItem = (it: OrderItem) => SERVICE_ITEM_TYPES.has((it.item_type_name || '').trim())
  const goods = active.filter(it => !isServiceItem(it))

  // Забор и доставка. Самовывоз (V18 — свап услуги на позиции) — не наша доставка:
  // строку не печатаем, а не пишем «0 ₽», чтобы клиент не решил, что её забыли.
  let logisticsAmount = 0
  let pickupLeg = false
  let deliveryLeg = false
  const extras: InvoiceLine[] = []
  for (const it of active.filter(isServiceItem)) {
    const type = (it.item_type_name || '').trim()
    const price = Number(it.price) || 0
    if (type === 'Оформление') {
      if (price > 0) extras.push({ label: 'Оформление', amount: price })
      continue
    }
    if (activeServices(it).some(s => /самовывоз/i.test(s.sku_name || ''))) continue
    if (type === 'Приём') pickupLeg = true
    else deliveryLeg = true
    logisticsAmount += price
  }
  const logistics: InvoiceLine | null = pickupLeg || deliveryLeg
    ? {
        label: pickupLeg && deliveryLeg ? 'Доставка (забор и отвоз)' : pickupLeg ? 'Забор ковров' : 'Доставка',
        amount: logisticsAmount,
      }
    : null

  const base = Number(order.base_amount) || 0
  const mods = modifiers.map(m => {
    const percent = Number(m.percent) || 0
    return {
      label: `${m.modifier_name} (${percent > 0 ? '+' : '−'}${fmtNum(Math.abs(percent))}%)`,
      amount: round2(base * percent / 100),
    }
  })
  const modifiersSum = mods.reduce((s, m) => s + m.amount, 0)
  const total = Number(order.total_amount) || 0

  const apartment = mode === 'pickup' ? order.pickup_apartment : order.delivery_apartment
  const address = (mode === 'pickup' ? order.pickup_address : order.delivery_address) || order.client_address

  return {
    orderNo: formatOrderNumber(order.id, order.created_at),
    clientName: order.client_name,
    clientPhone: order.client_phone ? formatPhone(order.client_phone) : null,
    address: address ? address + (apartment ? `, кв. ${apartment}` : '') : null,
    date: mode === 'pickup' ? order.pickup_date : order.delivery_date,
    timeSlot: mode === 'pickup' ? order.pickup_time_slot : order.delivery_time_slot,
    comment: order.comment,
    legacyId: order.legacy_id,
    isWarranty: order.is_warranty,
    items: goods.map(it => ({
      typeName: it.item_type_name || `Тип #${it.item_type_id}`,
      description: it.description,
      defects: it.defects,
      size: sizeText(it),
      area: it.area != null ? Number(it.area) : null,
      price: Number(it.price) || 0,
      works: Array.from(new Set(activeServices(it).map(s => s.sku_name || `Услуга #${s.sku_id}`))),
    })),
    goodsAmount: goods.reduce((s, it) => s + (Number(it.price) || 0), 0),
    logistics,
    extras,
    discounts: mods.filter(m => m.amount < 0),
    surcharges: mods.filter(m => m.amount > 0),
    rounding: round2(total - (base + modifiersSum)),
    total,
    paid: order.paid,
    paymentLabel: order.paid && order.payment_type ? PAYMENT_LABELS[order.payment_type] : null,
  }
}

// ───────────── разметка ─────────────

const BOX = '<span class="box"></span>'

/** Линия для ручного заполнения. */
const blank = (width?: string) => `<span class="blank"${width ? ` style="width:${width}"` : ' style="width:100%"'}></span>`

function companyHeader(c: CompanySettings): string {
  const lines = [c.subtitle, c.header_address]
    .filter(Boolean)
    .map(t => `<div class="brand-line2">${esc(t)}</div>`)
    .join('')
  const req = [
    c.executor ? `Исполнитель: <b>${esc(c.executor)}</b>` : '',
    c.legal_address ? `Адрес: ${esc(c.legal_address)}` : '',
    c.phones ? `Тел.: <b>${esc(c.phones)}</b>` : '',
  ].filter(Boolean).map(t => `<div>${t}</div>`).join('')
  return `<header class="brand">
    <div class="brand-main">
      ${c.logo_data ? `<img class="brand-logo" src="${esc(c.logo_data)}" alt="">` : ''}
      <div>
        <div class="brand-name">${esc(c.brand_name)}</div>
        ${c.tagline ? `<div class="brand-tagline">${esc(c.tagline)}</div>` : ''}
        ${lines}
      </div>
    </div>
    <div class="brand-req">${req}</div>
  </header>`
}

/** Одна строка с брендом и телефонами — для внутренних документов (маршрутный лист). */
export function brandLineHtml(c: CompanySettings): string {
  return `${esc(c.brand_name)}${c.subtitle ? ` — ${esc(c.subtitle)}` : ''}${c.phones ? ` · тел. ${esc(c.phones)}` : ''}`
}

function docHead(kind: 'acceptance' | 'issue', orderNo: string | null, copyLabel: string): string {
  const name = kind === 'acceptance' ? 'Накладная на приём ковров' : 'Накладная на выдачу ковров'
  const no = orderNo
    ? `№ ${esc(orderNo)}`
    : `№ ${blank('30mm')} от «${blank('8mm')}» ${blank('30mm')} 20${blank('7mm')} г.`
  return `<div class="doc-head">
    <div><div class="doc-title">${name}</div><div class="doc-no">${no}</div></div>
    <div class="copy-label">${esc(copyLabel)}</div>
  </div>`
}

interface MetaCell {
  label: string
  /** Готовый HTML. null — пустая линия для ручного заполнения. */
  value: string | null
  wide?: boolean
}

/** Реквизиты заказа: по две пары «поле — значение» в строке, широкие — на всю строку. */
function metaTable(cells: MetaCell[]): string {
  const td = (c: MetaCell, span = 1) =>
    `<td class="k">${esc(c.label)}</td><td class="v"${span > 1 ? ` colspan="${span}"` : ''}>${c.value ?? blank()}</td>`
  const rows: string[] = []
  let pending: MetaCell | null = null
  for (const c of cells) {
    if (c.wide) {
      if (pending) { rows.push(`<tr>${td(pending, 3)}</tr>`); pending = null }
      rows.push(`<tr>${td(c, 3)}</tr>`)
    } else if (pending) {
      rows.push(`<tr>${td(pending)}${td(c)}</tr>`)
      pending = null
    } else {
      pending = c
    }
  }
  if (pending) rows.push(`<tr>${td(pending, 3)}</tr>`)
  return `<table class="meta">${rows.join('')}</table>`
}

function orderMeta(d: InvoiceData | null, mode: InvoiceMode): string {
  const addrLabel = mode === 'pickup' ? 'Адрес забора' : 'Адрес доставки'
  const dateLabel = mode === 'pickup' ? 'Дата забора' : 'Дата доставки'
  if (!d) {
    return metaTable([
      { label: 'Клиент', value: null },
      { label: 'Телефон', value: null },
      { label: addrLabel, value: null, wide: true },
      { label: dateLabel, value: null },
      { label: 'Время', value: null },
      { label: 'Комментарий', value: null, wide: true },
    ])
  }
  const date = fmtDate(d.date)
  const cells: MetaCell[] = [
    { label: 'Клиент', value: `<b>${esc(d.clientName)}</b>${d.isWarranty ? ' · гарантийный заказ' : ''}` },
    { label: 'Телефон', value: d.clientPhone ? esc(d.clientPhone) : null },
    { label: addrLabel, value: d.address ? esc(d.address) : null, wide: true },
    { label: dateLabel, value: date ? esc(date + (d.timeSlot ? `, ${d.timeSlot}` : '')) : null },
  ]
  if (d.legacyId) cells.push({ label: 'ID старой системы', value: esc(d.legacyId) })
  if (d.comment) cells.push({ label: 'Комментарий', value: esc(d.comment), wide: true })
  return metaTable(cells)
}

/** Отметки по одному изделию — водитель ставит галочки при клиенте (правка №3). */
function marksRow(defects: string | null, colspan: number): string {
  return `<tr class="marks"><td></td><td colspan="${colspan}"><div class="marks-line">
    <span>Загрязнение:${BOX}слабое${BOX}среднее${BOX}сильное</span>
    <span>Износ:${BOX}25%${BOX}50%${BOX}75%</span>
    <span class="defects${defects ? ' filled' : ''}">Дефекты:${defects ? ` <b>${esc(defects)}</b>` : ''}<i class="line"></i></span>
  </div></td></tr>`
}

function acceptanceTable(items: InvoiceItem[], emptyRows: number): string {
  const rows = items.map((it, i) => `<tbody class="pair"><tr class="item">
      <td class="c-no">${i + 1}</td>
      <td>${esc(it.typeName)}</td>
      <td>${esc(it.description || '')}</td>
      <td>${esc(it.size)}</td>
      <td class="num">${it.area ? fmtNum(it.area) : ''}</td>
      <td class="num">${money(it.price)}</td>
    </tr>${marksRow(it.defects, 5)}</tbody>`)
  // Пустые строки — если ковров фактически больше, чем назвали оператору.
  for (let k = 0; k < emptyRows; k++) {
    rows.push(`<tbody class="pair"><tr class="item empty">
      <td class="c-no">${items.length + k + 1}</td><td></td><td></td><td></td><td></td><td></td>
    </tr>${marksRow(null, 5)}</tbody>`)
  }
  return `<table class="grid">
    <colgroup><col style="width:6%"><col style="width:19%"><col style="width:26%"><col style="width:17%"><col style="width:12%"><col style="width:20%"></colgroup>
    <thead><tr>
      <th class="c-no">№</th><th>Изделие</th><th>Описание, цвет</th><th>Размеры</th>
      <th class="num">Площадь, м²</th><th class="num">Стоимость (предв.)</th>
    </tr></thead>
    ${rows.join('')}
  </table>`
}

function issueTable(items: InvoiceItem[], emptyRows: number): string {
  const rows = items.map((it, i) => `<tr>
      <td class="c-no">${i + 1}</td>
      <td>${esc(it.typeName)}</td>
      <td>${esc(it.description || '')}${it.defects ? `<div class="note">Дефекты: ${esc(it.defects)}</div>` : ''}</td>
      <td>${esc(it.size)}</td>
      <td class="num">${it.area ? fmtNum(it.area) : ''}</td>
      <td>${esc(it.works.join(', '))}</td>
      <td class="num">${money(it.price)}</td>
    </tr>`)
  for (let k = 0; k < emptyRows; k++) {
    rows.push(`<tr class="empty"><td class="c-no">${items.length + k + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`)
  }
  return `<table class="grid">
    <colgroup><col style="width:5%"><col style="width:16%"><col style="width:20%"><col style="width:14%"><col style="width:10%"><col style="width:21%"><col style="width:14%"></colgroup>
    <thead><tr>
      <th class="c-no">№</th><th>Изделие</th><th>Описание</th><th>Размеры</th>
      <th class="num">Площадь, м²</th><th>Выполненные работы</th><th class="num">Стоимость</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>`
}

function extraServicesBlock(): string {
  const rows = [1, 2, 3].map(i => `<tr class="empty"><td class="c-no">${i}</td><td></td><td></td></tr>`).join('')
  return `<div class="section-title">Дополнительные услуги <span class="muted">— вписываются вручную</span></div>
  <table class="grid">
    <colgroup><col style="width:6%"><col><col style="width:24%"></colgroup>
    <thead><tr><th class="c-no">№</th><th>Услуга</th><th class="num">Стоимость, ₽</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

interface TotalRow {
  /** Готовый HTML. */
  label: string
  /** Готовый HTML. null — пустая линия для ручного заполнения. */
  value: string | null
  cls?: string
}

function totalsTable(rows: TotalRow[], grandLabel: string, grandValue: string | null): string {
  const tr = (r: TotalRow) =>
    `<tr${r.cls ? ` class="${r.cls}"` : ''}><td>${r.label}</td><td class="num">${r.value ?? blank('32mm')}</td></tr>`
  return `<table class="totals">
    ${rows.map(tr).join('')}
    <tr class="grand"><td>${esc(grandLabel)}</td><td class="num">${grandValue ?? blank('36mm')}</td></tr>
  </table>`
}

/** Строки итогов после суммы изделий: доставка, прочее, скидки, надбавки, округление. */
function adjustmentRows(d: InvoiceData, discountsTitle: string): TotalRow[] {
  const rows: TotalRow[] = []
  if (d.logistics) {
    rows.push({ label: esc(d.logistics.label), value: d.logistics.amount > 0 ? money(d.logistics.amount) : 'бесплатно' })
  }
  d.extras.forEach(e => rows.push({ label: esc(e.label), value: money(e.amount) }))
  if (d.discounts.length > 0) {
    rows.push({ label: esc(discountsTitle), value: '', cls: 'sub-head' })
    d.discounts.forEach(x => rows.push({ label: esc(x.label), value: money(x.amount), cls: 'indent' }))
  }
  d.surcharges.forEach(x => rows.push({ label: esc(x.label), value: `+${money(x.amount)}` }))
  if (Math.abs(d.rounding) >= 0.01) {
    rows.push({ label: 'Округление в пользу клиента', value: money(d.rounding) })
  }
  return rows
}

function signatures(first: string, second: string): string {
  const one = (caption: string) => `<div class="sig">
    <div class="sig-cap">${esc(caption)}</div>
    <div class="sig-row"><span class="line"></span><span>/</span><span class="line name"></span></div>
    <div class="sig-label"><span>подпись</span><span class="name">фамилия, инициалы</span></div>
  </div>`
  return `<div class="sigs">${one(first)}${one(second)}</div>`
}

/** Правка №7: служебный блок для экземпляра организации — водитель сдаёт деньги в кассу. */
function cashBlock(): string {
  return `<div class="service-block">
    <div class="sb-title">Служебная отметка — остаётся в организации</div>
    <div class="sb-row">
      <span>Получено от клиента:</span><span class="line w38"></span><span>₽</span>
      <span class="gap"></span>
      <span>Сдано в кассу:</span><span class="line w38"></span><span>₽</span>
    </div>
    <div class="sb-row"><span>Тип оплаты:</span>${BOX}наличные${BOX}безналичный перевод на карту</div>
    <div class="sb-row"><span>Комментарий:</span><span class="line grow"></span></div>
    <div class="sb-row"><span class="line grow"></span></div>
  </div>`
}

const generatedAt = () => `<div class="footer">Сформировано ${esc(new Date().toLocaleString('ru-RU'))}</div>`

const sheet = (parts: string[]) => `<section class="sheet">${parts.join('')}</section>`

function documentHtml(title: string, sheets: string[]): string {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${DOC_CSS}</style></head><body>${sheets.join('')}</body></html>`
}

/** Накладная на приём ковров. data = null — пустой бланк (правка №4). */
export function acceptanceHtml(c: CompanySettings, d: InvoiceData | null): string {
  const totals = d
    ? totalsTable(
        [{ label: 'Предварительная стоимость ковров', value: money(d.goodsAmount) }, ...adjustmentRows(d, 'Скидки клиента:')],
        'Предварительная сумма к оплате', money(d.total),
      )
    : totalsTable(
        [
          { label: 'Предварительная стоимость ковров', value: null },
          { label: 'Стоимость доставки', value: null },
          { label: 'Дополнительные услуги', value: null },
          { label: 'Скидки клиента', value: null },
        ],
        'Предварительная сумма к оплате', null,
      )
  const notice = `<div class="notice">
    • Ковровые изделия приняты для стирки на производстве.<br>
    • Размеры предварительные и уточняются на производстве после приёмки.<br>
    • Стоимость предварительная: окончательная сумма — после уточнения размеров и обработки.
  </div>`
  const copy = (label: string) => sheet([
    companyHeader(c),
    docHead('acceptance', d?.orderNo ?? null, label),
    orderMeta(d, 'pickup'),
    acceptanceTable(d?.items ?? [], d ? 3 : 6),
    extraServicesBlock(),
    // Условия приёмки — слева от итогов, а не под ними: так экземпляр помещается на один лист.
    `<div class="totals-row">${notice}${totals}</div>`,
    `<div class="consent">С оценкой дефектов, степенью загрязнения и износа изделия согласен.</div>`,
    signatures('Ковры сдал (клиент)', 'Ковры принял (представитель)'),
    d ? generatedAt() : '',
  ])
  return documentHtml(
    d ? `Накладная на приём ${d.orderNo}` : 'Бланк накладной на приём ковров',
    [copy('Экземпляр клиента'), copy('Экземпляр организации')],
  )
}

/** Накладная на выдачу ковров. data = null — пустой бланк (правка №4). */
export function issueHtml(c: CompanySettings, d: InvoiceData | null): string {
  const totals = d
    ? totalsTable(
        [{ label: 'Стоимость ковров и услуг', value: money(d.goodsAmount) }, ...adjustmentRows(d, 'Скидки:')],
        'Итого к оплате', money(d.total),
      )
    : totalsTable(
        [
          { label: 'Стоимость ковров и услуг', value: null },
          { label: 'Доставка', value: null },
          { label: 'Скидки', value: null },
        ],
        'Итого к оплате', null,
      )
  const payment = d
    ? `<div class="payment">Оплата: ${d.paid
        ? `<b>оплачен</b>${d.paymentLabel ? `, ${esc(d.paymentLabel.toLowerCase())}` : ''}`
        : '<b>не оплачен</b> — оплата при получении'}</div>`
    : `<div class="payment">Оплата:${BOX}наличные${BOX}безналичный перевод на карту</div>`
  const copy = (label: string, forOrganization: boolean) => sheet([
    companyHeader(c),
    docHead('issue', d?.orderNo ?? null, label),
    orderMeta(d, 'delivery'),
    issueTable(d?.items ?? [], d ? 0 : 8),
    `<div class="totals-row">${payment}${totals}</div>`,
    signatures('Ковры выдал (представитель)', 'Ковры получил (клиент)'),
    forOrganization ? cashBlock() : '',
    d ? generatedAt() : '',
  ])
  return documentHtml(
    d ? `Накладная на выдачу ${d.orderNo}` : 'Бланк накладной на выдачу ковров',
    [copy('Экземпляр клиента', false), copy('Экземпляр организации', true)],
  )
}

/**
 * Печать через скрытый iframe — без нового окна, которое блокирует браузер.
 * Ждём картинки (логотип): иначе диалог печати открывается раньше, чем она
 * загрузилась, и шапка печатается без неё.
 */
export function openPrint(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  Object.assign(iframe.style, { position: 'fixed', left: '-10000px', top: '0', width: '210mm', height: '297mm', border: '0' })
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument || iframe.contentWindow?.document
  if (!doc) { iframe.remove(); return }
  doc.open()
  doc.write(html)
  doc.close()
  const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe) }
  const images = Array.from(doc.images).map(img => img.complete
    ? Promise.resolve()
    : new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() }))
  void Promise.all(images).then(() => {
    setTimeout(() => {
      const win = iframe.contentWindow
      if (!win) { cleanup(); return }
      win.addEventListener('afterprint', cleanup)
      win.focus()
      win.print()
      // Страховка: не во всех браузерах приходит afterprint.
      setTimeout(cleanup, 60000)
    }, 150)
  })
}

export const printAcceptance = (c: CompanySettings, d: InvoiceData | null) => openPrint(acceptanceHtml(c, d))
export const printIssue = (c: CompanySettings, d: InvoiceData | null) => openPrint(issueHtml(c, d))

const DOC_CSS = `
@page { size: A4 portrait; margin: 8mm 10mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 13px; line-height: 1.35; color: #111;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet + .sheet { break-before: page; page-break-before: always; }

.brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
         padding-bottom: 8px; border-bottom: 2.5px solid #111; }
.brand-main { display: flex; align-items: center; gap: 12px; }
.brand-logo { max-height: 62px; max-width: 130px; object-fit: contain; }
.brand-name { font-size: 26px; font-weight: 800; line-height: 1.05; letter-spacing: 0.3px; }
.brand-tagline { font-size: 14px; font-weight: 700; margin-top: 2px; }
.brand-line2 { font-size: 12.5px; }
.brand-req { text-align: right; font-size: 12.5px; line-height: 1.55; }

.doc-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin: 8px 0 6px; }
.doc-title { font-size: 20px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; }
.doc-no { font-size: 15px; font-weight: 700; margin-top: 2px; }
.copy-label { font-size: 12px; font-weight: 700; border: 1.5px solid #111; border-radius: 4px; padding: 3px 9px; white-space: nowrap; }

.blank { display: inline-block; border-bottom: 1px solid #111; height: 1.1em; vertical-align: bottom; }

.meta { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.meta td { padding: 3px 6px 2px 0; vertical-align: bottom; font-size: 14px; }
.meta td.k { font-weight: 700; white-space: nowrap; width: 1%; padding-right: 8px; }
.meta td.v { padding-right: 16px; }

table.grid { width: 100%; border-collapse: collapse; }
table.grid th, table.grid td { border: 1px solid #444; padding: 3px 6px; vertical-align: top; font-size: 13px; }
table.grid th { background: #ececec; font-size: 12px; font-weight: 700; text-align: left; line-height: 1.2; }
table.grid .num { text-align: right; white-space: nowrap; }
table.grid .c-no { text-align: center; }
table.grid tr.empty td { height: 24px; }
table.grid tr.item td { border-bottom: none; }
table.grid tr.marks td { border-top: none; padding: 1px 6px 4px; font-size: 12px; background: #fafafa; }
table.grid .note { font-size: 12px; margin-top: 2px; }
tbody.pair { break-inside: avoid; page-break-inside: avoid; }
.marks-line { display: flex; align-items: flex-end; gap: 4px 12px; flex-wrap: wrap; }
.marks-line .defects { flex: 1 1 32mm; display: flex; align-items: flex-end; gap: 4px; }
/* Дефект уже вписан оператором — отдельной строкой, чтобы текст не зажимало справа. */
.marks-line .defects.filled { flex-basis: 100%; }
.marks-line .defects .line { flex: 1; border-bottom: 1px solid #111; height: 1.1em; }
.box { display: inline-block; width: 12px; height: 12px; border: 1.4px solid #111; border-radius: 2px;
       vertical-align: -2px; margin: 0 3px 0 6px; }

.section-title { font-weight: 700; font-size: 14px; margin: 10px 0 4px; }
.muted { font-weight: 400; font-size: 12px; color: #333; }

.totals-row { display: flex; align-items: flex-start; gap: 16px; margin-top: 12px; }
.totals-row > :first-child { flex: 1; }
table.totals { flex: 0 0 62%; width: 62%; border-collapse: collapse; border: 2px solid #111; }
table.totals td { padding: 5px 10px; font-size: 14.5px; border-bottom: 1px solid #bbb; }
table.totals td.num { text-align: right; white-space: nowrap; }
table.totals tr.sub-head td { font-weight: 700; border-bottom: none; padding-bottom: 0; }
table.totals tr.indent td:first-child { padding-left: 22px; }
table.totals tr.grand td { font-size: 18px; font-weight: 800; border-top: 2px solid #111; border-bottom: none; padding: 7px 10px; }
table.totals tr.grand td:first-child { white-space: nowrap; }

.payment { font-size: 14px; line-height: 1.6; }
.notice { font-size: 12px; line-height: 1.5; }
.consent { margin-top: 12px; font-size: 14.5px; font-weight: 700; }
.sigs { display: flex; gap: 28px; margin-top: 10px; }
.sig { flex: 1; }
.sig-cap { font-size: 13px; font-weight: 700; }
.sig-row { display: flex; align-items: flex-end; gap: 6px; height: 26px; }
.sig-row .line { flex: 1; border-bottom: 1px solid #111; }
.sig-row .line.name { flex: 1.4; }
.sig-label { display: flex; gap: 6px; font-size: 11px; color: #333; }
.sig-label span { flex: 1; text-align: center; }
.sig-label span.name { flex: 1.4; }

.service-block { margin-top: 18px; border: 1.5px dashed #111; border-radius: 4px; padding: 8px 12px 10px; }
.sb-title { font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.3px; }
.sb-row { display: flex; align-items: flex-end; gap: 6px; margin-top: 10px; font-size: 14px; }
.sb-row .line { border-bottom: 1px solid #111; height: 1.1em; }
.sb-row .line.w38 { width: 38mm; }
.sb-row .line.grow { flex: 1; }
.sb-row .gap { width: 10mm; }

.footer { margin-top: 10px; font-size: 10.5px; color: #444; text-align: right; }
.consent, .sigs, .totals-row, .service-block { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
`
