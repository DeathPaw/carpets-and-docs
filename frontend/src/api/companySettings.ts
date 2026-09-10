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
