import { useEffect, useMemo, useState } from 'react'
import {
  getItemTypes, createItemType, updateItemType, deleteItemType,
  getPriceModifiers, createPriceModifier, updatePriceModifier, deletePriceModifier,
} from '../api/references'
import {
  getSkus, createSku, updateSku, deleteSku, getSkuHistory,
  getSkuGroups, createSkuGroup, updateSkuGroup, deleteSkuGroup,
  getAttributeDefinitions, createAttributeDefinition, deleteAttributeDefinition,
} from '../api/sku'
import type { SkuRequest, SkuVersion } from '../api/sku'
import { getDistricts, createDistrict, updateDistrict, deleteDistrict } from '../api/districts'
import { invalidateDistrictCache } from '../components/DistrictSelect'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import type {
  ItemType, PriceModifier, District,
  Sku, SkuGroup, AttributeDefinition, SkuPricingType,
} from '../types'

/**
 * V10: Справочники.
 *
 * <p>Раньше прайс-лист был 2D-таблицей (тип позиции × шаблон услуги). Теперь это плоский
 * каталог SKU: каждая «учётная единица» (например, «Стирка ковёр шерсть 5–10 кг»)
 * — отдельная запись с EAV-атрибутами (тип позиции, материал, диапазон веса и т.д.).
 *
 * <p>Поиск подходящего SKU для позиции выполняется через атрибуты — см.
 * {@code GET /api/skus/matching} (используется в форме заказа, не здесь).
 */

const PRICING_LABEL: Record<SkuPricingType, string> = {
  FIXED: 'Фикс.',
  BY_WEIGHT: 'По весу',
  BY_AREA: 'По площ.',
  BY_PERIMETER: 'По перим.',
  BY_LENGTH: 'По длине',
  BY_WIDTH: 'По ширине',
  BY_RUNNING_METERS: 'По пог. метру',
}

const PRICING_OPTIONS: { value: SkuPricingType; label: string }[] = [
  { value: 'FIXED', label: 'Фиксированная' },
  { value: 'BY_WEIGHT', label: 'По весу' },
  { value: 'BY_AREA', label: 'По площади' },
  { value: 'BY_PERIMETER', label: 'По периметру' },
  { value: 'BY_LENGTH', label: 'По длине' },
  { value: 'BY_WIDTH', label: 'По ширине' },
  { value: 'BY_RUNNING_METERS', label: 'По пог. метру' },
]

