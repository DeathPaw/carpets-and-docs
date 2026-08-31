import { useState } from 'react'

// Номера на карте → названия районов
const DISTRICT_NUMBERS: { num: number; name: string; x: number; y: number }[] = [
  { num: 1, name: 'Адмиралтейский', x: 54, y: 48 },
  { num: 2, name: 'Василеостровский', x: 47, y: 43 },
  { num: 3, name: 'Выборгский', x: 68, y: 22 },
  { num: 4, name: 'Калининский', x: 79, y: 26 },
  { num: 5, name: 'Кировский', x: 49, y: 55 },
  { num: 6, name: 'Колпинский', x: 82, y: 76 },
  { num: 7, name: 'Красногвардейский', x: 82, y: 38 },
  { num: 8, name: 'Красносельский', x: 38, y: 62 },
  { num: 9, name: 'Кронштадтский', x: 24, y: 37 },
  { num: 10, name: 'Курортный', x: 38, y: 16 },
  { num: 11, name: 'Московский', x: 57, y: 60 },
  { num: 12, name: 'Невский', x: 76, y: 52 },
  { num: 13, name: 'Петроградский', x: 58, y: 37 },
  { num: 14, name: 'Петродворцовый', x: 22, y: 56 },
  { num: 15, name: 'Приморский', x: 54, y: 28 },
  { num: 16, name: 'Пушкинский', x: 62, y: 80 },
  { num: 17, name: 'Фрунзенский', x: 68, y: 54 },
  { num: 18, name: 'Центральный', x: 63, y: 43 },
]

interface DistrictData { district: string; count: number; sum: number }
interface Props { data: DistrictData[]; onDistrictClick?: (district: string) => void }

function getBadgeBg(value: number, max: number): string {
  if (max === 0 || value === 0) return 'rgba(80,80,80,0.55)'
  const r = value / max
  if (r > 0.7) return 'rgba(26,95,180,0.88)'
  if (r > 0.4) return 'rgba(50,120,170,0.82)'
  if (r > 0.15) return 'rgba(90,155,200,0.75)'
  return 'rgba(130,175,210,0.7)'
}

export default function SpbDistrictMap({ data, onDistrictClick }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const dataMap = new Map(data.map(d => [d.district, d]))

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Карта */}
      <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 420 }}>
        <img
          src="/spb-districts.png"
          alt="Районы Санкт-Петербурга"
          style={{ width: '100%', display: 'block', borderRadius: 6 }}
          draggable={false}
        />
        {/* Кликабельные зоны с бейджами */}
        {DISTRICT_NUMBERS.map(d => {
          const dd = dataMap.get(d.name)
          const count = dd?.count || 0
          const isH = hovered === d.name
          return (
            <div
              key={d.name}
              style={{
                position: 'absolute',
                left: `${d.x}%`,
                top: `${d.y}%`,
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
                zIndex: isH ? 20 : 2,
              }}
              onMouseEnter={() => setHovered(d.name)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onDistrictClick?.(d.name)}
            >
              <div style={{
                display: 'inline-block',
                background: getBadgeBg(count, maxCount),
                color: '#fff',
                borderRadius: 4,
                padding: isH ? '3px 7px' : '1px 5px',
                fontSize: isH ? '0.75em' : '0.65em',
                fontWeight: 700,
                boxShadow: isH ? '0 2px 8px rgba(0,0,0,0.35)' : '0 1px 2px rgba(0,0,0,0.2)',
                transition: 'all 0.15s',
                transform: isH ? 'scale(1.3)' : 'scale(1)',
              }}>
                {count > 0 ? count : '–'}
              </div>
              {isH && (
                <div style={{
                  position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                  marginTop: 4, background: '#1e293b', color: '#fff', padding: '5px 9px',
                  borderRadius: 5, fontSize: 'var(--font-sm)', whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}>
                  <strong>{d.name}</strong>
                  {dd && dd.sum > 0 && <><br />{dd.sum.toLocaleString('ru')} ₽</>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Легенда — расшифровка номеров */}
      <div style={{ flex: '0 0 200px', fontSize: 'var(--font-sm)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 6px', borderBottom: '1px solid #ddd', fontSize: 'var(--font-sm)' }}>№</th>
              <th style={{ textAlign: 'left', padding: '3px 6px', borderBottom: '1px solid #ddd', fontSize: 'var(--font-sm)' }}>Район</th>
              <th style={{ textAlign: 'right', padding: '3px 6px', borderBottom: '1px solid #ddd', fontSize: 'var(--font-sm)' }}>Заказов</th>
            </tr>
          </thead>
          <tbody>
            {DISTRICT_NUMBERS.map(d => {
              const dd = dataMap.get(d.name)
              const count = dd?.count || 0
              const isH = hovered === d.name
              return (
                <tr
                  key={d.num}
                  style={{
                    background: isH ? '#ebf5fb' : undefined,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={() => setHovered(d.name)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onDistrictClick?.(d.name)}
                >
                  <td style={{ padding: '2px 6px', fontWeight: 700, color: '#555' }}>{d.num}</td>
                  <td style={{ padding: '2px 6px', color: '#333' }}>{d.name}</td>
                  <td style={{ padding: '2px 6px', textAlign: 'right', fontWeight: 600, color: count > 0 ? '#1a5fb4' : '#aaa' }}>{count || '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
