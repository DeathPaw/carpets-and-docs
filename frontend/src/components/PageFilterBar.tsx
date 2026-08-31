import type { ReactNode } from 'react'
import MultiSelectFilter from './MultiSelectFilter'

/**
 * Единая шапка страницы с фильтрами — Заказы / Позиции / Производство.
 *
 * Ключевое: группа фильтров позиционируется АБСОЛЮТНО по центру ширины контента,
 * а не потоком между заголовком и кнопками. Из-за потока поля съезжали влево-вправо
 * на каждой странице (заголовки разной длины, кнопок справа разное количество), и
 * оператор искал поле заново при каждом переходе. Теперь «Район», «№ заказа» и
 * поиск стоят на одном и том же месте экрана везде.
 *
 * Заголовок слева, кнопки страницы справа, фильтры строго по центру.
 * Дополнительные фильтры конкретной страницы — отдельной строкой ниже (`extra`).
 */
export default function PageFilterBar({
  title,
  districts, districtValue, onDistrictChange,
  orderNo, onOrderNoChange,
  search, onSearchChange,
  right, extra,
}: {
  title: string
  /** Справочник районов (имена). */
  districts: string[]
  districtValue: string[]
  onDistrictChange: (v: string[]) => void
  orderNo: string
  onOrderNoChange: (v: string) => void
  search: string
  onSearchChange: (v: string) => void
  /** Кнопки/переключатели страницы — справа. */
  right?: ReactNode
  /** Фильтры, специфичные для страницы — строкой ниже. */
  extra?: ReactNode
}) {
  return (
    <div>
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, minHeight: 46, marginBottom: 16,
      }}>
        <h1 style={{ margin: 0 }}>{title}</h1>

        {/* Фиксированная позиция фильтров, одинаковая на всех страницах.
            Просто «50%» не годится: у Логистики .main-content шире остальных
            (1500px против 1400px, см. index.css), и центр уезжал вправо на 50px.
            Поэтому центруем по ОБЩЕЙ ширине контента — 1400px минус паддинги
            24px с каждой стороны, половина = 676px. На узких экранах, где контент
            меньше, min() отдаёт обычные 50% и группа центруется по факту.

            transform создаёт свой контекст наложения, поэтому z-index задаём
            явно: иначе раскрытые списки фильтров смешивались с таблицей под ними. */}
        <div style={{
          position: 'absolute', left: 'min(50%, 676px)', transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <MultiSelectFilter
            options={districts.map(d => ({ value: d, label: d }))}
            searchable
            value={districtValue}
            onChange={onDistrictChange}
            placeholder="Район: все"
            width={180}
          />
          <input
            type="number"
            value={orderNo}
            onChange={e => onOrderNoChange(e.target.value)}
            placeholder="№ заказа"
            style={{ width: 120 }}
            title="Фильтр по номеру заказа"
          />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Имя клиента / телефон / legacy ID"
            style={{ width: 300 }}
            title="Частичное совпадение по имени клиента, телефону или legacy ID"
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          {right}
        </div>
      </div>
      {extra}
    </div>
  )
}
