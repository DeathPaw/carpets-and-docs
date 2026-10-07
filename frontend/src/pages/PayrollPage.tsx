import { useEffect, useState } from 'react'
import {
  getPayrollSheet, getPayrollEntries, recalculatePayroll, setPayrollMonth,
  closePayrollMonth, openPayrollMonth, getPaySchemes, createPayScheme, deletePayScheme,
  getShifts, addShift, deleteShift, getDriverPoints,
  correctPayrollEntry, resetPayrollEntry, deletePayrollEntry,
  getShareRule, saveShareRule,
  PAY_SCHEME_LABELS,
  type PayrollSheet, type PayrollEntry, type PayScheme, type PaySchemeKind,
  type WorkShift, type DriverPoint,
} from '../api/payroll'
import { getEmployees } from '../api/references'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import type { Employee } from '../types'

/**
 * Зарплата (ТЗ v2, блоки 3 и 4).
 *
 * Ведомость собирается из фактов: завершённые ковры дают сдельные начисления
 * и смены окладникам, назначенные точки — оплату водителям. Оператор может
 * поправить любую строку, указав причину; пересчёт её не затирает и показывает
 * расхождение с автоматическим значением.
 */

type Tab = 'SHEET' | 'ENTRIES' | 'SCHEMES' | 'SHIFTS' | 'POINTS'

const currentMonth = () => new Date().toLocaleDateString('sv-SE').slice(0, 7)

export default function PayrollPage() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('SHEET')
  const [yearMonth, setYearMonth] = useState(currentMonth())
  const [sheet, setSheet] = useState<PayrollSheet | null>(null)
  const [loading, setLoading] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])

  useEffect(() => { getEmployees().then(setEmployees).catch(() => setEmployees([])) }, [])

  const loadSheet = async () => {
    setLoading(true)
    try { setSheet(await getPayrollSheet(yearMonth)) }
    catch { showToast('Не удалось загрузить ведомость', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadSheet() }, [yearMonth])

  const recalc = async () => {
    try {
      const res = await recalculatePayroll(yearMonth)
      await loadSheet()
      showToast(res.warnings.length > 0 ? res.warnings.join('; ') : `Пересчитано: ковров ${res.items}`,
        res.warnings.length > 0 ? 'warning' : 'success')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      showToast(msg ?? 'Не удалось пересчитать', 'error')
    }
  }

  return (
    <div>
      <h1>Зарплата</h1>

      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Месяц</label>
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, width: 160 }}>
          <label>Норма рабочих дней</label>
          <input
            type="number" min="1" max="31"
            value={sheet?.norm_days ?? ''}
            onChange={async e => {
              const v = e.target.value ? Number(e.target.value) : null
              try { await setPayrollMonth(yearMonth, v); await loadSheet() }
              catch (err: unknown) {
                const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
                showToast(msg ?? 'Не удалось сохранить норму', 'error')
              }
            }}
            placeholder="20"
          />
        </div>
        <button className="btn-primary" onClick={recalc} disabled={sheet?.closed}>Пересчитать</button>
        {sheet?.closed ? (
          <button className="btn-secondary" onClick={async () => { await openPayrollMonth(yearMonth); await loadSheet() }}>
            Открыть месяц
          </button>
        ) : (
          <button
            className="btn-secondary"
            title="После закрытия автоматика месяц не трогает"
            onClick={async () => { await closePayrollMonth(yearMonth); await loadSheet() }}
          >Закрыть месяц</button>
        )}
        {sheet?.closed && (
          <span className="badge" style={{ background: '#fdecea', color: '#922b21' }}>Месяц закрыт</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {([
          ['SHEET', 'Ведомость'],
          ['ENTRIES', 'Начисления'],
          ['SCHEMES', 'Схемы оплаты'],
          ['SHIFTS', 'Табель'],
          ['POINTS', 'Точки водителей'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTab(key)}
          >{label}</button>
        ))}
      </div>

      {tab === 'SHEET' && (
        <SheetTab sheet={sheet} loading={loading} yearMonth={yearMonth} onChanged={loadSheet} employees={employees} />
      )}
      {tab === 'ENTRIES' && <EntriesTab yearMonth={yearMonth} onChanged={loadSheet} />}
      {tab === 'SCHEMES' && <SchemesTab employees={employees} />}
      {tab === 'SHIFTS' && <ShiftsTab yearMonth={yearMonth} employees={employees} />}
      {tab === 'POINTS' && <PointsTab yearMonth={yearMonth} />}
    </div>
  )
}

