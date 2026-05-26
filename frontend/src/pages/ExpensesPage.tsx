import { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'
import client from '../api/client'

interface ExpenseCategory { id: number; name: string; is_fixed: boolean; default_amount: number | null; sort_order: number }
interface MonthlyExpense { id: number; category_id: number; category_name: string; year_month: string; amount: number; comment: string }

export default function ExpensesPage() {
  const { showToast } = useToast()
  const now = new Date()
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<MonthlyExpense[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [newCatFixed, setNewCatFixed] = useState(false)
  const [newCatDefault, setNewCatDefault] = useState('')

  const load = async () => {
    const [cats, exps] = await Promise.all([
      client.get<ExpenseCategory[]>('/api/expenses/categories').then(r => r.data),
      client.get<MonthlyExpense[]>(`/api/expenses?yearMonth=${yearMonth}`).then(r => r.data),
    ])
    setCategories(cats)
    setExpenses(exps)
  }
  useEffect(() => { void load() }, [yearMonth])

  const createCategory = async () => {
    if (!newCatName.trim()) return
    await client.post('/api/expenses/categories', {
      name: newCatName.trim(),
      is_fixed: newCatFixed,
      default_amount: newCatDefault ? Number(newCatDefault) : null,
    })
    setNewCatName(''); setNewCatFixed(false); setNewCatDefault(''); await load()
  }

  const upsert = async (categoryId: number, amount: string) => {
    if (!amount.trim()) return
    try {
      await client.post('/api/expenses', { category_id: categoryId, year_month: yearMonth, amount: Number(amount) })
      await load()
    } catch { showToast('Ошибка сохранения', 'error') }
  }

  // V14: переименовать категорию (предлагаем prompt — минимум UI). default_amount и is_fixed
  // сохраняем как было — переименование не должно их сбрасывать.
  const renameCategory = async (cat: ExpenseCategory) => {
    const newName = prompt('Новое название категории:', cat.name)?.trim()
    if (!newName || newName === cat.name) return
    try {
      await client.put(`/api/expenses/categories/${cat.id}`, {
        name: newName, is_fixed: cat.is_fixed, default_amount: cat.default_amount,
      })
      showToast('Категория переименована', 'success'); await load()
    } catch { showToast('Ошибка переименования', 'error') }
  }

  // V14: удалить категорию (вместе со всеми её месячными суммами).
  const deleteCategory = async (cat: ExpenseCategory) => {
    if (!confirm(`Удалить категорию «${cat.name}»?\nВсе суммы по месяцам тоже удалятся.`)) return
    try {
      await client.delete(`/api/expenses/categories/${cat.id}`)
      showToast('Категория удалена', 'success'); await load()
    } catch { showToast('Ошибка удаления', 'error') }
  }

  const expenseMap = new Map(expenses.map(e => [e.category_id, e]))

  return (
    <div>
      <h1>Расходы</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <label>Месяц: <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} /></label>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Категории × месяц</h3>
        <table>
          <thead>
            <tr><th>Категория</th><th>Тип</th><th>Дефолт</th><th>Сумма за {yearMonth}</th><th style={{ width: 130 }}>Действия</th></tr>
          </thead>
          <tbody>
            {categories.map(cat => {
              const existing = expenseMap.get(cat.id)
              return (
                <tr key={cat.id}>
                  <td>{cat.name}</td>
                  <td>{cat.is_fixed ? 'Фикс.' : 'Динам.'}</td>
                  <td>{cat.default_amount != null ? Number(cat.default_amount).toLocaleString('ru') + ' ₽' : '—'}</td>
                  <td>
                    <ExpenseInput
                      initial={existing?.amount?.toString() ?? (cat.is_fixed && cat.default_amount ? cat.default_amount.toString() : '')}
                      onSave={v => upsert(cat.id, v)}
                    />
                  </td>
                  <td>
                    <button className="btn-secondary btn-sm" title="Переименовать" onClick={() => renameCategory(cat)} style={{ marginRight: 4 }}>&#9998;</button>
                    <button className="btn-danger btn-sm" title="Удалить категорию" onClick={() => deleteCategory(cat)}>&times;</button>
                  </td>
                </tr>
              )
            })}
            {categories.length === 0 && <tr><td colSpan={5} className="empty">Нет категорий</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>+ Новая категория</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Название" style={{ flex: '1 1 200px' }} />
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={newCatFixed} onChange={e => setNewCatFixed(e.target.checked)} /> Фиксированная
          </label>
          {newCatFixed && <input type="number" value={newCatDefault} onChange={e => setNewCatDefault(e.target.value)} placeholder="Дефолт" style={{ width: 120 }} />}
          <button className="btn-primary" onClick={createCategory}>Добавить</button>
        </div>
      </div>
    </div>
  )
}

function ExpenseInput({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [val, setVal] = useState(initial)
  useEffect(() => setVal(initial), [initial])
  return (
    <input
      type="number" step="0.01" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onSave(val)}
      onKeyDown={e => { if (e.key === 'Enter') onSave(val) }}
      style={{ width: 120, textAlign: 'right' }}
      placeholder="0"
    />
  )
}
