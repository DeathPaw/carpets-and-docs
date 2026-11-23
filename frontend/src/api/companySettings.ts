import client from './client'

/**
 * V39: реквизиты для печатных форм (правка №6 от 09.09).
 *
 * Хранятся одной записью на бэке и правятся в Справочниках — после изменения
 * сразу печатаются во всех документах: накладных, пустых бланках, маршрутном листе.
 * ИНН, ОГРНИП и банковских реквизитов здесь нет намеренно: заказчик просил их
 * не печатать.
 */
export interface CompanySettings {
  /** Крупная строка шапки — «Коврокот». */
  brand_name: string
  /** «стирка ковров с забором и доставкой». */
  tagline: string | null
  /** «направление прачечной «Возрождение»». */
  subtitle: string | null
  /** Адрес в шапке, короткой формой. */
  header_address: string | null
  /** «ИП Кузнецов А.Г.». */
  executor: string | null
  /** Адрес в реквизитах, полной формой. */
  legal_address: string | null
  /** Телефоны одной строкой — печатаются как есть. */
  phones: string | null
  /** Логотип data-URL'ом. null — шапка без логотипа. */
  logo_data: string | null
  /** V64 (ПР-005): блоки накладной JSON-строкой — см. {@link parseInvoiceBlocks}. */
  invoice_blocks?: string | null
}

/**
 * ПР-005: блок печатной накладной. Порядок в списке — порядок печати внутри
 * своего места в документе.
 */
export interface InvoiceBlock {
  type: 'TEXT' | 'IMAGE' | 'QR'
  /** Где печатать: после шапки, после таблицы ковров, внизу документа. */
  position: 'AFTER_HEADER' | 'AFTER_TABLE' | 'FOOTER'
  /** В каких накладных: приём (acceptance), выдача (issue). */
  docs: ('acceptance' | 'issue')[]
  /** В каких экземплярах: оба, только клиента, только организации. */
  copies: 'BOTH' | 'CLIENT' | 'ORGANIZATION'
  /** TEXT — текст (переносы строк сохраняются); подпись под картинкой и QR. */
  text?: string
  /** IMAGE — data-URL картинки. */
  image_data?: string
  /** QR — ссылка, которую кодирует QR. */
  url?: string
}

export function parseInvoiceBlocks(c: CompanySettings | null | undefined): InvoiceBlock[] {
  if (!c?.invoice_blocks) return []
  try {
    const parsed = JSON.parse(c.invoice_blocks)
    return Array.isArray(parsed) ? parsed as InvoiceBlock[] : []
  } catch {
    return []
  }
}

export async function saveInvoiceBlocks(blocks: InvoiceBlock[]): Promise<CompanySettings> {
  const saved = await client.put<CompanySettings>('/api/company-settings/invoice-blocks', blocks).then(r => r.data)
  cached = Promise.resolve(saved)
  return saved
}

let cached: Promise<CompanySettings> | null = null

/**
 * Реквизиты для печати. Кэшируем на время жизни вкладки: печатают постоянно,
 * меняют редко, а сохранение в Справочниках само обновляет кэш.
 *
 * worker — кабинет водителя: он ходит под /api/worker/** без логина оператора.
 */
export function getCompanySettings(opts: { fresh?: boolean; worker?: boolean } = {}): Promise<CompanySettings> {
  if (!cached || opts.fresh) {
    const url = opts.worker ? '/api/worker/company-settings' : '/api/company-settings'
    const request = client.get<CompanySettings>(url).then(r => r.data)
    // Неудачный запрос не кэшируем — следующая печать попробует снова.
    request.catch(() => { if (cached === request) cached = null })
    cached = request
  }
  return cached
}

export async function updateCompanySettings(data: CompanySettings): Promise<CompanySettings> {
  const saved = await client.put<CompanySettings>('/api/company-settings', data).then(r => r.data)
  cached = Promise.resolve(saved)
  return saved
}
