import { useEffect, useState } from 'react'
import {
  getItemTypes, createItemType, updateItemType, deleteItemType,
  getServiceDefinitions, createServiceDefinition, updateServiceDefinition, deleteServiceDefinition,
  getPriceList, updatePriceListEntry,
  getPriceModifiers, createPriceModifier, updatePriceModifier, deletePriceModifier,
} from '../api/references'
import { getDistricts, createDistrict, updateDistrict, deleteDistrict } from '../api/districts'
import { invalidateDistrictCache } from '../components/DistrictSelect'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import type { ItemType, ServiceDefinition, PriceListEntry, PriceModifier, District } from '../types'

const pricingLabel = (pt?: string | null) => {
  switch (pt) {
    case 'FIXED': return 'Фикс.'
    case 'BY_WEIGHT': return 'По весу'
    case 'BY_AREA': return 'По площ.'
    case 'BY_PERIMETER': return 'По перим.'
    default: return ''
  }
}

function PriceCell({ entry, onSave, isDefaultType }: {
  entry?: PriceListEntry
  onSave: (id: number, price: number | null, costPrice?: number | null) => void
  /**
   * Тип позиции — дефолтный (доставка/оформление). У таких типов цена услуги в прайс-листе
   * не используется (стоимость берётся из default_price типа), поэтому скрываем
   * поле «Цена», но себестоимость оставляем — она всё ещё нужна для аналитики.
   */
  isDefaultType?: boolean
}) {
  const [value, setValue] = useState(entry?.price?.toString() ?? '')
  const [costValue, setCostValue] = useState(entry?.cost_price?.toString() ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(entry?.price?.toString() ?? '')
    setCostValue(entry?.cost_price?.toString() ?? '')
  }, [entry?.price, entry?.cost_price])

  if (!entry) return <td style={{ background: '#f5f5f5' }}>—</td>

  const save = async () => {
    const newPrice = value.trim() === '' ? null : Number(value)
    // Себестоимость — независимое поле. Раньше она показывалась только когда price задан;
    // теперь оператор может ввести cost_price без price (и наоборот). Бизнес-логика:
    // если price = null, услуга неактивна для типа; cost_price можно проставить заранее
    // как «черновик», чтобы не вводить его потом отдельно при активации.
    const newCost = costValue.trim() === '' ? null : Number(costValue)
    if (newPrice === entry.price && newCost === entry.cost_price) return
    setSaving(true)
    try {
      await onSave(entry.id, newPrice, newCost)
    } finally {
      setSaving(false)
    }
  }

  return (
    <td
      style={{
        borderLeft: entry.is_active ? '3px solid #27ae60' : '3px solid #ddd',
        background: entry.is_active ? '#f0fff4' : '#fafafa',
      }}
    >
      {isDefaultType ? (
        // Для дефолтных типов вместо поля «Цена» — чекбокс «доступна»: цена не используется
        // (стоимость берётся из default_price типа), нужен только сам факт доступности услуги.
        // is_active в БД управляется через значение price: 0 → активна, null → неактивна.
        // (Бэкенд читает «price != null» как is_active=true.)
        <label
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 4, padding: '4px 0', cursor: 'pointer', fontSize: '0.85em',
          }}
          title="Доступна ли услуга для этого дефолтного типа. Цена берётся из самого типа позиции."
        >
          <input
            type="checkbox"
            style={{ width: 'auto', cursor: 'pointer' }}
            checked={entry.is_active}
            disabled={saving}
            onChange={async e => {
              setSaving(true)
              try {
                // 0 = активна, null = неактивна. Цену в default-строках не показываем,
                // так что конкретное число роли не играет — главное, чтобы было не null.
                await onSave(entry.id, e.target.checked ? 0 : null, entry.cost_price)
              } finally {
                setSaving(false)
              }
            }}
          />
          <span style={{ color: entry.is_active ? '#27ae60' : '#aaa' }}>
            {entry.is_active ? 'доступна' : '—'}
          </span>
        </label>
      ) : (
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          disabled={saving}
          style={{ width: 75, textAlign: 'center', fontSize: '0.9em' }}
          placeholder="Цена"
        />
      )}
      {/* Поле себестоимости видно ВСЕГДА (включая дефолтные типы) — оператор может
          указать её для аналитики маржинальности. */}
      <input
        type="number"
        step="0.01"
        value={costValue}
        onChange={e => setCostValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        disabled={saving}
        style={{ width: 75, textAlign: 'center', fontSize: '0.8em', color: '#888', marginTop: 2 }}
        placeholder="себест."
      />
    </td>
  )
}

