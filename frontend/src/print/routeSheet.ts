import type { Order } from '../types'
import type { CompanySettings } from '../api/companySettings'
import { PAYMENT_LABELS, PRELIMINARY_PAYMENT_LABELS } from '../constants/statuses'
import { formatPhone } from '../components/PhoneInput'
import { brandLineHtml, esc, openPrint } from './printDocs'
import { downloadRouteSheetExcel } from './routeSheetExcel'

export interface RouteSheetCard {
  order: Pick<Order, 'id' | 'pickup_apartment' | 'delivery_apartment' | 'client_phone' |
    'preliminary_payment_type' | 'payment_type' | 'total_amount' | 'comment'>
  type: 'pickup' | 'delivery'
  date: string | null
  timeSlot: string | null
  district: string | null
  address: string | null
  archived?: boolean
}

/**
 * Печать маршрутного листа на конкретный день.
 *
 * Лист горизонтальный: под адрес нужно много места, в книжной ориентации он
 * переносился на 4-5 строк. Колонку «ФИ клиента» убрали — водителю она не нужна,
 * а место занимала. Оплата берётся из предварительного типа (оператор ставит
 * заранее), при его отсутствии — из фактической оплаты.
 *
 * Правки 09.09: отдельная колонка «Район» (№1) — по ней водитель планирует
 * порядок объезда; у заборов сумма не печатается (№2) — на этом этапе она
 * предварительная и сбивает водителя в разговоре с клиентом.
 *
 * driverName — если задан, лист печатается для одного водителя (его имя в шапке).
 */
export function buildRouteSheetHtml(date: string, cards: RouteSheetCard[], company: CompanySettings, driverName?: string): string {
  const dayCards = cards.filter(c => c.date === date)
    .sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''))
  const formattedDate = new Date(date).toLocaleDateString('ru', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const rows = dayCards.map((c, idx) => {
    const apartment = c.type === 'pickup' ? c.order.pickup_apartment : c.order.delivery_apartment
    const addr = (c.address || '—') + (apartment ? `, кв. ${apartment}` : '')
    // client_phone приезжает JOIN'ом из clients. Раньше поля не было вовсе,
    // и в колонке «Телефон» рисовался адрес из fallback'а.
    const phone = c.order.client_phone ? formatPhone(c.order.client_phone) : '—'
    // Оплата: сначала предварительный тип (намерение, ставит оператор заранее),
    // если его нет — фактический. Так водитель знает, чего ждать от клиента.
    const payment = c.order.preliminary_payment_type
      ? PRELIMINARY_PAYMENT_LABELS[c.order.preliminary_payment_type]
      : (c.order.payment_type ? PAYMENT_LABELS[c.order.payment_type] : '—')
    const amount = c.type === 'pickup' ? '' : `${Number(c.order.total_amount).toFixed(0)} ₽`
    // Архивный маршрутный лист: выполненные точки помечаем галкой и глушим цвет,
    // чтобы при перепечатке прошедшей развозки было видно, что уже отработано.
    const rowStyle = c.archived ? ' style="color:#7f8c8d"' : ''
    const mark = c.archived ? ' ✓' : ''
    return `<tr${rowStyle}>
      <td style="padding:5px 6px;text-align:center">${idx + 1}</td>
      <td style="padding:5px 6px;text-align:center;font-weight:600">${c.type === 'pickup' ? 'Забор' : 'Отвоз'}${mark}</td>
      <td style="padding:5px 6px;white-space:nowrap">#${String(c.order.id).padStart(5, '0')}</td>
      <td style="padding:5px 6px">${esc(addr)}</td>
      <td style="padding:5px 6px">${esc(c.district || '—')}</td>
      <td style="padding:5px 6px;white-space:nowrap">${esc(phone)}</td>
      <td style="padding:5px 6px;text-align:right;white-space:nowrap">${amount}</td>
      <td style="padding:5px 6px;white-space:nowrap">${esc(payment)}</td>
      <td style="padding:5px 6px;white-space:nowrap">${esc(c.timeSlot || '—')}</td>
      <td style="padding:5px 6px;color:#555">${esc(c.order.comment || '')}</td>
      <td style="padding:5px 6px"></td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Маршрутный лист ${date}</title>
    <style>
      /* Горизонтальный лист: адрес получает достаточную ширину и не ломается
         на много строк, как это было в книжной ориентации. */
      @page{ size: A4 landscape; margin: 8mm }
      body{font-family:Arial,sans-serif;font-size:11px;margin:0;color:#222}
      .head{display:flex;justify-content:space-between;align-items:baseline;gap:16px}
      h1{font-size:16px;margin:0 0 4px}
      .brand{font-size:11px;color:#444;text-align:right}
      .sub{color:#666;margin-bottom:10px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      th{background:#ecf0f1;text-align:left;padding:5px 6px;border:1px solid #bdc3c7;font-size:10px}
      td{border:1px solid #d6dbdf;font-size:11px;vertical-align:top;word-wrap:break-word}
      tr:nth-child(even) td{background:#fafafa}
      tr{page-break-inside:avoid;break-inside:avoid}
      thead{display:table-header-group}
    </style></head><body>
    <div class="head">
      <h1>Маршрутный лист${driverName ? ' — ' + esc(driverName) : ''}</h1>
      <div class="brand">${brandLineHtml(company)}</div>
    </div>
    <div class="sub">${formattedDate} · всего ${dayCards.length} ${dayCards.length === 1 ? 'выезд' : 'выездов'}</div>
    <table>
      <colgroup>
        <col style="width:3%"><col style="width:6%"><col style="width:7%">
        <col style="width:25%"><col style="width:10%"><col style="width:11%">
        <col style="width:6%"><col style="width:8%"><col style="width:8%">
        <col style="width:10%"><col style="width:6%">
      </colgroup>
      <thead><tr>
        <th>#</th>
        <th>Тип</th>
        <th>Заказ</th>
        <th>Адрес</th>
        <th>Район</th>
        <th>Телефон</th>
        <th>Сумма</th>
        <th>Оплата</th>
        <th>Время</th>
        <th>Комментарий</th>
        <th>Отметка</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan=11 style="padding:20px;text-align:center;color:#999">На эту дату выездов нет</td></tr>'}</tbody>
    </table>
    </body></html>`

  return html
}

export function printRouteSheet(date: string, cards: RouteSheetCard[], company: CompanySettings, driverName?: string): void {
  openPrint(buildRouteSheetHtml(date, cards, company, driverName))
}

/** Excel берёт шапку, колонки и строки непосредственно из той же печатной формы. */
export function exportRouteSheet(date: string, cards: RouteSheetCard[], company: CompanySettings, driverName?: string): void {
  downloadRouteSheetExcel(buildRouteSheetHtml(date, cards, company, driverName), `Маршрутный лист_${date}.xlsx`)
}
