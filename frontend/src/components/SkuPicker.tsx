import { useEffect, useMemo, useState } from 'react'
import { getMatchingSkus, getSkuGroups } from '../api/sku'
import { useEscapeClose } from '../hooks/useEscapeClose'
import type { OrderItem, SkuGroup, SkuMatchResult } from '../types'

const PRICING_LABEL: Record<string, string> = {
  FIXED: 'Фикс.',
  BY_WEIGHT: 'По весу',
  BY_AREA: 'По площ.',
  BY_PERIMETER: 'По перим.',
  BY_LENGTH: 'По длине',
  BY_WIDTH: 'По ширине',
  BY_RUNNING_METERS: 'По пог. метру',
}

/**
 * V10: модалка выбора SKU для добавления в позицию заказа.
 *
 * <p>Использует {@code GET /api/skus/matching} — бэк отдаёт ВСЕ SKU (опционально
 * фильтрованные по группе) + флаг {@code matches=true} для тех, чьи атрибуты-диапазоны
 * подходят под параметры позиции. На UI «подходит» подсвечивается зелёной точкой и
 * выводится в первую колонку — оператор сразу видит, что бэк предлагает.
 *
 * <p>Можно выбрать любой SKU, даже не подходящий — бэк не блокирует. Это нужно
 * на случаи нестандартных позиций (например, ковёр без замера веса).
 */
export default function SkuPicker({
  item, excludeSkuIds, onSelect, onClose,
}: {
  item: OrderItem
  /** Уже выбранные SKU для этой позиции — их скроем (дубли запрещены). */
  excludeSkuIds: Set<number>
  onSelect: (skuId: number) => void
  onClose: () => void
}) {
  const [groups, setGroups] = useState<SkuGroup[]>([])
  const [groupId, setGroupId] = useState<number | ''>('')
  const [skus, setSkus] = useState<SkuMatchResult[]>([])
  const [search, setSearch] = useState('')
  const [onlyMatching, setOnlyMatching] = useState(true)
  const [loading, setLoading] = useState(true)
  useEscapeClose(true, onClose)

  useEffect(() => {
    void getSkuGroups().then(setGroups).catch(() => setGroups([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    getMatchingSkus({
      groupId: groupId === '' ? undefined : groupId,
      itemTypeId: item.item_type_id,
      weight: item.weight,
      area: item.area,
      perimeter: (item as any).perimeter ?? null,
      length: item.length,
      width: item.width,
      runningMeters: item.running_meters,
    })
      .then(setSkus)
      .catch(() => setSkus([]))
      .finally(() => setLoading(false))
  }, [groupId, item])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return skus
      .filter(r => !excludeSkuIds.has(r.sku.id))
      .filter(r => !onlyMatching || r.matches)
      .filter(r => q === '' || r.sku.name.toLowerCase().includes(q))
  }, [skus, excludeSkuIds, onlyMatching, search])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720, width: '92%' }}>
        <h3>Выбор услуги (SKU)</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            Группа:
            <select value={groupId} onChange={e => setGroupId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Все</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            style={{ flex: '1 1 200px' }}
          />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyMatching} onChange={e => setOnlyMatching(e.target.checked)} />
            Только подходящие
          </label>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto', border: '1px solid #ecf0f1', borderRadius: 4 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Загрузка…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
              {onlyMatching ? 'Нет SKU, подходящих по параметрам позиции. Снимите галку «Только подходящие», чтобы увидеть остальные.' : 'Каталог пуст'}
            </div>
          ) : (
            <table style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 20 }}></th>
                  <th>Название</th>
                  <th style={{ width: 90 }}>Группа</th>
                  <th style={{ width: 110 }}>Тип расчёта</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Цена</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.sku.id} style={r.matches ? { background: '#eafaf1' } : undefined}>
                    <td title={r.matches ? 'Подходит под параметры позиции' : 'Не подходит (атрибуты вне диапазона)'}>
                      {r.matches ? '✓' : ''}
                    </td>
                    <td>{r.sku.name}</td>
                    <td style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>{r.sku.group_name || '—'}</td>
                    <td style={{ fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>
                      {PRICING_LABEL[r.sku.pricing_type] || r.sku.pricing_type}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.sku.price != null ? Number(r.sku.price).toFixed(2) + ' ₽' : '—'}
                    </td>
                    <td>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => { onSelect(r.sku.id); onClose() }}
                      >+ Выбрать</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 'var(--font-sm)', color: '#7f8c8d' }}>
          Параметры позиции: тип #{item.item_type_id}
          {item.weight != null && ` · вес ${item.weight} кг`}
          {item.area != null && ` · S ${item.area} м²`}
          {(item as any).perimeter != null && ` · P ${(item as any).perimeter} м`}
          {item.length != null && ` · L ${item.length} м`}
          {item.width != null && ` · W ${item.width} м`}
          {item.running_meters != null && ` · пог. ${item.running_meters} м`}
        </div>

        <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