export default function ReferencesPage() {
  const { showToast } = useToast()
  const [confirmAction, setConfirmAction] = useState<{title: string, message: string, action: () => void, danger?: boolean} | null>(null)

  // --- Данные ---
  const [types, setTypes] = useState<ItemType[]>([])
  const [skus, setSkus] = useState<Sku[]>([])
  const [groups, setGroups] = useState<SkuGroup[]>([])
  const [attrs, setAttrs] = useState<AttributeDefinition[]>([])
  const [modifiers, setModifiers] = useState<PriceModifier[]>([])
  const [districts, setDistricts] = useState<District[]>([])

  const load = async () => {
    const [ts, sks, gs, ads, mods, dists] = await Promise.all([
      getItemTypes(), getSkus(), getSkuGroups(), getAttributeDefinitions(),
      getPriceModifiers(), getDistricts(false),
    ])
    setTypes(ts)
    setSkus(sks)
    setGroups(gs)
    setAttrs(ads)
    setModifiers(mods)
    setDistricts(dists)
  }
  useEffect(() => { void load() }, [])

  return (
    <div>
      <h1>Справочники</h1>

      <ItemTypesCard types={types} reload={load} setConfirm={setConfirmAction} showToast={showToast} />
      <SkuGroupsCard groups={groups} reload={load} setConfirm={setConfirmAction} showToast={showToast} />
      <AttributeDefinitionsCard attrs={attrs} reload={load} setConfirm={setConfirmAction} showToast={showToast} />
      <SkuCatalogCard
        skus={skus} groups={groups} attrs={attrs} types={types}
        reload={load} setConfirm={setConfirmAction} showToast={showToast}
      />
      <PriceModifiersCard modifiers={modifiers} reload={load} setConfirm={setConfirmAction} showToast={showToast} />
      <DistrictsCard districts={districts} reload={load} setConfirm={setConfirmAction} showToast={showToast} />

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          danger={confirmAction.danger}
          onConfirm={() => { setConfirmAction(null); confirmAction.action() }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}

type CardProps<T> = {
  reload: () => Promise<void>
  setConfirm: (c: {title: string, message: string, action: () => void, danger?: boolean}) => void
  showToast: (msg: string, kind?: 'success' | 'error' | 'warning') => void
} & T

// ============================================================================
// Типы позиций — теперь просто справочник имён. Авто-добавление вынесено в SKU.
// ============================================================================
function ItemTypesCard({ types, reload, setConfirm, showToast }: CardProps<{ types: ItemType[] }>) {
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [err, setErr] = useState('')

  const create = async () => {
    if (!newName.trim()) { setErr('Введите название'); return }
    try {
      await createItemType({ name: newName.trim() })
      setNewName(''); setErr(''); await reload()
    } catch { setErr('Ошибка создания') }
  }
  const save = async (id: number) => {
    if (!editName.trim()) return
    try {
      await updateItemType(id, { name: editName.trim() })
      setEditId(null); await reload()
    } catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка сохранения', 'error') }
  }
  const remove = (id: number) => setConfirm({
    title: 'Удалить тип позиции', message: 'Удалить тип позиции?', danger: true,
    action: async () => {
      try { await deleteItemType(id); await reload() }
      catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка удаления', 'error') }
    },
  })

  return (
    <div className="card">
      <h2>Типы позиций</h2>
      <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 8 }}>
        Категория вещи клиента (ковёр, тюль, плед…). Используется как один из атрибутов SKU.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название типа" style={{ flex: '1 1 200px' }} />
        <button className="btn-primary" onClick={create} style={{ whiteSpace: 'nowrap' }}>+ Добавить</button>
      </div>
      {err && <div className="error-msg" style={{ marginBottom: 8 }}>{err}</div>}
      <table>
        <thead><tr><th>#</th><th>Название</th><th>Действия</th></tr></thead>
        <tbody>
          {types.length === 0 ? (
            <tr><td colSpan={3} className="empty">Нет типов</td></tr>
          ) : types.map(t => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td>
                {editId === t.id
                  ? <input value={editName} onChange={e => setEditName(e.target.value)} />
                  : t.name}
              </td>
              <td>
                <div className="actions">
                  {editId === t.id ? (
                    <>
                      <button className="btn-success btn-sm" onClick={() => void save(t.id)}>✓</button>
                      <button className="btn-secondary btn-sm" onClick={() => setEditId(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-secondary btn-sm" onClick={() => { setEditId(t.id); setEditName(t.name) }}>✏️</button>
                      <button className="btn-danger btn-sm" onClick={() => remove(t.id)}>🗑️</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Группы SKU — Чистка / Стирка / Доставка / …
// ============================================================================
function SkuGroupsCard({ groups, reload, setConfirm, showToast }: CardProps<{ groups: SkuGroup[] }>) {
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [err, setErr] = useState('')

  const create = async () => {
    if (!newName.trim()) { setErr('Введите название'); return }
    try {
      const maxSort = groups.reduce((m, g) => Math.max(m, g.sort_order), 0)
      await createSkuGroup({ name: newName.trim(), sort_order: maxSort + 10 })
      setNewName(''); setErr(''); await reload()
    } catch { setErr('Ошибка создания') }
  }
  const save = async (id: number) => {
    if (!editName.trim()) return
    try {
      const existing = groups.find(g => g.id === id)
      await updateSkuGroup(id, { name: editName.trim(), sort_order: existing?.sort_order ?? 0 })
      setEditId(null); await reload()
    } catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка сохранения', 'error') }
  }
  const remove = (id: number) => setConfirm({
    title: 'Удалить группу SKU', message: 'Удалить группу?', danger: true,
    action: async () => {
      try { await deleteSkuGroup(id); await reload() }
      catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка удаления (есть SKU в группе?)', 'error') }
    },
  })

  return (
    <div className="card">
      <h2>Группы SKU</h2>
      <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 8 }}>
        Логические группы каталога — Чистка, Стирка, Доставка и т.п. Удобно для группировки в интерфейсе.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название группы" style={{ flex: '1 1 200px' }} />
        <button className="btn-primary" onClick={create} style={{ whiteSpace: 'nowrap' }}>+ Добавить</button>
      </div>
      {err && <div className="error-msg" style={{ marginBottom: 8 }}>{err}</div>}
      <table>
        <thead><tr><th>#</th><th>Название</th><th>Действия</th></tr></thead>
        <tbody>
          {groups.length === 0 ? (
            <tr><td colSpan={3} className="empty">Нет групп</td></tr>
          ) : groups.map(g => (
            <tr key={g.id}>
              <td>{g.id}</td>
              <td>
                {editId === g.id
                  ? <input value={editName} onChange={e => setEditName(e.target.value)} />
                  : g.name}
              </td>
              <td>
                <div className="actions">
                  {editId === g.id ? (
                    <>
                      <button className="btn-success btn-sm" onClick={() => void save(g.id)}>✓</button>
                      <button className="btn-secondary btn-sm" onClick={() => setEditId(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-secondary btn-sm" onClick={() => { setEditId(g.id); setEditName(g.name) }}>✏️</button>
                      <button className="btn-danger btn-sm" onClick={() => remove(g.id)}>🗑️</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Справочник атрибутов (ключи для EAV)
// ============================================================================
function AttributeDefinitionsCard({ attrs, reload, setConfirm, showToast }: CardProps<{ attrs: AttributeDefinition[] }>) {
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [valueType, setValueType] = useState<'NUMBER' | 'STRING' | 'REFERENCE_ITEM_TYPE'>('STRING')
  const [unit, setUnit] = useState('')
  const [err, setErr] = useState('')

  const create = async () => {
    if (!key.trim() || !label.trim()) { setErr('Заполните ключ и название'); return }
    try {
      const maxSort = attrs.reduce((m, a) => Math.max(m, a.sort_order), 0)
      await createAttributeDefinition({
        key: key.trim(), label: label.trim(), value_type: valueType,
        unit: unit.trim() || null, sort_order: maxSort + 10,
      })
      setKey(''); setLabel(''); setValueType('STRING'); setUnit(''); setErr(''); await reload()
    } catch (e: unknown) { setErr((e as any)?.response?.data?.message || 'Ошибка создания') }
  }
  const remove = (k: string) => setConfirm({
    title: 'Удалить атрибут', message: `Удалить атрибут «${k}»? У всех SKU значения этого атрибута будут потеряны.`, danger: true,
    action: async () => {
      try { await deleteAttributeDefinition(k); await reload() }
      catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка удаления', 'error') }
    },
  })

  return (
    <div className="card">
      <h2>Атрибуты SKU</h2>
      <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 8 }}>
        Ключи EAV-атрибутов SKU. Примеры: <code>material</code>, <code>weight_min</code>, <code>weight_max</code>,
        <code>item_type</code>. Тип значений — STRING/NUMBER/REFERENCE_ITEM_TYPE.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <input value={key} onChange={e => setKey(e.target.value)} placeholder="ключ (latin)" style={{ flex: '1 1 130px' }} />
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Лейбл (рус.)" style={{ flex: '1 1 160px' }} />
        <select value={valueType} onChange={e => setValueType(e.target.value as any)} style={{ flex: '0 0 200px' }}>
          <option value="STRING">Строка</option>
          <option value="NUMBER">Число</option>
          <option value="REFERENCE_ITEM_TYPE">Ссылка на тип позиции</option>
        </select>
        <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="ед. изм. (кг, м²…)" style={{ flex: '0 0 120px' }} />
        <button className="btn-primary" onClick={create} style={{ whiteSpace: 'nowrap' }}>+ Добавить</button>
      </div>
      {err && <div className="error-msg" style={{ marginBottom: 8 }}>{err}</div>}
      <table>
        <thead><tr><th>Ключ</th><th>Лейбл</th><th>Тип</th><th>Ед.</th><th>Действия</th></tr></thead>
        <tbody>
          {attrs.length === 0 ? (
            <tr><td colSpan={5} className="empty">Нет атрибутов</td></tr>
          ) : attrs.map(a => (
            <tr key={a.key}>
              <td><code>{a.key}</code></td>
              <td>{a.label}</td>
              <td>{a.value_type}</td>
              <td>{a.unit || '—'}</td>
              <td>
                <button className="btn-danger btn-sm" onClick={() => remove(a.key)}>🗑️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Каталог SKU — главная таблица + редактор
// ============================================================================
function SkuCatalogCard({
  skus, groups, attrs, types, reload, setConfirm, showToast,
}: CardProps<{ skus: Sku[]; groups: SkuGroup[]; attrs: AttributeDefinition[]; types: ItemType[] }>) {
  const [filterGroup, setFilterGroup] = useState<number | ''>('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const visibleSkus = useMemo(
    () => filterGroup === '' ? skus : skus.filter(s => s.group_id === filterGroup),
    [skus, filterGroup],
  )

  const remove = (id: number) => setConfirm({
    title: 'Удалить SKU', message: 'SKU будет помечен удалённым. Его нельзя будет выбрать в новых заказах, но в старых он останется.', danger: true,
    action: async () => {
      try { await deleteSku(id); await reload() }
      catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка удаления', 'error') }
    },
  })

  return (
    <div className="card">
      <h2>Каталог SKU</h2>
      <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 8 }}>
        Каждая запись — конкретная учётная единица: например, «Стирка ковёр шерсть 5–10 кг».
        Атрибуты задают, для каких позиций SKU подходит (используется в авто-подборе на форме заказа).
        История изменений каждой цены доступна через 🕒.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Группа:
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Все</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Новый SKU</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th><th>Группа</th><th>Название</th><th>Тип расчёта</th>
            <th>Цена / Себест.</th><th>Авто</th><th>Беспл. от</th><th>Атрибуты</th><th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {visibleSkus.length === 0 ? (
            <tr><td colSpan={9} className="empty">Нет SKU</td></tr>
          ) : visibleSkus.map(s => (
            <tr key={s.id} style={{ opacity: s.is_deleted ? 0.4 : 1 }}>
              <td>
                {s.id}
                <SkuHistoryButton skuId={s.id} />
              </td>
              <td>{s.group_name || '—'}</td>
              <td>
                {s.name}
                {s.is_deleted && <span style={{ marginLeft: 6, color: '#c0392b', fontSize: '0.8em' }}>(удалён)</span>}
              </td>
              <td>{PRICING_LABEL[s.pricing_type] || s.pricing_type}</td>
              <td>
                <div>{s.price != null ? Number(s.price).toFixed(2) + ' ₽' : '—'}</div>
                <div style={{ fontSize: '0.8em', color: '#888' }}>
                  себ. {s.cost_price != null ? Number(s.cost_price).toFixed(2) : '—'}
                </div>
              </td>
              <td>{s.is_auto_add ? '✓' : '—'}</td>
              <td>{s.free_threshold != null ? `${s.free_threshold} ₽` : '—'}</td>
              <td style={{ fontSize: '0.82em', color: '#555', maxWidth: 280 }}>
                {Object.entries(s.attributes).length === 0
                  ? <span style={{ color: '#aaa' }}>—</span>
                  : Object.entries(s.attributes).map(([k, vs]) => (
                      <div key={k}><strong>{k}</strong>: {vs.join(', ')}</div>
                    ))}
              </td>
              <td>
                <div className="actions">
                  <button className="btn-secondary btn-sm" onClick={() => setEditingId(s.id)}>✏️</button>
                  {!s.is_deleted && <button className="btn-danger btn-sm" onClick={() => remove(s.id)}>🗑️</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {creating && (
        <SkuEditorModal
          mode="create"
          groups={groups} attrs={attrs} types={types}
          onClose={() => setCreating(false)}
          onSaved={async () => { setCreating(false); await reload() }}
          showToast={showToast}
        />
      )}
      {editingId != null && (() => {
        const sku = skus.find(s => s.id === editingId)
        if (!sku) return null
        return (
          <SkuEditorModal
            mode="edit"
            existing={sku}
            groups={groups} attrs={attrs} types={types}
            onClose={() => setEditingId(null)}
            onSaved={async () => { setEditingId(null); await reload() }}
            showToast={showToast}
          />
        )
      })()}
    </div>
  )
}

// ----------------------------------------------------------------------------
// История версий SKU — popover «🕒»
// ----------------------------------------------------------------------------
function SkuHistoryButton({ skuId }: { skuId: number }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<SkuVersion[] | null>(null)

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    if (history === null) {
      try { setHistory(await getSkuHistory(skuId)) } catch { setHistory([]) }
    }
  }

  return (
    <>
      <button
        onClick={toggle}
        title="История изменений"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', marginLeft: 4, color: '#3498db' }}
      >🕒</button>
      {open && (
        // Раньше popover был position:absolute внутри <td>, из-за чего его обрезала
        // прокрутка таблицы. Перешли на центрированную модалку — она поверх всего,
        // прокручивается внутри себя и не ломается на узких экранах.
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>История изменений SKU #{skuId}</h3>
              <button onClick={() => setOpen(false)} className="btn-secondary btn-sm">×</button>
            </div>
            {history === null ? <div style={{ color: '#888' }}>Загрузка…</div>
              : history.length === 0 ? <div style={{ color: '#95a5a6' }}>Изменений нет</div>
              : (
                <div style={{ fontSize: 13 }}>
                  {history.map(h => (
                    <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px dashed #ecf0f1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>v{h.version_num}: {h.price == null ? '—' : Number(h.price).toFixed(2) + ' ₽'}</strong>
                        {h.cost_price != null && (<span style={{ color: '#7f8c8d' }}>себ. {Number(h.cost_price).toFixed(2)}</span>)}
                      </div>
                      <div style={{ color: '#7f8c8d' }}>{h.name} · {h.pricing_type}</div>
                      <div style={{ color: '#95a5a6', fontSize: 12 }}>
                        {new Date(h.valid_from).toLocaleString('ru')}{h.changed_by ? ' · ' + h.changed_by : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}
    </>
  )
}

// ----------------------------------------------------------------------------
// Модалка создания/редактирования SKU
// ----------------------------------------------------------------------------
function SkuEditorModal({
  mode, existing, groups, attrs, types, onClose, onSaved, showToast,
}: {
  mode: 'create' | 'edit'
  existing?: Sku
  groups: SkuGroup[]
  attrs: AttributeDefinition[]
  types: ItemType[]
  onClose: () => void
  onSaved: () => Promise<void>
  showToast: (msg: string, kind?: 'success' | 'error' | 'warning') => void
}) {
  const [groupId, setGroupId] = useState<number>(existing?.group_id ?? groups[0]?.id ?? 0)
  const [name, setName] = useState(existing?.name ?? '')
  const [pricingType, setPricingType] = useState<SkuPricingType>(existing?.pricing_type ?? 'FIXED')
  const [price, setPrice] = useState<string>(existing?.price?.toString() ?? '')
  const [costPrice, setCostPrice] = useState<string>(existing?.cost_price?.toString() ?? '')
  const [isAutoAdd, setIsAutoAdd] = useState<boolean>(existing?.is_auto_add ?? false)
  const [freeThreshold, setFreeThreshold] = useState<string>(existing?.free_threshold?.toString() ?? '')
  // V11 lifecycle
  const [autoCompleteOn, setAutoCompleteOn] = useState<string>(existing?.auto_complete_on_status ?? '')
  const [triggersStatus, setTriggersStatus] = useState<string>(existing?.triggers_order_status ?? '')
  const [excludeCalc, setExcludeCalc] = useState<boolean>(existing?.exclude_from_status_calc ?? false)
  const [attrValues, setAttrValues] = useState<Record<string, string[]>>(existing?.attributes ?? {})
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  const updateAttr = (key: string, idx: number, val: string) => {
    setAttrValues(prev => {
      const arr = [...(prev[key] || [])]
      arr[idx] = val
      return { ...prev, [key]: arr }
    })
  }
  const addAttrValue = (key: string) => {
    setAttrValues(prev => ({ ...prev, [key]: [...(prev[key] || []), ''] }))
  }
  const removeAttrValue = (key: string, idx: number) => {
    setAttrValues(prev => {
      const arr = (prev[key] || []).filter((_, i) => i !== idx)
      const next = { ...prev }
      if (arr.length === 0) delete next[key]
      else next[key] = arr
      return next
    })
  }

  const save = async () => {
    if (!name.trim()) { setErr('Введите название'); return }
    if (!groupId) { setErr('Выберите группу'); return }
    // Чистим пустые значения атрибутов
    const cleanedAttrs: Record<string, string[]> = {}
    for (const [k, vs] of Object.entries(attrValues)) {
      const filtered = vs.map(v => v.trim()).filter(v => v !== '')
      if (filtered.length > 0) cleanedAttrs[k] = filtered
    }
    const body: SkuRequest = {
      group_id: groupId,
      name: name.trim(),
      pricing_type: pricingType,
      price: price.trim() === '' ? null : Number(price),
      cost_price: costPrice.trim() === '' ? null : Number(costPrice),
      is_auto_add: isAutoAdd,
      free_threshold: freeThreshold.trim() === '' ? null : Number(freeThreshold),
      auto_complete_on_status: autoCompleteOn || null,
      triggers_order_status: triggersStatus || null,
      exclude_from_status_calc: excludeCalc,
      attributes: cleanedAttrs,
    }
    setSaving(true)
    try {
      if (mode === 'create') await createSku(body)
      else if (existing) await updateSku(existing.id, body)
      await onSaved()
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка сохранения'
      setErr(msg); showToast(msg, 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 700, width: '92%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <h3>{mode === 'create' ? 'Новый SKU' : `Редактирование: ${existing?.name}`}</h3>

        <div className="form-group">
          <label>Группа</label>
          <select value={groupId} onChange={e => setGroupId(Number(e.target.value))}>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Название</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Например: Стирка ковёр шерсть 5–10 кг" />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Тип расчёта</label>
            <select value={pricingType} onChange={e => setPricingType(e.target.value as SkuPricingType)}>
              {PRICING_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Цена</label>
            <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Себестоимость</label>
            <input type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={isAutoAdd} onChange={e => setIsAutoAdd(e.target.checked)} />
            Авто-добавлять в каждый новый заказ
          </label>
          <div className="form-group" style={{ flex: '0 0 220px', marginBottom: 0 }}>
            <label>Бесплатно от (₽)</label>
            <input type="number" step="0.01" value={freeThreshold} onChange={e => setFreeThreshold(e.target.value)} placeholder="например, 4000" />
          </div>
        </div>

        {/* V11 lifecycle — видно только если auto-add включён */}
        {isAutoAdd && (
          <div style={{ border: '1px solid #ffeaa7', borderRadius: 6, padding: 12, marginBottom: 12, background: '#fffef5' }}>
            <div style={{ fontSize: '0.85em', fontWeight: 600, color: '#f39c12', marginBottom: 8 }}>Lifecycle (авто-добавляемые SKU)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                <label>Авто-завершить при статусе заказа</label>
                <select value={autoCompleteOn} onChange={e => setAutoCompleteOn(e.target.value)}>
                  <option value="">— нет —</option>
                  <option value="CREATED">Создан</option>
                  <option value="FOR_PICKUP">К забору</option>
                  <option value="IN_PROGRESS">В работе</option>
                  <option value="DONE">Готов</option>
                  <option value="DELIVERED">Доставлен</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                <label>При завершении → статус заказа</label>
                <select value={triggersStatus} onChange={e => setTriggersStatus(e.target.value)}>
                  <option value="">— нет —</option>
                  <option value="CREATED">Создан</option>
                  <option value="FOR_PICKUP">К забору</option>
                  <option value="IN_PROGRESS">В работе</option>
                  <option value="DONE">Готов</option>
                  <option value="DELIVERED">Доставлен</option>
                </select>
              </div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', marginTop: 20 }}>
                <input type="checkbox" checked={excludeCalc} onChange={e => setExcludeCalc(e.target.checked)} />
                Не учитывать при вычислении статуса заказа
              </label>
            </div>
          </div>
        )}

        <div className="form-group">
          <label style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Атрибуты</span>
            <span style={{ fontSize: '0.8em', color: '#888', fontWeight: 'normal' }}>
              Каждый атрибут может иметь несколько значений (диапазон, список типов)
            </span>
          </label>
          <div style={{ border: '1px solid #ecf0f1', borderRadius: 4, padding: 8 }}>
            {attrs.length === 0 && <div style={{ color: '#aaa' }}>Сначала добавьте атрибуты в справочнике</div>}
            {attrs.map(a => (
              <div key={a.key} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #ecf0f1' }}>
                <div style={{ fontSize: '0.85em', fontWeight: 600, color: '#34495e' }}>
                  {a.label} <code style={{ fontSize: '0.85em', color: '#7f8c8d' }}>{a.key}</code>
                  {a.unit && <span style={{ color: '#7f8c8d' }}> ({a.unit})</span>}
                </div>
                <div style={{ marginTop: 4 }}>
                  {(attrValues[a.key] || []).map((v, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                      {a.value_type === 'REFERENCE_ITEM_TYPE' ? (
                        <select
                          value={v}
                          onChange={e => updateAttr(a.key, idx, e.target.value)}
                          style={{ flex: 1 }}
                        >
                          <option value="">— выбрать тип —</option>
                          {types.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                        </select>
                      ) : (
                        <input
                          type={a.value_type === 'NUMBER' ? 'number' : 'text'}
                          step={a.value_type === 'NUMBER' ? '0.01' : undefined}
                          value={v}
                          onChange={e => updateAttr(a.key, idx, e.target.value)}
                          style={{ flex: 1 }}
                          placeholder={a.value_type === 'NUMBER' ? '0' : ''}
                        />
                      )}
                      <button className="btn-secondary btn-sm" type="button" onClick={() => removeAttrValue(a.key, idx)}>−</button>
                    </div>
                  ))}
                  <button className="btn-secondary btn-sm" type="button" onClick={() => addAttrValue(a.key)}>
                    + значение
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {err && <div className="error-msg">{err}</div>}

        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Отмена</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Модификаторы цены (без изменений, перенесены как есть)
// ============================================================================
function PriceModifiersCard({ modifiers, reload, setConfirm, showToast }: CardProps<{ modifiers: PriceModifier[] }>) {
  const [newName, setNewName] = useState('')
  const [newPercent, setNewPercent] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editPercent, setEditPercent] = useState('')
  const [err, setErr] = useState('')

  const create = async () => {
    if (!newName.trim()) { setErr('Введите название'); return }
    if (!newPercent) { setErr('Введите процент'); return }
    try {
      await createPriceModifier({ name: newName.trim(), percent: Number(newPercent) })
      setNewName(''); setNewPercent(''); setErr(''); await reload()
    } catch { setErr('Ошибка создания') }
  }
  const save = async (id: number) => {
    if (!editName.trim()) return
    try {
      await updatePriceModifier(id, { name: editName.trim(), percent: Number(editPercent) })
      setEditId(null); await reload()
    } catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка сохранения', 'error') }
  }
  const remove = (id: number) => setConfirm({
    title: 'Удалить модификатор цены', message: 'Удалить?', danger: true,
    action: async () => {
      try { await deletePriceModifier(id); await reload() }
      catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка удаления', 'error') }
    },
  })

  return (
    <div className="card">
      <h2>Модификаторы цены</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название модификатора" style={{ flex: '1 1 200px' }} />
        <input type="number" step="0.01" value={newPercent} onChange={e => setNewPercent(e.target.value)} placeholder="Процент" style={{ flex: '0 0 120px' }} />
        <button className="btn-primary" onClick={create} style={{ whiteSpace: 'nowrap' }}>+ Добавить</button>
      </div>
      {err && <div className="error-msg" style={{ marginBottom: 8 }}>{err}</div>}
      <table>
        <thead><tr><th>#</th><th>Название</th><th>Процент</th><th>Действия</th></tr></thead>
        <tbody>
          {modifiers.length === 0 ? (
            <tr><td colSpan={4} className="empty">Нет модификаторов</td></tr>
          ) : modifiers.map(m => (
            <tr key={m.id}>
              <td>{m.id}</td>
              <td>
                {editId === m.id
                  ? <input value={editName} onChange={e => setEditName(e.target.value)} />
                  : m.name}
              </td>
              <td>
                {editId === m.id
                  ? <input type="number" step="0.01" value={editPercent} onChange={e => setEditPercent(e.target.value)} style={{ width: 100 }} />
                  : <span style={{ color: m.percent < 0 ? '#27ae60' : m.percent > 0 ? '#e74c3c' : undefined, fontWeight: 600 }}>
                      {m.percent > 0 ? '+' : ''}{Number(m.percent).toFixed(2)}%
                    </span>}
              </td>
              <td>
                <div className="actions">
                  {editId === m.id ? (
                    <>
                      <button className="btn-success btn-sm" onClick={() => void save(m.id)}>✓</button>
                      <button className="btn-secondary btn-sm" onClick={() => setEditId(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-secondary btn-sm" onClick={() => {
                        setEditId(m.id); setEditName(m.name); setEditPercent(String(m.percent))
                      }}>✏️</button>
                      <button className="btn-danger btn-sm" onClick={() => remove(m.id)}>🗑️</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Районы (без изменений)
// ============================================================================
function DistrictsCard({ districts, reload, setConfirm, showToast }: CardProps<{ districts: District[] }>) {
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [err, setErr] = useState('')

  const create = async () => {
    if (!newName.trim()) { setErr('Введите название района'); return }
    try {
      const maxSort = districts.reduce((m, d) => Math.max(m, d.sort_order), 0)
      await createDistrict({ name: newName.trim(), sort_order: maxSort + 10, is_active: true })
      setNewName(''); setErr(''); invalidateDistrictCache(); await reload()
    } catch (e: unknown) {
      setErr((e as any)?.response?.data?.message || 'Ошибка создания района')
    }
  }
  const save = async (id: number) => {
    if (!editName.trim()) return
    try {
      const existing = districts.find(d => d.id === id)
      await updateDistrict(id, {
        name: editName.trim(),
        sort_order: existing?.sort_order ?? 0,
        is_active: editActive,
      })
      setEditId(null); invalidateDistrictCache(); await reload()
    } catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка сохранения', 'error') }
  }
  const remove = (id: number) => setConfirm({
    title: 'Удалить район',
    message: 'Удалить район? У существующих заказов значение сохранится как текст, в новых записях его уже не будет.',
    danger: true,
    action: async () => {
      try { await deleteDistrict(id); invalidateDistrictCache(); await reload() }
      catch (e: unknown) { showToast((e as any)?.response?.data?.message || 'Ошибка удаления', 'error') }
    },
  })

  return (
    <div className="card">
      <h2>Районы</h2>
      <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 8 }}>
        Используются для выбора района в адресах клиентов и заказов.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={newName} onChange={e => setNewName(e.target.value)}
          placeholder="Название района" style={{ flex: '1 1 200px' }}
          onKeyDown={e => { if (e.key === 'Enter') void create() }}
        />
        <button className="btn-primary" onClick={create} style={{ whiteSpace: 'nowrap' }}>+ Добавить</button>
      </div>
      {err && <div className="error-msg" style={{ marginBottom: 8 }}>{err}</div>}
      <table>
        <thead><tr><th>#</th><th>Название</th><th>Активен</th><th>Действия</th></tr></thead>
        <tbody>
          {districts.length === 0 ? (
            <tr><td colSpan={4} className="empty">Нет районов</td></tr>
          ) : districts.map(d => (
            <tr key={d.id} style={{ opacity: d.is_active ? 1 : 0.5 }}>
              <td>{d.id}</td>
              <td>
                {editId === d.id
                  ? <input value={editName} onChange={e => setEditName(e.target.value)} />
                  : d.name}
              </td>
              <td>
                {editId === d.id
                  ? <input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)} />
                  : (d.is_active ? '✓' : '—')}
              </td>
              <td>
                <div className="actions">
                  {editId === d.id ? (
                    <>
                      <button className="btn-success btn-sm" onClick={() => void save(d.id)}>✓</button>
                      <button className="btn-secondary btn-sm" onClick={() => setEditId(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <button className="btn-secondary btn-sm" onClick={() => {
                        setEditId(d.id); setEditName(d.name); setEditActive(d.is_active)
                      }}>✏️</button>
                      <button className="btn-danger btn-sm" onClick={() => remove(d.id)}>🗑️</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
