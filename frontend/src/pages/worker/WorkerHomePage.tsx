import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    myServices, myRoute, changeServiceStatus, updateItemDimensions, updateItemDescription, uploadItemPhoto,
    type WorkerService,
} from '../../api/worker'
import { t } from '../../i18n'

/**
 * Главный экран работника после входа — список услуг, назначенных мне.
 *
 * <p>Что может делать (см. ответы заказчика 10 мая):
 *   • менять статус услуги (CREATED → IN_PROGRESS → DONE);
 *   • при смене статуса — модалка с фото (обязательно появляется,
 *     можно «Пропустить»);
 *   • править размеры, описание и дефекты позиции (фактика может отличаться
 *     от того, что внёс оператор);
 *   • видит все услуги, но менять может только свои (на бэке проверяется).
 *
 * <p>UX простой — крупные кнопки, минимум текста. Для пользователей без
 * опыта работы с веб-приложениями.
 */
export default function WorkerHomePage() {
    const navigate = useNavigate()
    const [services, setServices] = useState<WorkerService[] | null>(null)
    const [error, setError] = useState('')
    const [photoFor, setPhotoFor] = useState<{ item: WorkerService; afterStatus: 'IN_PROGRESS' | 'DONE' } | null>(null)
    const [editing, setEditing] = useState<WorkerService | null>(null)
    // Есть ли у работника точки маршрута на сегодня? Кнопка «Маршрут»
    // показывается только если да — иначе у Анны-чистильщицы она была лишней
    // (фидбэк пользователя). Для логиста/водителя — будет показана автоматически.
    const [hasRoute, setHasRoute] = useState(false)

    const employeeId = Number(sessionStorage.getItem('worker_id') || 0)
    const employeeName = sessionStorage.getItem('worker_name') || ''

    useEffect(() => {
        if (!employeeId) { navigate('/worker-login', { replace: true }); return }
        void reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeId])

    const reload = async () => {
        try {
            const [data, route] = await Promise.all([
                myServices(employeeId),
                myRoute(employeeId).catch(() => []), // если route не загрузился — просто не показываем кнопку
            ])
            setServices(data)
            setHasRoute(route.length > 0)
        } catch {
            setError('Не удалось загрузить услуги. Проверьте интернет.')
        }
    }

    const logout = () => {
        sessionStorage.removeItem('worker_id')
        sessionStorage.removeItem('worker_name')
        navigate('/worker-login')
    }

    const advance = async (s: WorkerService) => {
        // Кнопка перехода:
        //   CREATED → IN_PROGRESS («Взять в работу»)
        //   IN_PROGRESS → DONE («Завершить»)
        // На каждом — поднимаем модалку фото «до/после».
        const next: 'IN_PROGRESS' | 'DONE' | null =
            s.service_status === 'CREATED' ? 'IN_PROGRESS' :
            s.service_status === 'IN_PROGRESS' ? 'DONE' : null
        if (!next) return
        setPhotoFor({ item: s, afterStatus: next })
    }

    /**
     * Откат статуса на один шаг назад. Срабатывает только если работник ошибся:
     * DONE → IN_PROGRESS, IN_PROGRESS → CREATED. Откат CREATED никуда не идёт.
     * Фото-модалку не показываем — это исправление, а не новая стадия.
     */
    const undoStatus = async (s: WorkerService) => {
        const back: 'CREATED' | 'IN_PROGRESS' | null =
            s.service_status === 'DONE' ? 'IN_PROGRESS' :
            s.service_status === 'IN_PROGRESS' ? 'CREATED' : null
        if (!back) return
        if (!window.confirm(t('home.undo.confirm'))) return
        try {
            await changeServiceStatus(employeeId, s.service_id, back)
            await reload()
        } catch {
            alert('Не удалось откатить статус.')
        }
    }

    const submitWithPhoto = async (photoData: string | null) => {
        if (!photoFor) return
        const { item, afterStatus } = photoFor
        try {
            if (photoData) {
                await uploadItemPhoto(employeeId, item.item_id, {
                    filename: `photo-${afterStatus.toLowerCase()}-${Date.now()}.jpg`,
                    content_type: 'image/jpeg',
                    data: photoData,
                })
            }
            await changeServiceStatus(employeeId, item.service_id, afterStatus)
            setPhotoFor(null)
            await reload()
        } catch {
            alert('Не удалось сохранить — проверьте интернет и попробуйте ещё раз.')
        }
    }

    if (!services) {
        return <div style={{ padding: 24, color: '#7f8c8d', textAlign: 'center' }}>Загрузка...</div>
    }

    const active = services.filter(s => s.service_status !== 'DONE')
    const done   = services.filter(s => s.service_status === 'DONE')

    return (
        <div style={{ background: '#f4f6f7', minHeight: '100vh', paddingBottom: 80 }}>
            {/* Шапка */}
            <div style={{
                background: '#2c3e50', color: '#fff', padding: '14px 16px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                position: 'sticky', top: 0, zIndex: 10,
            }}>
                <div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{t('home.hello')}</div>
                    <div style={{ fontSize: 17, fontWeight: 600 }}>{employeeName}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {hasRoute && (
                        <button onClick={() => navigate('/worker/route')} style={{
                            background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
                            padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                        }}>🚗 {t('route.title')}</button>
                    )}
                    <button onClick={logout} style={{
                        background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
                        padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                    }}>{t('home.logout')}</button>
                </div>
            </div>

            {error && <div style={{ padding: '10px 16px', color: '#c0392b' }}>{error}</div>}

            {/* Активные услуги */}
            <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                    {t('home.today')} · {active.length}
                </div>
                {active.length === 0 ? (
                    <div style={{
                        padding: 24, background: '#fff', borderRadius: 10, textAlign: 'center', color: '#7f8c8d',
                    }}>
                        {t('home.empty')}
                    </div>
                ) : active.map(s => (
                    <ServiceCard
                        key={s.service_id}
                        s={s}
                        onAdvance={() => void advance(s)}
                        onEdit={() => setEditing(s)}
                        onUndo={() => void undoStatus(s)}
                    />
                ))}
            </div>

            {/* Готовые */}
            {done.length > 0 && (
                <div style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: '#27ae60', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                        ✓ {t('home.done')} · {done.length}
                    </div>
                    {done.map(s => (
                        <ServiceCard
                            key={s.service_id}
                            s={s}
                            onAdvance={() => {}}
                            onEdit={() => setEditing(s)}
                            onUndo={() => void undoStatus(s)}
                            compact
                        />
                    ))}
                </div>
            )}

            {photoFor && (
                <PhotoModal
                    title={photoFor.afterStatus === 'IN_PROGRESS' ? t('photo.before') : t('photo.after')}
                    onClose={() => setPhotoFor(null)}
                    onSubmit={submitWithPhoto}
                />
            )}

            {editing && (
                <EditItemModal
                    s={editing}
                    employeeId={employeeId}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); void reload() }}
                />
            )}
        </div>
    )
}

