import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFeedback, deleteFeedback, updateFeedbackStatus } from '../api/feedback'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'
import MultiSelectFilter from '../components/MultiSelectFilter'
import {
  ALL_FEEDBACK_TOPICS, FEEDBACK_TOPIC_LABELS,
  ALL_FEEDBACK_STATUSES, FEEDBACK_STATUS_LABELS, FEEDBACK_STATUS_BADGES,
} from '../constants/feedback'
import { describePath } from '../utils/path-label'
import { extractApiError } from '../utils/format'
import type { Feedback, FeedbackTopic, FeedbackStatus } from '../types'

/**
 * Вкладка «Обращения» для супервизора. Показывает все сообщения от операторов
 * с расшифровкой пути (например, «/orders/123» → «Заказ #00123») и параметров.
 *
 * Скриншоты доступны inline; клик по миниатюре раскрывает в полном размере.
 */
export default function FeedbackPage() {
  const { showToast } = useToast()
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [topicFilter, setTopicFilter] = useState<FeedbackTopic[]>([])
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus[]>([])
  const [confirmDelete, setConfirmDelete] = useState<Feedback | null>(null)
  const [enlargedScreenshot, setEnlargedScreenshot] = useState<Feedback | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await getFeedback()
      setItems(data)
    } catch (e) {
      showToast(extractApiError(e, 'Не удалось загрузить обращения'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filtered = items.filter(f =>
    (topicFilter.length === 0 || topicFilter.includes(f.topic)) &&
    (statusFilter.length === 0 || statusFilter.includes(f.status))
  )

  const handleStatusChange = async (f: Feedback, newStatus: FeedbackStatus) => {
    try {
      await updateFeedbackStatus(f.id, newStatus)
      setItems(prev => prev.map(x => x.id === f.id ? { ...x, status: newStatus } : x))
    } catch (e) {
      showToast(extractApiError(e, 'Не удалось сменить статус'), 'error')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteFeedback(confirmDelete.id)
      setConfirmDelete(null)
      void load()
      showToast('Обращение удалено', 'success')
    } catch (e) {
      showToast(extractApiError(e, 'Не удалось удалить'), 'error')
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('ru') + ' ' + d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div>
      <div className="page-header">
        <h1>Обращения</h1>
        <div style={{ color: '#7f8c8d', fontSize: '0.9em' }}>
          Всего: {items.length}{topicFilter.length > 0 && ` (показано: ${filtered.length})`}
        </div>
      </div>

      <div className="filters">
        <div className="form-group">
          <label>Тема</label>
          <MultiSelectFilter
            options={ALL_FEEDBACK_TOPICS.map(t => ({ value: t, label: FEEDBACK_TOPIC_LABELS[t] }))}
            searchable
            value={topicFilter}
            onChange={vals => setTopicFilter(vals as FeedbackTopic[])}
            placeholder="Все темы"
            width={260}
          />
        </div>
        <div className="form-group">
          <label>Статус</label>
          <MultiSelectFilter
            options={ALL_FEEDBACK_STATUSES.map(s => ({ value: s, label: FEEDBACK_STATUS_LABELS[s] }))}
            searchable
            value={statusFilter}
            onChange={vals => setStatusFilter(vals as FeedbackStatus[])}
            placeholder="Все статусы"
            width={220}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="empty">Обращений пока нет</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(f => {
            const path = describePath(f.page_path)
            return (
              <div key={f.id} className="card" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span className="badge badge-lead">
                        {FEEDBACK_TOPIC_LABELS[f.topic] || f.topic}
                      </span>
                      <span className={`badge ${FEEDBACK_STATUS_BADGES[f.status] || 'badge-lead'}`}>
                        {FEEDBACK_STATUS_LABELS[f.status] || f.status}
                      </span>
                      <span style={{ color: '#7f8c8d', fontSize: '0.85em' }}>
                        #{f.id} · {formatDate(f.created_at)}
                        {f.submitted_by && ` · ${f.submitted_by}`}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '0.85em', marginBottom: 8,
                      padding: '4px 10px', background: 'var(--c-primary-light)',
                      borderRadius: 4, display: 'inline-block', color: 'var(--c-primary-dark)',
                    }}>
                      {/* Расшифровка пути + клик ведёт прямо на страницу. */}
                      <Link to={path.raw} style={{ color: 'inherit', textDecoration: 'none' }}>
                        📍 {path.label}
                      </Link>
                      {Object.keys(path.params).length > 0 && (
                        <span style={{ marginLeft: 6, fontSize: '0.85em', opacity: 0.85 }}>
                          ({Object.entries(path.params).map(([k, v]) => `${k}=${v}`).join(', ')})
                        </span>
                      )}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{f.body}</div>
                    {f.screenshot && f.screenshot_type && (
                      <div style={{ marginTop: 8 }}>
                        <img
                          src={`data:${f.screenshot_type};base64,${f.screenshot}`}
                          alt="Скриншот"
                          onClick={() => setEnlargedScreenshot(f)}
                          style={{
                            maxWidth: 240, maxHeight: 160, cursor: 'zoom-in',
                            border: '1px solid #ddd', borderRadius: 4, display: 'block',
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    {/* Селект статуса — оператор-супервизор переводит обращение по жизненному циклу. */}
                    <select
                      value={f.status}
                      onChange={e => void handleStatusChange(f, e.target.value as FeedbackStatus)}
                      style={{ width: 'auto', minWidth: 180, fontSize: '0.85em' }}
                    >
                      {ALL_FEEDBACK_STATUSES.map(s => (
                        <option key={s} value={s}>{FEEDBACK_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => setConfirmDelete(f)}
                      title="Удалить обращение"
                    >Удалить</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Модалка для просмотра скриншота в полном размере. */}
      {enlargedScreenshot && enlargedScreenshot.screenshot && enlargedScreenshot.screenshot_type && (
        <div className="modal-overlay" onClick={() => setEnlargedScreenshot(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', padding: 12, borderRadius: 6, maxWidth: '95vw', maxHeight: '95vh', overflow: 'auto',
          }}>
            <img
              src={`data:${enlargedScreenshot.screenshot_type};base64,${enlargedScreenshot.screenshot}`}
              alt="Скриншот"
              style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
            />
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <button className="btn-secondary" onClick={() => setEnlargedScreenshot(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Удалить обращение"
          message={`Удалить обращение #${confirmDelete.id}? Действие необратимо.`}
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { void handleDelete() }}
        />
      )}
    </div>
  )
}
