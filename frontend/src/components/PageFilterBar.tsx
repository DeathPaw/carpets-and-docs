import type { ReactNode } from 'react'
import MultiSelectFilter from './MultiSelectFilter'

/**
 * Ширины трёх контролов центральной группы фильтров.
 *
 * Вынесены в константу, потому что их использует не только PageFilterBar:
 * у «Закупок» свой набор фильтров (месяц / № закупки / поиск), но геометрия
 * обязана совпадать до пикселя — иначе группа «прыгает» по ширине при
 * переходе между разделами, ровно то, от чего мы уходили центровкой.
 */
export const FILTER_WIDTHS = { first: 180, second: 120, third: 300 } as const

/** Отступ от левого края контента до центра группы: (1400 − 48) / 2. */
export const FILTER_CENTER = 'min(50%, 676px)'

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
        <div className="page-filters" style={{
          position: 'absolute', left: FILTER_CENTER, transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <MultiSelectFilter
            options={districts.map(d => ({ value: d, label: d }))}
            searchable
            value={districtValue}
            onChange={onDistrictChange}
            placeholder="Район: все"
            width={FILTER_WIDTHS.first}
          />
          <input
            type="number"
            value={orderNo}
            onChange={e => onOrderNoChange(e.target.value)}
            placeholder="№ заказа"
            style={{ width: FILTER_WIDTHS.second }}
            title="Фильтр по номеру заказа"
          />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Имя клиента / телефон / legacy ID"
            style={{ width: FILTER_WIDTHS.third }}
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

/**
 * Стиль главной кнопки страницы — «+ Новый заказ», «+ Новый клиент»,
 * «+ Новая заявка». Фиксированная ширина, чтобы кнопка стояла на одном месте
 * и одинаково выглядела во всех разделах.
 */
export const pageActionBtn: React.CSSProperties = {
  width: 170, textAlign: 'center', whiteSpace: 'nowrap',
}
