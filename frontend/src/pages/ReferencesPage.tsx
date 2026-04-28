import { useEffect, useState } from 'react'
import {
  getItemTypes, createItemType, updateItemType, deleteItemType,
  getServiceDefinitions, createServiceDefinition, updateServiceDefinition, deleteServiceDefinition,
  getPriceList, updatePriceListEntry,
  getPriceModifiers, createPriceModifier, updatePriceModifier, deletePriceModifier,
} from '../api/references'
import type { ItemType, ServiceDefinition, PriceListEntry, PriceModifier } from '../types'

const pricingLabel = (pt?: string | null) => {
  switch (pt) {
    case 'FIXED': return 'Фикс.'
    case 'BY_WEIGHT': return 'По весу'
    case 'BY_AREA': return 'По площ.'
    case 'BY_PERIMETER': return 'По перим.'
    default: return ''
  }
}

function PriceCell({ entry, onSave }: { entry?: PriceListEntry; onSave: (id: number, price: number | null) => void }) {
  const [value, setValue] = useState(entry?.price?.toString() ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(entry?.price?.toString() ?? '')
  }, [entry?.price])

  if (!entry) return <td style={{ background: '#f5f5f5' }}>—</td>

  const save = async () => {
    const newPrice = value.trim() === '' ? null : Number(value)
    if (newPrice === entry.price) return
    setSaving(true)
    try {
      await onSave(entry.id, newPrice)
    } finally {
      setSaving(false)
    }
  }

  return (
    <td style={{
      borderLeft: entry.is_active ? '3px solid #27ae60' : '3px solid #ddd',
      background: entry.is_active ? '#f0fff4' : '#fafafa',
    }}>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save() }}
        disabled={saving}
        style={{ width: 80, textAlign: 'center' }}
        placeholder="—"
      />
    </td>
  )
}

export default function ReferencesPage() {
  const [defs, setDefs] = useState<ServiceDefinition[]>([])
  const [types, setTypes] = useState<ItemType[]>([])
  const [priceList, setPriceList] = useState<PriceListEntry[]>([])
  const [modifiers, setModifiers] = useState<PriceModifier[]>([])
  const [newModName, setNewModName] = useState('')
  const [newModPercent, setNewModPercent] = useState('')
  const [editModId, setEditModId] = useState<number | null>(null)
  const [editModName, setEditModName] = useState('')
  const [editModPercent, setEditModPercent] = useState('')
  const [modError, setModError] = useState('')

  // Общая загрузка — оба списка всегда синхронны
  const load = async () => {
    const [ts, ds, pl, mods] = await Promise.all([getItemTypes(), getServiceDefinitions(), getPriceList(), getPriceModifiers()])
    setTypes(ts)
    setDefs(ds)
    setPriceList(pl)
    setModifiers(mods)
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
    } catch { /* ignore */ }
  }

  const removeDef = async (id: number) => {
    if (!confirm('Удалить шаблон услуги?')) return
    try { await deleteServiceDefinition(id); await load() } catch { /* ignore */ }
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
    } catch { /* ignore */ }
  }

  const removeType = async (id: number) => {
    if (!confirm('Удалить тип позиции?')) return
    try { await deleteItemType(id); await load() } catch { /* ignore */ }
  }

  const handlePriceSave = async (id: number, price: number | null) => {
    try {
      await updatePriceListEntry(id, price)
      await load()
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
  }

  const removeMod = async (id: number) => {
    if (!confirm('Удалить модификатор цены?')) return
    try { await deletePriceModifier(id); await load() } catch { /* ignore */ }
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

      {/* Прайс-лист */}
      <div className="card">
        <h2>Прайс-лист</h2>
        {types.filter(t => !t.is_default).length === 0 || defs.length === 0 ? (
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
                {types.filter(t => !t.is_default).map(type => (
                  <tr key={type.id}>
                    <td><strong>{type.name}</strong></td>
                    {defs.map(d => {
                      const entry = priceList.find(
                        e => e.item_type_id === type.id && e.service_def_id === d.id
                      )
                      return (
                        <PriceCell key={d.id} entry={entry} onSave={handlePriceSave} />
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
                    : <span style={{ color: m.percent > 0 ? '#27ae60' : m.percent < 0 ? '#e74c3c' : undefined, fontWeight: 600 }}>
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
    </div>
  )
}
