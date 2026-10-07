import { useEffect, useState } from 'react'
import { getCostPerMeter, type MonthCost } from '../../api/costs'

/**
 * Себестоимость на метр по месяцам (ТЗ v2, блок 2).
 *
 * Удельный расход месяца = отнесённая на месяц сумма / обработанные м².
 * Если метров в месяце не было, сумма не делится и не переносится молча
 * дальше — она показывается как нераспределённая, чтобы её было видно.
 */
export default function CostPerMeterReport() {
  const [rows, setRows] = useState<MonthCost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCostPerMeter()
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  const totalAllocated = rows.reduce((a, r) => a + Number(r.allocated || 0), 0)
  const totalUnallocated = rows.reduce((a, r) => a + Number(r.unallocated || 0), 0)
  const totalMeters = rows.reduce((a, r) => a + Number(r.meters || 0), 0)

  if (loading) return <div className="loading">Загрузка…</div>

  return (
    <div>
      <div className="card" style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <Stat label="Обработано, м²" value={totalMeters.toLocaleString('ru', { maximumFractionDigits: 2 })} />
        <Stat label="Затрат отнесено, ₽" value={Math.round(totalAllocated).toLocaleString('ru')} />
        <Stat
          label="Не распределено, ₽"
          value={Math.round(totalUnallocated).toLocaleString('ru')}
          hint="Суммы месяцев, в которых не было обработанных метров"
          danger={totalUnallocated > 0}
        />
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Затраты на метр по месяцам</h2>
        <div style={{ color: 'var(--c-text-secondary)', fontSize: 'var(--font-sm)', marginBottom: 10 }}>
          База — обработанные м² по дате завершения работы над ковром. Прямые расходы на заказ
          в эту базу не входят: они целиком ложатся на свой заказ.
        </div>
        {rows.length === 0 ? (
          <div className="empty">Данных пока нет</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 140 }}>Месяц</th>
                <th style={{ width: 150 }}>Обработано, м²</th>
                <th style={{ width: 170 }}>Отнесено затрат, ₽</th>
                <th style={{ width: 150 }}>₽ на метр</th>
                <th>Не распределено, ₽</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.month}>
                  <td>{monthLabel(r.month)}</td>
                  <td>{Number(r.meters).toLocaleString('ru', { maximumFractionDigits: 2 })}</td>
                  <td>{Number(r.allocated).toLocaleString('ru', { maximumFractionDigits: 2 })}</td>
                  <td style={{ fontWeight: 600 }}>
                    {Number(r.per_meter) > 0
                      ? Number(r.per_meter).toLocaleString('ru', { maximumFractionDigits: 2 })
                      : '—'}
                  </td>
                  <td style={{ color: Number(r.unallocated) > 0 ? '#c0392b' : undefined }}>
                    {Number(r.unallocated) > 0
                      ? Number(r.unallocated).toLocaleString('ru', { maximumFractionDigits: 2 })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/** «2026-09» → «сентябрь 2026». */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return new Date(y, m - 1, 1).toLocaleDateString('ru', { month: 'long', year: 'numeric' })
}

function Stat({ label, value, hint, danger }: {
  label: string; value: string; hint?: string; danger?: boolean
}) {
  return (
    <div title={hint}>
      <div style={{ fontSize: 'var(--font-sm)', color: 'var(--c-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '1.4em', fontWeight: 700, color: danger ? '#c0392b' : undefined }}>{value}</div>
    </div>
  )
}
