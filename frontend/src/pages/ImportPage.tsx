import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { useToast } from '../components/Toast'
import { importsApi } from '../api/imports'
import type { ImportBatchRow, ImportReport, ImportTemplate } from '../api/imports'
import { todayIso } from '../utils/format'

/**
 * Обмен через Excel (ТЗ v2, блок 8).
 *
 * Порядок работы жёсткий: скачать шаблон → заполнить → загрузить → посмотреть,
 * что будет создано, обновлено, где дубли и ошибки → подтвердить сохранение.
 * Пакет с ошибками не сохраняется, а записи, которых нет в файле, не удаляются.
 *
 * Столбцы сопоставляются по заголовкам шаблона автоматически — руками ничего
 * связывать не нужно. Файл чужой структуры или другой версии отклоняется.
 */
const META_SHEET = 'META'

export default function ImportPage() {
  const { showToast } = useToast()
  const [templates, setTemplates] = useState<ImportTemplate[]>([])
  const [kind, setKind] = useState('')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [payload, setPayload] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null)
  const [filename, setFilename] = useState('')
  const [fileVersion, setFileVersion] = useState('')
  const [updateMode, setUpdateMode] = useState<'SKIP' | 'UPDATE'>('SKIP')
  const [busy, setBusy] = useState(false)
  const [batches, setBatches] = useState<ImportBatchRow[]>([])

  useEffect(() => {
    void importsApi.templates().then(list => {
      setTemplates(list)
      if (list.length && !kind) setKind(list[0].kind)
    }).catch(() => showToast('Не удалось загрузить шаблоны', 'error'))
    void loadBatches()
  }, [])

  const loadBatches = async () => {
    try { setBatches(await importsApi.batches(20)) } catch { /* журнал не критичен */ }
  }

  const template = templates.find(t => t.kind === kind)

  /** Шаблон строится из серверного описания — второго источника правды нет. */
  const downloadTemplate = () => {
    if (!template) return
    const wb = XLSX.utils.book_new()

    const header = template.columns.map(c => c.title + (c.required ? ' *' : ''))
    const dataSheet = XLSX.utils.aoa_to_sheet([header])
    dataSheet['!cols'] = template.columns.map(c => ({ wch: Math.max(14, c.title.length + 4) }))
    XLSX.utils.book_append_sheet(wb, dataSheet, template.sheet)

    const fields = XLSX.utils.aoa_to_sheet([
      ['Инструкция'],
      [`Шаблон «${template.title}», версия ${template.version}`],
      ['Звёздочка в заголовке — поле обязательно.'],
      ...template.instructions.map(line => [line]),
      [],
      ['Столбец', 'Тип', 'Обязательно', 'Допустимые значения', 'Пояснение'],
      ...template.columns.map(c => [
        c.title,
        c.type === 'DATE' ? 'дата (ГГГГ-ММ-ДД)' : c.type === 'NUMBER' ? 'число'
          : c.type === 'ENUM' ? 'из списка' : 'текст',
        c.required ? 'да' : 'нет',
        c.values ? c.values.join(', ') : '',
        c.hint || '',
      ]),
    ])
    fields['!cols'] = [{ wch: 26 }, { wch: 20 }, { wch: 13 }, { wch: 30 }, { wch: 60 }]
    XLSX.utils.book_append_sheet(wb, fields, 'Инструкция')

    const exampleSheet = XLSX.utils.aoa_to_sheet([
      header,
      ...template.examples.map(ex => template.columns.map(c => (ex as Record<string, unknown>)[c.key] ?? '')),
    ])
    exampleSheet['!cols'] = dataSheet['!cols']
    XLSX.utils.book_append_sheet(wb, exampleSheet, 'Пример')

    // Служебный лист: вид и версия шаблона. По нему файл опознаётся при загрузке.
    const meta = XLSX.utils.aoa_to_sheet([
      ['kind', template.kind],
      ['version', template.version],
      ['sheet', template.sheet],
      ['Не изменяйте этот лист — по нему система узнаёт шаблон.'],
    ])
    XLSX.utils.book_append_sheet(wb, meta, META_SHEET)

    XLSX.writeFile(wb, `template_${template.kind.toLowerCase()}_v${template.version}_${todayIso()}.xlsx`)
  }

  const readFile = async (file: File) => {
    if (!template) return
    setBusy(true)
    setReport(null)
    setPayload(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { cellDates: false, raw: false })

      const metaSheet = wb.Sheets[META_SHEET]
      const meta: Record<string, string> = {}
      if (metaSheet) {
        (XLSX.utils.sheet_to_json(metaSheet, { header: 1 }) as unknown[][]).forEach(row => {
          if (row?.[0]) meta[String(row[0])] = String(row[1] ?? '')
        })
      }
      if (!metaSheet || !meta.version) {
        showToast('Файл не похож на шаблон: нет служебного листа META. Скачайте шаблон заново.', 'error')
        return
      }
      if (meta.kind && meta.kind !== template.kind) {
        showToast(`Это шаблон другого вида (${meta.kind}). Выберите соответствующий вид импорта.`, 'error')
        return
      }
      setFileVersion(meta.version)

      const sheetName = meta.sheet && wb.Sheets[meta.sheet] ? meta.sheet : template.sheet
      const sheet = wb.Sheets[sheetName]
      if (!sheet) {
        showToast(`В файле нет листа «${sheetName}»`, 'error')
        return
      }
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
      if (!matrix.length) {
        showToast('Лист с данными пуст', 'error')
        return
      }
      // Сопоставление столбцов по заголовкам шаблона — оператор руками ничего не связывает.
      const headers = (matrix[0] || []).map(h => String(h ?? '').replace(/\s*\*$/, '').trim())
      const byTitle = new Map(template.columns.map(c => [c.title, c.key]))
      const columns = headers.map(h => byTitle.get(h) || '')
      const rows = matrix.slice(1)
        .filter(r => r.some(cell => String(cell ?? '').trim() !== ''))
        .map(r => {
          const obj: Record<string, unknown> = {}
          columns.forEach((key, i) => { if (key) obj[key] = r[i] ?? '' })
          return obj
        })

      const present = columns.filter(Boolean)
      setFilename(file.name)
      setPayload({ columns: present, rows })
      const result = await importsApi.validate(template.kind, {
        version: meta.version, columns: present, rows, filename: file.name,
      })
      setReport(result)
      if (result.errors.length) showToast(`Найдено ошибок: ${result.errors.length}`, 'error')
      else showToast(`Проверено строк: ${result.row_count}`, 'success')
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Не удалось прочитать файл', 'error')
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!template || !payload || !report) return
    setBusy(true)
    try {
      const res = await importsApi.commit(template.kind, {
        version: fileVersion, columns: payload.columns, rows: payload.rows,
        update_mode: updateMode, filename,
      })
      showToast(`Создано: ${res.created}, обновлено: ${res.updated}, пропущено: ${res.skipped}`, 'success')
      setReport(null)
      setPayload(null)
      await loadBatches()
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Не удалось сохранить пакет', 'error')
    } finally {
      setBusy(false)
    }
  }

  const hasErrors = !!report?.errors.length

  return (
    <div>
      <h1>Обмен через Excel</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label>Вид данных
            <select value={kind} onChange={e => { setKind(e.target.value); setReport(null); setPayload(null) }}>
              {templates.map(t => <option key={t.kind} value={t.kind}>{t.title}</option>)}
            </select>
          </label>
          <button className="btn-secondary" onClick={downloadTemplate} disabled={!template}>
            Скачать шаблон
          </button>
          <label>
            Файл для загрузки
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={busy || !template}
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void readFile(file).then(() => { e.target.value = '' })
              }}
            />
          </label>
        </div>
        {template && (
          <div style={{ marginTop: 12, fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>
            Версия шаблона {template.version}. Лист данных — «{template.sheet}».
            Столбцы сопоставляются по заголовкам автоматически. Записи, которых нет в файле, не удаляются.
          </div>
        )}
      </div>

      {report && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Результат проверки: {filename || 'файл'}</h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            <Metric label="Строк в файле" value={report.row_count} />
            <Metric label="Будет создано" value={report.creates.length} accent="#27ae60" />
            <Metric label="Будет обновлено" value={report.updates.length} accent="#2980b9" />
            <Metric label="Дублей" value={report.duplicates.length} accent="#e67e22" />
            <Metric label="Ошибок" value={report.errors.length} accent="#c0392b" />
          </div>

          {hasErrors && (
            <IssueTable title="Ошибки — пакет не сохранится, пока они есть" issues={report.errors} color="#c0392b" />
          )}
          {!!report.duplicates.length && (
            <IssueTable
              title="Дубли — в файле несколько строк с одним внешним ID, лишние не сохранятся"
              issues={report.duplicates}
              color="#e67e22"
            />
          )}

          {!!report.creates.length && (
            <ChangeTable title="Создание" changes={report.creates} />
          )}
          {!!report.updates.length && (
            <ChangeTable title="Обновление существующих" changes={report.updates} />
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            {/* Режим обновления выбирается явно: молча перезаписать данные нельзя. */}
            <label>Что делать с существующими записями
              <select value={updateMode} onChange={e => setUpdateMode(e.target.value as 'SKIP' | 'UPDATE')}>
                <option value="SKIP">Пропустить (не менять)</option>
                <option value="UPDATE">Обновить данными из файла</option>
              </select>
            </label>
            <button className="btn-primary" onClick={commit} disabled={busy || hasErrors}>
              Сохранить пакет
            </button>
            {hasErrors && (
              <span style={{ color: '#c0392b', fontSize: 'var(--font-sm)' }}>
                Исправьте ошибки в файле и загрузите его заново.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Журнал загрузок</h3>
        <table>
          <thead>
            <tr><th>Дата</th><th>Вид</th><th>Файл</th><th>Режим</th><th>Создано</th><th>Обновлено</th><th>Пропущено</th><th>Кто</th></tr>
          </thead>
          <tbody>
            {batches.map(b => (
              <tr key={b.id}>
                <td>{new Date(b.created_at).toLocaleString('ru')}</td>
                <td>{templates.find(t => t.kind === b.kind)?.title || b.kind}</td>
                <td>{b.filename || '—'}</td>
                <td>{b.update_mode === 'UPDATE' ? 'Обновление' : 'Пропуск'}</td>
                <td>{b.created_count}</td>
                <td>{b.updated_count}</td>
                <td>{b.skipped_count}</td>
                <td>{b.created_by || '—'}</td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr><td colSpan={8} style={{ color: '#7f8c8d' }}>Загрузок пока не было</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent }}>{value}</div>
    </div>
  )
}

function IssueTable({ title, issues, color }: {
  title: string
  issues: { sheet: string; row: number; field: string | null; message: string }[]
  color: string
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <strong style={{ color }}>{title}</strong>
      <table style={{ marginTop: 6 }}>
        <thead><tr><th style={{ width: 120 }}>Лист</th><th style={{ width: 90 }}>Строка</th><th style={{ width: 200 }}>Поле</th><th>Что не так</th></tr></thead>
        <tbody>
          {issues.map((issue, i) => (
            <tr key={i}>
              <td>{issue.sheet}</td>
              <td>{issue.row || '—'}</td>
              <td>{issue.field || '—'}</td>
              <td>{issue.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChangeTable({ title, changes }: {
  title: string
  changes: { row: number; external_id: string; title: string; note?: string }[]
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? changes : changes.slice(0, 20)
  return (
    <div style={{ marginBottom: 12 }}>
      <strong>{title} ({changes.length})</strong>
      <table style={{ marginTop: 6 }}>
        <thead><tr><th style={{ width: 90 }}>Строка</th><th style={{ width: 180 }}>Внешний ID</th><th>Запись</th><th>Примечание</th></tr></thead>
        <tbody>
          {visible.map(c => (
            <tr key={`${c.row}-${c.external_id}`}>
              <td>{c.row}</td>
              <td>{c.external_id}</td>
              <td>{c.title}</td>
              <td>{c.note || '—'}</td>
            </tr>
          ))}
          {changes.length > visible.length && (
            <tr>
              <td colSpan={4}>
                Показаны первые {visible.length} из {changes.length}.{' '}
                <button
                  className="btn-secondary"
                  style={{ padding: '2px 8px', fontSize: 'var(--font-sm)' }}
                  onClick={() => setExpanded(true)}
                >Показать все</button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