/** Карточка услуги в списке. */
function ServiceCard({ s, onAdvance, onEdit, onUndo, compact }: {
    s: WorkerService
    onAdvance: () => void
    onEdit: () => void
    /** Откат на один статус назад. Доступен для IN_PROGRESS (→ CREATED)
     *  и DONE (→ IN_PROGRESS). Для CREATED — нет (некуда откатывать). */
    onUndo: () => void
    compact?: boolean
}) {
    const colorByStatus: Record<string, string> = {
        CREATED:     '#7f8c8d',
        IN_PROGRESS: '#3498db',
        DONE:        '#27ae60',
    }
    const labelByStatus: Record<string, string> = {
        CREATED:     t('home.status.created'),
        IN_PROGRESS: t('home.status.in_progress'),
        DONE:        t('home.status.done'),
    }
    const advLabel: Record<string, string> = {
        CREATED:     t('home.take'),
        IN_PROGRESS: t('home.complete'),
    }
    return (
        <div style={{
            background: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 10,
            borderLeft: `4px solid ${colorByStatus[s.service_status] || '#bdc3c7'}`,
            opacity: compact ? 0.7 : 1,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#2c3e50' }}>
                    {s.service_name} — {s.item_type_name}
                </div>
                <span style={{
                    fontSize: 11, color: colorByStatus[s.service_status],
                    fontWeight: 500, whiteSpace: 'nowrap',
                }}>{labelByStatus[s.service_status]}</span>
            </div>
            <div style={{ fontSize: 13, color: '#7f8c8d', marginTop: 2 }}>
                Заказ #{s.order_id} · {s.client_name}
            </div>
            {s.item_description && (
                <div style={{ fontSize: 13, marginTop: 6, color: '#34495e' }}>{s.item_description}</div>
            )}
            {(s.item_length || s.item_width || s.item_area || s.item_weight) && (
                <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 4 }}>
                    {s.item_length && `${s.item_length}×${s.item_width || '?'} м`}
                    {s.item_area && ` (${s.item_area} м²)`}
                    {s.item_weight && ` · ${s.item_weight} кг`}
                </div>
            )}
            {s.item_defects && (
                <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>
                    Дефекты: {s.item_defects}
                </div>
            )}
            {!compact && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'stretch' }}>
                    {advLabel[s.service_status] && (
                        <button onClick={onAdvance} style={{
                            flex: 2, padding: '10px',
                            background: '#3498db', color: '#fff',
                            border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500,
                            cursor: 'pointer',
                        }}>
                            {advLabel[s.service_status]}
                        </button>
                    )}
                    <button onClick={onEdit} style={{
                        flex: 1, padding: '10px',
                        background: '#fff', color: '#2c3e50',
                        border: '1px solid #d6dbdf', borderRadius: 6, fontSize: 13,
                        cursor: 'pointer',
                    }}>
                        {t('home.dimensions')}
                    </button>
                    {/* Откат — серая иконка ↶, только когда есть куда откатывать
                        (IN_PROGRESS → CREATED). Решение пользователя 11 мая:
                        «можно только завершить, нельзя отменить» — поправили. */}
                    {s.service_status === 'IN_PROGRESS' && (
                        <button onClick={onUndo} title={t('home.undo')} style={undoBtnStyle}>↶</button>
                    )}
                </div>
            )}
            {compact && s.service_status === 'DONE' && (
                <div style={{ marginTop: 8, textAlign: 'right' }}>
                    <button onClick={onUndo} title={t('home.undo')} style={{
                        ...undoBtnStyle, padding: '4px 10px', fontSize: 13,
                    }}>↶ {t('home.undo')}</button>
                </div>
            )}
        </div>
    )
}