export default function ReferencesPage() {
  const { showToast } = useToast()
  const [defs, setDefs] = useState<ServiceDefinition[]>([])
  const [types, setTypes] = useState<ItemType[]>([])
  const [priceList, setPriceList] = useState<PriceListEntry[]>([])
  const [modifiers, setModifiers] = useState<PriceModifier[]>([])
  const [districts, setDistricts] = useState<District[]>([])
  const [newDistrictName, setNewDistrictName] = useState('')
  const [editDistrictId, setEditDistrictId] = useState<number | null>(null)
  const [editDistrictName, setEditDistrictName] = useState('')
  const [editDistrictActive, setEditDistrictActive] = useState(true)
  const [districtError, setDistrictError] = useState('')
  const [newModName, setNewModName] = useState('')
  const [newModPercent, setNewModPercent] = useState('')
  const [editModId, setEditModId] = useState<number | null>(null)
  const [editModName, setEditModName] = useState('')
  const [editModPercent, setEditModPercent] = useState('')
  const [modError, setModError] = useState('')
  const [confirmAction, setConfirmAction] = useState<{title: string, message: string, action: () => void, danger?: boolean} | null>(null)

  // Общая загрузка — оба списка всегда синхронны
  const load = async () => {
    const [ts, ds, pl, mods, dists] = await Promise.all([
      getItemTypes(), getServiceDefinitions(), getPriceList(), getPriceModifiers(), getDistricts(false),
    ])
    setTypes(ts)
    setDefs(ds)
    setPriceList(pl)
    setModifiers(mods)
    setDistricts(dists)
  }
  useEffect(() => { void load() }, [])

  // --- Шаблоны услуг ---
  const [newDefName, setNewDefName] = useState('')
  const [newDefBasePrice, setNewDefBasePrice] = useState('')
  const [newDefPricingType, setNewDefPricingType] = useState<'FIXED' | 'BY_WEIGHT' | 'BY_AREA' | 'BY_PERIMETER'>('FIXED')
  const [editDefId, setEditDefId] = useState<number | null>(null)
  const [editDefName, setEditDefName] = useState('')
  const [editDefBasePrice, setEditDefBasePrice] = useState('')
  const [editDefPricingType, setEditDefPricingType] = useState<'FIXED' | 'BY_WEIGHT' | 'BY_AREA' | 'BY_PERIMETER'>('FIXED')
  const [defError, setDefError] = useState('')

  const createDef = async () => {
    if (!newDefName.trim()) { setDefError('Введите название'); return }
    try {
      await createServiceDefinition({
        name: newDefName.trim(),
        base_price: newDefBasePrice ? Number(newDefBasePrice) : 0,
        pricing_type: newDefPricingType
      })
      setNewDefName('')
      setNewDefBasePrice('')
      setNewDefPricingType('FIXED')
      setDefError('')
      await load()
    } catch { setDefError('Ошибка создания') }
  }

  const saveDef = async (id: number) => {
    if (!editDefName.trim()) return
    try {
      await updateServiceDefinition(id, {
        name: editDefName.trim(),
        base_price: editDefBasePrice ? Number(editDefBasePrice) : 0,
        pricing_type: editDefPricingType
      })
      setEditDefId(null)
      await load()
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка сохранения'; showToast(msg, 'error') }
  }

  const removeDef = (id: number) => {
    setConfirmAction({
      title: 'Удалить шаблон услуги',
      message: 'Вы уверены, что хотите удалить шаблон услуги?',
      danger: true,
      action: async () => {
        try { await deleteServiceDefinition(id); await load() } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка удаления'; showToast(msg, 'error') }
      }
    })
  }

  // --- Типы позиций ---
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeIsDefault, setNewTypeIsDefault] = useState(false)
  const [newTypeDefaultPrice, setNewTypeDefaultPrice] = useState('')
  const [newTypeFreeThreshold, setNewTypeFreeThreshold] = useState('')
  const [editTypeId, setEditTypeId] = useState<number | null>(null)
  const [editTypeName, setEditTypeName] = useState('')
  const [editTypeIsDefault, setEditTypeIsDefault] = useState(false)
  const [editTypeDefaultPrice, setEditTypeDefaultPrice] = useState('')
  const [editTypeFreeThreshold, setEditTypeFreeThreshold] = useState('')
  const [typeError, setTypeError] = useState('')

  const createType = async () => {
    if (!newTypeName.trim()) { setTypeError('Введите название'); return }
    try {
      await createItemType({
        name: newTypeName.trim(),
        is_default: newTypeIsDefault,
        default_price: newTypeDefaultPrice ? Number(newTypeDefaultPrice) : null,
        free_threshold: newTypeFreeThreshold ? Number(newTypeFreeThreshold) : null,
      })
      setNewTypeName('')
      setNewTypeIsDefault(false)
      setNewTypeDefaultPrice('')
      setNewTypeFreeThreshold('')
      setTypeError('')
      await load()
    } catch { setTypeError('Ошибка создания') }
  }

  const saveType = async (id: number) => {
    if (!editTypeName.trim()) return
    try {
      await updateItemType(id, {
        name: editTypeName.trim(),
        is_default: editTypeIsDefault,
        default_price: editTypeDefaultPrice ? Number(editTypeDefaultPrice) : null,
        free_threshold: editTypeFreeThreshold ? Number(editTypeFreeThreshold) : null,
      })
      setEditTypeId(null)
      await load()
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка сохранения'; showToast(msg, 'error') }
  }

  const removeType = (id: number) => {
    setConfirmAction({
      title: 'Удалить тип позиции',
      message: 'Вы уверены, что хотите удалить тип позиции?',
      danger: true,
      action: async () => {
        try { await deleteItemType(id); await load() } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка удаления'; showToast(msg, 'error') }
      }
    })
  }

  const handlePriceSave = async (id: number, price: number | null, costPrice?: number | null) => {
    // Подтверждение убрано: изменение цены в прайс-листе по дизайну никогда не пересчитывает
    // уже созданные заказы (старые расчёты не должны меняться задним числом). Раньше
    // показывали об этом модалку каждый раз, но это бесполезно — никаких пересчётов
    // не происходит, и оператор просто кликал «Продолжить» десятки раз. Сохраняем сразу.
    try {
      await updatePriceListEntry(id, price, costPrice)
      await load()
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка обновления цены'
      showToast(msg, 'error')
    }
  }

  const createMod = async () => {
    if (!newModName.trim()) { setModError('Введите название'); return }
    if (!newModPercent) { setModError('Введите процент'); return }
    try {
      await createPriceModifier({ name: newModName.trim(), percent: Number(newModPercent) })
      setNewModName('')
      setNewModPercent('')
      setModError('')
      await load()
    } catch { setModError('Ошибка создания') }
  }

  const saveMod = async (id: number) => {
    if (!editModName.trim()) return
    try {
      await updatePriceModifier(id, { name: editModName.trim(), percent: Number(editModPercent) })
      setEditModId(null)
      await load()
    } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка сохранения'; showToast(msg, 'error') }
  }

  const removeMod = (id: number) => {
    setConfirmAction({
      title: 'Удалить модификатор цены',
      message: 'Вы уверены, что хотите удалить модификатор цены?',
      danger: true,
      action: async () => {
        try { await deletePriceModifier(id); await load() } catch (e: unknown) { const msg = (e as any)?.response?.data?.message || 'Ошибка удаления'; showToast(msg, 'error') }
      }
    })
  }

  // --- Районы ---
  const createDistrictHandler = async () => {
    if (!newDistrictName.trim()) { setDistrictError('Введите название района'); return }
    try {
      // Сортировка автоматически в конец (max + 10).
      const maxSort = districts.reduce((m, d) => Math.max(m, d.sort_order), 0)
      await createDistrict({ name: newDistrictName.trim(), sort_order: maxSort + 10, is_active: true })
      setNewDistrictName('')
      setDistrictError('')
      invalidateDistrictCache()
      await load()
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка создания района'
      setDistrictError(msg)
    }
  }

  const saveDistrict = async (id: number) => {
    if (!editDistrictName.trim()) return
    try {
      const existing = districts.find(d => d.id === id)
      await updateDistrict(id, {
        name: editDistrictName.trim(),
        sort_order: existing?.sort_order ?? 0,
        is_active: editDistrictActive,
      })
      setEditDistrictId(null)
      invalidateDistrictCache()
      await load()
    } catch (e: unknown) {
      const msg = (e as any)?.response?.data?.message || 'Ошибка сохранения'
      showToast(msg, 'error')
    }
  }

  const removeDistrict = (id: number) => {
    setConfirmAction({
      title: 'Удалить район',
      message: 'Удалить район из справочника? У существующих заказов значение района сохранится как текст, но в новых записях его уже не будет.',
      danger: true,
      action: async () => {
        try {
          await deleteDistrict(id)
          invalidateDistrictCache()
          await load()
        } catch (e: unknown) {
          const msg = (e as any)?.response?.data?.message || 'Ошибка удаления'
          showToast(msg, 'error')
        }
      }
    })
  }

  return (
    <div>
      <h1>Справочники</h1>

      {/* Шаблоны услуг */}
      <div className="card">
        <h2>Шаблоны услуг</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={newDefName}
            onChange={e => setNewDefName(e.target.value)}
            placeholder="Название услуги"
            style={{ flex: '1 1 200px' }}
          />
          <select
            value={newDefPricingType}
            onChange={e => setNewDefPricingType(e.target.value as 'FIXED' | 'BY_WEIGHT' | 'BY_AREA' | 'BY_PERIMETER')}
            style={{ flex: '0 0 150px' }}
          >
            <option value="FIXED">Фиксированная</option>
            <option value="BY_WEIGHT">По весу</option>
            <option value="BY_AREA">По площади</option>
            <option value="BY_PERIMETER">По периметру</option>
          </select>
          <button className="btn-primary" onClick={createDef} style={{ whiteSpace: 'nowrap' }}>+ Добавить</button>
        </div>
        {defError && <div className="error-msg" style={{ marginBottom: 8 }}>{defError}</div>}
        <table>
          <thead><tr><th>#</th><th>Название</th><th>Тип расчета</th><th>Действия</th></tr></thead>
          <tbody>
            {defs.length === 0 ? (
              <tr><td colSpan={4} className="empty">Нет шаблонов</td></tr>
            ) : defs.map(d => (
              <tr key={d.id}>
                <td>{d.id}</td>
                <td>
                  {editDefId === d.id
                    ? <input value={editDefName} onChange={e => setEditDefName(e.target.value)} />
                    : d.name}
                </td>
                <td>
                  {editDefId === d.id
                    ? <select value={editDefPricingType} onChange={e => setEditDefPricingType(e.target.value as 'FIXED' | 'BY_WEIGHT' | 'BY_AREA' | 'BY_PERIMETER')}>
                        <option value="FIXED">Фиксированная</option>
                        <option value="BY_WEIGHT">По весу</option>
                        <option value="BY_AREA">По площади</option>
                        <option value="BY_PERIMETER">По периметру</option>
                      </select>
                    : (d.pricing_type === 'FIXED' ? 'Фиксированная' :
                       d.pricing_type === 'BY_WEIGHT' ? 'По весу' :
                       d.pricing_type === 'BY_AREA' ? 'По площади' :
                       d.pricing_type === 'BY_PERIMETER' ? 'По периметру' : 'Фиксированная')}
                </td>
                <td>
                  <div className="actions">
                    {editDefId === d.id ? (
                      <>
                        <button className="btn-success btn-sm" onClick={() => void saveDef(d.id)}>✓</button>
                        <button className="btn-secondary btn-sm" onClick={() => setEditDefId(null)}>✕</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-secondary btn-sm" onClick={() => {
                          setEditDefId(d.id);
                          setEditDefName(d.name);
                          setEditDefBasePrice(d.base_price?.toString() || '0');
                          setEditDefPricingType(d.pricing_type || 'FIXED');
                        }}>✏️</button>
                        <button className="btn-danger btn-sm" onClick={() => void removeDef(d.id)}>🗑️</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Типы позиций */}
      <div className="card">
        <h2>Типы позиций</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
            <label>Название</label>
            <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="Название типа" />
          </div>
          <div className="form-group" style={{ flex: '0 0 auto', marginBottom: 0 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={newTypeIsDefault} onChange={e => setNewTypeIsDefault(e.target.checked)} />
              По умолчанию
            </label>
          </div>
          {newTypeIsDefault && <>
            <div className="form-group" style={{ flex: '0 0 120px', marginBottom: 0 }}>
              <label>Цена</label>
              <input type="number" step="0.01" value={newTypeDefaultPrice} onChange={e => setNewTypeDefaultPrice(e.target.value)} placeholder="400" />
            </div>
            <div className="form-group" style={{ flex: '0 0 150px', marginBottom: 0 }}>
              <label>Бесплатно от (₽)</label>
              <input type="number" step="0.01" value={newTypeFreeThreshold} onChange={e => setNewTypeFreeThreshold(e.target.value)} placeholder="4000" />
            </div>
          </>}
          <button className="btn-primary" onClick={createType} style={{ whiteSpace: 'nowrap' }}>+ Добавить</button>
        </div>
        {typeError && <div className="error-msg" style={{ marginBottom: 8 }}>{typeError}</div>}
        <table>
          <thead><tr><th>#</th><th>Название</th><th>По умолч.</th><th>Цена</th><th>Бесплатно от</th><th>Действия</th></tr></thead>
          <tbody>
            {types.length === 0 ? (
              <tr><td colSpan={6} className="empty">Нет типов</td></tr>
            ) : types.map(t => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>
                  {editTypeId === t.id
                    ? <input value={editTypeName} onChange={e => setEditTypeName(e.target.value)} />
                    : t.name}
                </td>
                <td>
                  {editTypeId === t.id
                    ? <input type="checkbox" checked={editTypeIsDefault} onChange={e => setEditTypeIsDefault(e.target.checked)} />
                    : (t.is_default ? '✓' : '—')}
                </td>
                <td>
                  {editTypeId === t.id && editTypeIsDefault
                    ? <input type="number" step="0.01" value={editTypeDefaultPrice} onChange={e => setEditTypeDefaultPrice(e.target.value)} style={{ width: 80 }} />
                    : (t.default_price != null ? `${t.default_price} ₽` : '—')}
                </td>
                <td>
                  {editTypeId === t.id && editTypeIsDefault
                    ? <input type="number" step="0.01" value={editTypeFreeThreshold} onChange={e => setEditTypeFreeThreshold(e.target.value)} style={{ width: 80 }} />
                    : (t.free_threshold != null ? `${t.free_threshold} ₽` : '—')}
                </td>
                <td>
                  <div className="actions">
                    {editTypeId === t.id ? (
                      <>
                        <button className="btn-success btn-sm" onClick={() => void saveType(t.id)}>✓</button>
                        <button className="btn-secondary btn-sm" onClick={() => setEditTypeId(null)}>✕</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-secondary btn-sm" onClick={() => {
                          setEditTypeId(t.id); setEditTypeName(t.name)
                          setEditTypeIsDefault(t.is_default)
                          setEditTypeDefaultPrice(t.default_price?.toString() || '')
                          setEditTypeFreeThreshold(t.free_threshold?.toString() || '')
                        }}>✏️</button>
                        <button className="btn-danger btn-sm" onClick={() => void removeType(t.id)}>🗑️</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Прайс-лист — теперь показываем ВСЕ типы позиций, включая дефолтные (доставка/оформление).
          Раньше дефолтные исключались, но в реальности к доставке тоже бывают услуги
          (например, «занос на этаж»), и оператор должен иметь возможность настроить цену. */}
      <div className="card">
        <h2>Прайс-лист</h2>
        {types.length === 0 || defs.length === 0 ? (
          <div className="empty">Создайте типы позиций и услуги для формирования прайс-листа</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Тип позиции</th>
                  {defs.map(d => (
                    <th key={d.id} style={{ textAlign: 'center', fontSize: '0.85em' }}>
                      {d.name}
                      <div style={{ fontSize: '0.75em', color: '#888' }}>
                        {pricingLabel(d.pricing_type)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {types.map(type => (
                  <tr key={type.id}>
                    <td>
                      <strong>{type.name}</strong>
                      {/* Маркер «дефолт» — чтобы оператор видел разницу: эти типы автоматически
                          добавляются в каждый заказ. Цены задавать всё равно полезно. */}
                      {type.is_default && (
                        <span style={{
                          marginLeft: 6, fontSize: '0.75em', color: '#7f8c8d',
                          padding: '1px 6px', borderRadius: 8, background: '#ecf0f1',
                        }}>дефолт</span>
                      )}
                    </td>
                    {defs.map(d => {
                      const entry = priceList.find(
                        e => e.item_type_id === type.id && e.service_def_id === d.id
                      )
                      return (
                        <PriceCell key={d.id} entry={entry} onSave={handlePriceSave} isDefaultType={type.is_default} />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модификаторы цены */}
      <div className="card">
        <h2>Модификаторы цены</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={newModName}
            onChange={e => setNewModName(e.target.value)}
            placeholder="Название модификатора"
            style={{ flex: '1 1 200px' }}
          />
          <input
            type="number"
            step="0.01"
            value={newModPercent}
            onChange={e => setNewModPercent(e.target.value)}
            placeholder="Процент"
            style={{ flex: '0 0 120px' }}
          />
          <button className="btn-primary" onClick={createMod} style={{ whiteSpace: 'nowrap' }}>+ Добавить</button>
        </div>
        {modError && <div className="error-msg" style={{ marginBottom: 8 }}>{modError}</div>}
        <table>
          <thead><tr><th>#</th><th>Название</th><th>Процент</th><th>Действия</th></tr></thead>
          <tbody>
            {modifiers.length === 0 ? (
              <tr><td colSpan={4} className="empty">Нет модификаторов</td></tr>
            ) : modifiers.map(m => (
              <tr key={m.id}>
                <td>{m.id}</td>
                <td>
                  {editModId === m.id
                    ? <input value={editModName} onChange={e => setEditModName(e.target.value)} />
                    : m.name}
                </td>
                <td>
                  {editModId === m.id
                    ? <input type="number" step="0.01" value={editModPercent} onChange={e => setEditModPercent(e.target.value)} style={{ width: 100 }} />
                    : <span style={{ color: m.percent < 0 ? '#27ae60' : m.percent > 0 ? '#e74c3c' : undefined, fontWeight: 600 }}>
                        {m.percent > 0 ? '+' : ''}{Number(m.percent).toFixed(2)}%
                      </span>}
                </td>
                <td>
                  <div className="actions">
                    {editModId === m.id ? (
                      <>
                        <button className="btn-success btn-sm" onClick={() => void saveMod(m.id)}>&#10003;</button>
                        <button className="btn-secondary btn-sm" onClick={() => setEditModId(null)}>&#10005;</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-secondary btn-sm" onClick={() => {
                          setEditModId(m.id);
                          setEditModName(m.name);
                          setEditModPercent(String(m.percent));
                        }}>&#9999;&#65039;</button>
                        <button className="btn-danger btn-sm" onClick={() => void removeMod(m.id)}>&#128465;&#65039;</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Районы */}
      <div className="card">
        <h2>Районы</h2>
        <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 8 }}>
          Используются для выбора района в адресах клиентов и заказов. Стандартный набор —
          18 районов Санкт-Петербурга, можно добавить свои.
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={newDistrictName}
            onChange={e => setNewDistrictName(e.target.value)}
            placeholder="Название района"
            style={{ flex: '1 1 200px' }}
            onKeyDown={e => { if (e.key === 'Enter') void createDistrictHandler() }}
          />
          <button className="btn-primary" onClick={createDistrictHandler} style={{ whiteSpace: 'nowrap' }}>+ Добавить</button>
        </div>
        {districtError && <div className="error-msg" style={{ marginBottom: 8 }}>{districtError}</div>}
        <table>
          <thead><tr><th>#</th><th>Название</th><th>Активен</th><th>Действия</th></tr></thead>
          <tbody>
            {districts.length === 0 ? (
              <tr><td colSpan={4} className="empty">Нет районов</td></tr>
            ) : districts.map(d => (
              <tr key={d.id} style={{ opacity: d.is_active ? 1 : 0.5 }}>
                <td>{d.id}</td>
                <td>
                  {editDistrictId === d.id
                    ? <input value={editDistrictName} onChange={e => setEditDistrictName(e.target.value)} />
                    : d.name}
                </td>
                <td>
                  {editDistrictId === d.id
                    ? <input type="checkbox" checked={editDistrictActive} onChange={e => setEditDistrictActive(e.target.checked)} />
                    : (d.is_active ? '✓' : '—')}
                </td>
                <td>
                  <div className="actions">
                    {editDistrictId === d.id ? (
                      <>
                        <button className="btn-success btn-sm" onClick={() => void saveDistrict(d.id)}>✓</button>
                        <button className="btn-secondary btn-sm" onClick={() => setEditDistrictId(null)}>✕</button>
                      </>
                    ) : (
                      <>
                        <button className="btn-secondary btn-sm" onClick={() => {
                          setEditDistrictId(d.id)
                          setEditDistrictName(d.name)
                          setEditDistrictActive(d.is_active)
                        }}>✏️</button>
                        <button className="btn-danger btn-sm" onClick={() => removeDistrict(d.id)}>🗑️</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