function SheetTab({ sheet, loading, yearMonth, onChanged, employees }: {
  sheet: PayrollSheet | null
  loading: boolean
  yearMonth: string
  onChanged: () => Promise<void>
  employees: Employee[]
}) {
  const { showToast } = useToast()
  const [showRule, setShowRule] = useState(false)

  if (loading) return <div className="loading">Загрузка…</div>
  if (!sheet) return <div className="empty">Нет данных</div>

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Stat label="ФОТ месяца, ₽" value={Number(sheet.total_payroll).toLocaleString('ru')} />
        <Stat
          label="Разница округления, ₽"
          value={Number(sheet.rounding_diff).toLocaleString('ru', { maximumFractionDigits: 2 })}
          hint="Учитывается в затратах месяца один раз и не прячется в тарифе"
        />
        <button className="btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setShowRule(true)}>
          Правило долей за ковёр
        </button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Ведомость за {yearMonth}</h2>
        {sheet.rows.length === 0 ? (
          <div className="empty">Ни у кого нет схемы оплаты на этот месяц</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th style={{ width: 190 }}>Схема</th>
                  <th style={{ width: 80 }}>Смен</th>
                  <th style={{ width: 80 }}>Точек</th>
                  <th style={{ width: 90 }}>Метры</th>
                  <th style={{ width: 130 }}>Исходно, ₽</th>
                  <th style={{ width: 130 }}>Корректировки, ₽</th>
                  <th style={{ width: 140 }}>Итог до округл., ₽</th>
                  <th style={{ width: 130 }}>К начислению, ₽</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map(r => (
                  <tr key={r.employee_id}>
                    <td>{r.employee_name}</td>
                    <td>{r.scheme ? PAY_SCHEME_LABELS[r.scheme] : '—'}</td>
                    <td>{r.shifts}</td>
                    <td>{r.points}</td>
                    <td>{Number(r.meters).toLocaleString('ru', { maximumFractionDigits: 2 })}</td>
                    <td>{Number(r.auto_amount).toLocaleString('ru', { maximumFractionDigits: 2 })}</td>
                    <td style={{ color: Number(r.corrections) !== 0 ? '#d35400' : undefined }}>
                      {Number(r.corrections) !== 0
                        ? Number(r.corrections).toLocaleString('ru', { maximumFractionDigits: 2 })
                        : '—'}
                    </td>
                    <td>{Number(r.before_rounding).toLocaleString('ru', { maximumFractionDigits: 2 })}</td>
                    <td style={{ fontWeight: 700 }}>{Number(r.rounded).toLocaleString('ru')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRule && (
        <ShareRuleModal
          yearMonth={yearMonth}
          employees={employees}
          onClose={() => setShowRule(false)}
          onSaved={async () => { setShowRule(false); await onChanged(); showToast('Правило сохранено', 'success') }}
        />
      )}
    </>
  )
}

/** Правило распределения долей за ковёр на месяц: поровну или проценты. */
function ShareRuleModal({ yearMonth, employees, onClose, onSaved }: {
  yearMonth: string
  employees: Employee[]
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [mode, setMode] = useState<'EQUAL' | 'PERCENT'>('EQUAL')
  const [members, setMembers] = useState<{ employee_id: number; percent: number }[]>([])

  useEffect(() => {
    getShareRule(yearMonth).then(r => {
      setMode(r.mode)
      setMembers(r.members.map(m => ({ employee_id: m.employee_id, percent: Number(m.percent) })))
    }).catch(() => {})
  }, [yearMonth])

  const total = members.reduce((a, m) => a + Number(m.percent || 0), 0)

  const save = async () => {
    try {
      await saveShareRule({ year_month: yearMonth, mode, members })
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      showToast(msg ?? 'Не удалось сохранить правило', 'error')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>Правило долей за ковёр</h2>
        <p style={{ color: 'var(--c-text-secondary)', marginTop: 0 }}>
          По умолчанию стоимость ковра делится поровну между теми, кто над ним работал.
          Проценты применяются, только если состав бригады совпал с заданным, а сумма равна 100.
        </p>
        <div className="form-group">
          <label>Режим</label>
          <select value={mode} onChange={e => setMode(e.target.value as 'EQUAL' | 'PERCENT')}>
            <option value="EQUAL">Поровну между участниками</option>
            <option value="PERCENT">Заданные проценты</option>
          </select>
        </div>
        {mode === 'PERCENT' && (
          <>
            {members.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <select
                  value={m.employee_id}
                  onChange={e => setMembers(list => list.map((x, j) =>
                    j === i ? { ...x, employee_id: Number(e.target.value) } : x))}
                  style={{ flex: 1 }}
                >
                  <option value={0}>— сотрудник —</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
                <input
                  type="number" step="0.01" style={{ width: 110 }}
                  value={m.percent}
                  onChange={e => setMembers(list => list.map((x, j) =>
                    j === i ? { ...x, percent: Number(e.target.value) } : x))}
                />
                <button className="btn-danger btn-sm" onClick={() => setMembers(list => list.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button
              className="btn-secondary btn-sm"
              onClick={() => setMembers(list => [...list, { employee_id: 0, percent: 0 }])}
            >+ Участник</button>
            <div style={{ marginTop: 8, color: total === 100 ? '#27ae60' : '#c0392b' }}>
              Сумма процентов: {total}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={save} disabled={mode === 'PERCENT' && total !== 100}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

function EntriesTab({ yearMonth, onChanged }: { yearMonth: string; onChanged: () => Promise<void> }) {
  const { showToast } = useToast()
  const [entries, setEntries] = useState<PayrollEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<{ title: string; message: string; action: () => void } | null>(null)

  const load = async () => {
    setLoading(true)
    try { setEntries(await getPayrollEntries(yearMonth)) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [yearMonth])

  const correct = async (e: PayrollEntry) => {
    const raw = prompt(`Новая сумма для «${e.details ?? e.kind}» (сейчас ${e.amount} ₽):`, String(e.amount))
    if (raw == null) return
    const reason = prompt('Причина корректировки:')?.trim()
    if (!reason) { showToast('Без причины корректировка не сохраняется', 'warning'); return }
    try {
      await correctPayrollEntry(e.id, Number(raw), reason)
      await load(); await onChanged()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      showToast(msg ?? 'Не удалось сохранить корректировку', 'error')
    }
  }

  if (loading) return <div className="loading">Загрузка…</div>

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Начисления за {yearMonth}</h2>
      <div style={{ color: 'var(--c-text-secondary)', fontSize: 'var(--font-sm)', marginBottom: 10 }}>
        Каждая строка — отдельная работа: ковёр, смена или точки дня. Исправленные строки
        помечены; рядом видно, что посчитала автоматика.
      </div>
      {entries.length === 0 ? (
        <div className="empty">Начислений нет — пересчитайте месяц</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Дата</th>
                <th>Сотрудник</th>
                <th style={{ width: 120 }}>Вид</th>
                <th>Основание</th>
                <th style={{ width: 120 }}>Сумма, ₽</th>
                <th style={{ width: 130 }}>Автоматически</th>
                <th style={{ width: 140 }}>Правка</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ background: e.corrected_at ? '#fef9e7' : undefined }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.entry_date).toLocaleDateString('ru')}</td>
                  <td>{e.employee_name}</td>
                  <td>{kindLabel(e.kind)}</td>
                  <td>{e.details || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{Number(e.amount).toLocaleString('ru', { maximumFractionDigits: 2 })}</td>
                  <td style={{ color: 'var(--c-text-secondary)' }}>
                    {e.auto_amount == null ? '—' : Number(e.auto_amount).toLocaleString('ru', { maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)' }}>
                    {e.corrected_at ? `${e.corrected_by}: ${e.correction_reason}` : '—'}
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn-secondary btn-sm" title="Исправить сумму" onClick={() => void correct(e)}>✏️</button>
                      {e.corrected_at && (
                        <button
                          className="btn-secondary btn-sm"
                          title="Вернуть автоматический расчёт"
                          onClick={async () => { await resetPayrollEntry(e.id); await load(); await onChanged() }}
                        >↺</button>
                      )}
                      {e.source_type === 'MANUAL' && (
                        <button
                          className="btn-danger btn-sm"
                          title="Удалить ручное начисление"
                          onClick={() => setConfirm({
                            title: 'Удалить начисление',
                            message: `${e.details} — ${e.amount} ₽`,
                            action: async () => { await deletePayrollEntry(e.id); await load(); await onChanged() },
                          })}
                        >✕</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirm && (
        <ConfirmModal
          title={confirm.title} message={confirm.message} danger
          onConfirm={() => { const a = confirm.action; setConfirm(null); a() }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'PIECEWORK': return 'Сделка'
    case 'SALARY': return 'Оклад'
    case 'SHIFT': return 'Смена'
    case 'POINTS': return 'Точки'
    case 'MANUAL': return 'Вручную'
    default: return kind
  }
}

function SchemesTab({ employees }: { employees: Employee[] }) {
  const { showToast } = useToast()
  const [schemes, setSchemes] = useState<PayScheme[]>([])
  const [form, setForm] = useState({
    employee_id: '', scheme: 'PIECEWORK' as PaySchemeKind, valid_from: new Date().toLocaleDateString('sv-SE'),
    rate_per_sqm: '', salary: '', point_rate: '', shift_hours: '', shift_fix: '', points_included: '', extra_point_rate: '',
  })

  const load = () => getPaySchemes().then(setSchemes).catch(() => setSchemes([]))
  useEffect(() => { void load() }, [])

  const create = async () => {
    if (!form.employee_id) { showToast('Выберите сотрудника', 'warning'); return }
    try {
      await createPayScheme({
        employee_id: Number(form.employee_id),
        scheme: form.scheme,
        valid_from: form.valid_from,
        rate_per_sqm: form.rate_per_sqm ? Number(form.rate_per_sqm) : null,
        salary: form.salary ? Number(form.salary) : null,
        point_rate: form.point_rate ? Number(form.point_rate) : null,
        shift_hours: form.shift_hours ? Number(form.shift_hours) : null,
        shift_fix: form.shift_fix ? Number(form.shift_fix) : null,
        points_included: form.points_included ? Number(form.points_included) : null,
        extra_point_rate: form.extra_point_rate ? Number(form.extra_point_rate) : null,
      })
      await load()
      showToast('Схема назначена', 'success')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      showToast(msg ?? 'Не удалось назначить схему', 'error')
    }
  }

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Назначить схему</h2>
        <div style={{ color: 'var(--c-text-secondary)', fontSize: 'var(--font-sm)', marginBottom: 10 }}>
          В один момент у сотрудника действует одна схема: предыдущая закроется днём раньше начала новой.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ width: 220, marginBottom: 0 }}>
            <label>Сотрудник</label>
            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">— выберите —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ width: 230, marginBottom: 0 }}>
            <label>Схема</label>
            <select value={form.scheme} onChange={e => setForm(f => ({ ...f, scheme: e.target.value as PaySchemeKind }))}>
              {Object.entries(PAY_SCHEME_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ width: 160, marginBottom: 0 }}>
            <label>Действует с</label>
            <input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} />
          </div>
          {form.scheme === 'PIECEWORK' && (
            <Field label="Тариф, ₽/м²" value={form.rate_per_sqm} onChange={v => setForm(f => ({ ...f, rate_per_sqm: v }))} />
          )}
          {form.scheme === 'SALARY' && (
            <Field label="Оклад, ₽" value={form.salary} onChange={v => setForm(f => ({ ...f, salary: v }))} />
          )}
          {form.scheme === 'DRIVER_POINTS' && (
            <Field label="₽ за точку" value={form.point_rate} onChange={v => setForm(f => ({ ...f, point_rate: v }))} />
          )}
          {form.scheme === 'DRIVER_SHIFT' && (
            <>
              <Field label="Часов в смене" value={form.shift_hours} onChange={v => setForm(f => ({ ...f, shift_hours: v }))} />
              <Field label="Оплата смены, ₽" value={form.shift_fix} onChange={v => setForm(f => ({ ...f, shift_fix: v }))} />
              <Field label="Точек включено" value={form.points_included} onChange={v => setForm(f => ({ ...f, points_included: v }))} />
              <Field label="₽ сверх порога" value={form.extra_point_rate} onChange={v => setForm(f => ({ ...f, extra_point_rate: v }))} />
            </>
          )}
          <button className="btn-primary" onClick={create}>Назначить</button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>История схем</h2>
        {schemes.length === 0 ? (
          <div className="empty">Схемы не назначены</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th style={{ width: 200 }}>Схема</th>
                <th style={{ width: 120 }}>С</th>
                <th style={{ width: 120 }}>По</th>
                <th>Параметры</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {schemes.map(s => (
                <tr key={s.id} style={{ opacity: s.valid_to ? 0.6 : 1 }}>
                  <td>{s.employee_name}</td>
                  <td>{PAY_SCHEME_LABELS[s.scheme]}</td>
                  <td>{new Date(s.valid_from).toLocaleDateString('ru')}</td>
                  <td>{s.valid_to ? new Date(s.valid_to).toLocaleDateString('ru') : 'действует'}</td>
                  <td style={{ fontSize: 'var(--font-sm)' }}>{schemeParams(s)}</td>
                  <td>
                    <button
                      className="btn-danger btn-sm"
                      title="Удалить запись истории"
                      onClick={async () => { await deletePayScheme(s.id); await load() }}
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function schemeParams(s: PayScheme): string {
  switch (s.scheme) {
    case 'PIECEWORK': return `${s.rate_per_sqm} ₽/м²`
    case 'SALARY': return `${s.salary} ₽ в месяц`
    case 'DRIVER_POINTS': return `${s.point_rate} ₽ за точку`
    case 'DRIVER_SHIFT':
      return `смена ${s.shift_fix} ₽`
        + (s.shift_hours ? `, ${s.shift_hours} ч` : '')
        + (s.points_included ? `, включено ${s.points_included} точек` : '')
        + (s.extra_point_rate ? `, сверх — ${s.extra_point_rate} ₽` : '')
    default: return ''
  }
}

function ShiftsTab({ yearMonth, employees }: { yearMonth: string; employees: Employee[] }) {
  const { showToast } = useToast()
  const [shifts, setShifts] = useState<WorkShift[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(new Date().toLocaleDateString('sv-SE'))
  const [reason, setReason] = useState('')

  const load = () => getShifts(yearMonth).then(setShifts).catch(() => setShifts([]))
  useEffect(() => { void load() }, [yearMonth])

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ width: 220, marginBottom: 0 }}>
          <label>Сотрудник</label>
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">— выберите —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ width: 160, marginBottom: 0 }}>
          <label>Дата</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
          <label>Основание</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Работал, но ковров нет" />
        </div>
        <button
          className="btn-primary"
          onClick={async () => {
            if (!employeeId) { showToast('Выберите сотрудника', 'warning'); return }
            await addShift(Number(employeeId), date, reason || 'добавлено вручную')
            setReason(''); await load()
          }}
        >Добавить смену</button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Табель за {yearMonth}</h2>
        {shifts.length === 0 ? <div className="empty">Смен нет</div> : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Дата</th>
                <th>Сотрудник</th>
                <th style={{ width: 120 }}>Источник</th>
                <th>Основание</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => (
                <tr key={s.id}>
                  <td>{new Date(s.shift_date).toLocaleDateString('ru')}</td>
                  <td>{s.employee_name}</td>
                  <td>{s.source === 'AUTO' ? 'автоматически' : 'вручную'}</td>
                  <td style={{ color: 'var(--c-text-secondary)' }}>{s.reason || '—'}</td>
                  <td>
                    <button className="btn-danger btn-sm" onClick={async () => { await deleteShift(s.id); await load() }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

function PointsTab({ yearMonth }: { yearMonth: string }) {
  const [points, setPoints] = useState<DriverPoint[]>([])
  useEffect(() => { getDriverPoints(yearMonth).then(setPoints).catch(() => setPoints([])) }, [yearMonth])

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Точки водителей за {yearMonth}</h2>
      <div style={{ color: 'var(--c-text-secondary)', fontSize: 'var(--font-sm)', marginBottom: 10 }}>
        Один забор или один отвоз — одна точка. Перенос дня и смена водителя обновляют точку,
        а снятие даты её убирает.
      </div>
      {points.length === 0 ? <div className="empty">Точек нет</div> : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 120 }}>Дата</th>
              <th>Водитель</th>
              <th style={{ width: 120 }}>Этап</th>
              <th style={{ width: 120 }}>Заказ</th>
            </tr>
          </thead>
          <tbody>
            {points.map(p => (
              <tr key={p.id}>
                <td>{new Date(p.point_date).toLocaleDateString('ru')}</td>
                <td>{p.employee_name}</td>
                <td>{p.leg === 'PICKUP' ? 'Забор' : 'Отвоз'}</td>
                <td>{p.order_id ? `#${String(p.order_id).padStart(5, '0')}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="form-group" style={{ width: 150, marginBottom: 0 }}>
      <label>{label}</label>
      <input type="number" step="0.01" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '1.4em', fontWeight: 700 }}>{value}</div>
    </div>
  )
}