/** Модалка для фото. Обязательно появляется при смене статуса; можно пропустить. */
function PhotoModal({ title, onClose, onSubmit }: {
    title: string
    onClose: () => void
    onSubmit: (photoBase64: string | null) => void
}) {
    const [data, setData] = useState<string | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    const onFile = (f: File) => {
        const reader = new FileReader()
        reader.onload = e => {
            const dataUrl = e.target?.result as string
            setPreview(dataUrl)
            // Убираем префикс `data:image/...;base64,` — бэк ожидает чистый base64.
            const i = dataUrl.indexOf(',')
            setData(i >= 0 ? dataUrl.slice(i + 1) : dataUrl)
        }
        reader.readAsDataURL(f)
    }

    return (
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
                <h3 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h3>
                {preview ? (
                    <img src={preview} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 6, marginBottom: 12 }} />
                ) : (
                    <label style={{
                        display: 'block', padding: '40px 12px', textAlign: 'center',
                        background: '#f8f9fa', border: '2px dashed #d6dbdf', borderRadius: 8,
                        cursor: 'pointer', marginBottom: 12, color: '#7f8c8d',
                    }}>
                        <input type="file" accept="image/*" capture="environment"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
                        />
                        {t('photo.take')}
                    </label>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => onSubmit(null)} style={{
                        flex: 1, padding: '12px', background: '#fff',
                        border: '1px solid #bdc3c7', borderRadius: 6, cursor: 'pointer',
                    }}>{t('common.skip')}</button>
                    <button onClick={() => onSubmit(data)} disabled={!data} style={{
                        flex: 1, padding: '12px',
                        background: data ? '#3498db' : '#bdc3c7', color: '#fff',
                        border: 'none', borderRadius: 6, cursor: data ? 'pointer' : 'not-allowed',
                    }}>{t('photo.save')}</button>
                </div>
            </div>
        </div>
    )
}

/** Модалка редактирования размеров/описания/дефектов позиции. */
function EditItemModal({ s, employeeId, onClose, onSaved }: {
    s: WorkerService
    employeeId: number
    onClose: () => void
    onSaved: () => void
}) {
    const [length, setLength]     = useState(s.item_length?.toString() || '')
    const [width, setWidth]       = useState(s.item_width?.toString() || '')
    const [area, setArea]         = useState(s.item_area?.toString() || '')
    const [weight, setWeight]     = useState(s.item_weight?.toString() || '')
    const [description, setDesc]  = useState(s.item_description || '')
    const [defects, setDefects]   = useState(s.item_defects || '')
    const [saving, setSaving]     = useState(false)

    const save = async () => {
        setSaving(true)
        try {
            await updateItemDimensions(employeeId, s.item_id, {
                length: length ? Number(length) : null,
                width:  width  ? Number(width)  : null,
                area:   area   ? Number(area)   : null,
                weight: weight ? Number(weight) : null,
            })
            await updateItemDescription(employeeId, s.item_id, { description, defects })
            onSaved()
        } catch {
            alert('Не удалось сохранить — проверьте интернет.')
            setSaving(false)
        }
    }

    return (
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>Размеры и описание</h3>
                <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 12 }}>
                    {s.item_type_name} в заказе #{s.order_id} ({s.client_name})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Field label="Длина, м"  value={length} onChange={setLength} />
                    <Field label="Ширина, м" value={width}  onChange={setWidth} />
                    <Field label="Площадь, м²" value={area} onChange={setArea} />
                    <Field label="Вес, кг"   value={weight} onChange={setWeight} />
                </div>
                <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, color: '#7f8c8d', display: 'block', marginBottom: 4 }}>Описание</label>
                    <textarea rows={2} value={description} onChange={e => setDesc(e.target.value)} style={textareaStyle} />
                </div>
                <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 12, color: '#7f8c8d', display: 'block', marginBottom: 4 }}>Дефекты</label>
                    <textarea rows={2} value={defects} onChange={e => setDefects(e.target.value)} style={textareaStyle} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: 12, background: '#fff', border: '1px solid #bdc3c7', borderRadius: 6, cursor: 'pointer' }}>Отмена</button>
                    <button onClick={save} disabled={saving} style={{ flex: 1, padding: 12, background: '#27ae60', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        {saving ? '...' : 'Сохранить'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <label style={{ fontSize: 11, color: '#7f8c8d', display: 'block', marginBottom: 4 }}>{label}</label>
            <input type="number" step="0.01" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: 10, fontSize: 16, border: '1px solid #d6dbdf', borderRadius: 6, boxSizing: 'border-box' }} />
        </div>
    )
}

const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 16,
}
const modalContentStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: 16,
    width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto',
}
const textareaStyle: React.CSSProperties = {
    width: '100%', padding: 10, fontSize: 14, border: '1px solid #d6dbdf', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical',
}
/** Кнопка-стрелка отката статуса — серый «вторичный» стиль. */
const undoBtnStyle: React.CSSProperties = {
    padding: '0 14px', minWidth: 44,
    background: '#fff', color: '#7f8c8d',
    border: '1px solid #d6dbdf', borderRadius: 6, fontSize: 18,
    cursor: 'pointer', fontWeight: 500,
}
