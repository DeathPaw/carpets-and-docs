import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    myServices, myRoute, changeServiceStatus, updateItemDimensions, updateItemDescription, uploadItemPhoto,
    listWorkers,
    type WorkerService, type WorkerListItem,
} from '../../api/worker'
import { t } from '../../i18n'

/** Вкладки списка услуг работника (правка №6). */
type TabKey = 'new' | 'progress' | 'done'

/**
 * Сообщение об ошибке от бэка. Все наши ошибки приходят как {message: "..."},
 * и для работника они куда полезнее, чем «проверьте интернет»: бизнес-правила
 * (не заполнены размеры, услуга не ваша) объясняют, что именно делать.
 * Возвращает null, если это действительно сетевая ошибка без тела ответа.
 */
function serverMessage(e: unknown): string | null {
    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
    return typeof msg === 'string' && msg.trim() ? msg : null
}

/**
 * Служебная позиция (V22): «Приём», «Доставка», «Оформление» — это этапы работы,
 * а не изделия. У них нет размеров, и работает по ним водитель/оператор.
 */
function isServicePosition(s: WorkerService): boolean {
    return ['Приём', 'Прием', 'Доставка', 'Оформление'].includes((s.item_type_name || '').trim())
}

/**
 * Какого размера не хватает, чтобы завершить услугу. Повторяет серверную
 * проверку PricingHelper.checkDimensions — нужна, чтобы сказать работнику
 * о проблеме ДО того, как он снимет фото, а не после отказа сервера.
 * null — всё заполнено (или тип расчёта размеров не требует).
 */
function missingDimension(s: WorkerService): string | null {
    switch (s.pricing_type) {
        case 'BY_WEIGHT': return s.item_weight == null ? 'вес' : null
        case 'BY_AREA': return s.item_area == null ? 'площадь' : null
        case 'BY_PERIMETER': return (s.item_length == null || s.item_width == null) ? 'длина и ширина' : null
        default: return null
    }
}

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
    /** Правка №4: услуга, которую берём/к которой присоединяемся — открывает модалку выбора коллег. */
    const [takeFor, setTakeFor] = useState<any | null>(null)
    // Есть ли у работника точки маршрута на сегодня? Кнопка «Маршрут»
    // показывается только если да — иначе у Анны-чистильщицы она была лишней
    // (фидбэк пользователя). Для логиста/водителя — будет показана автоматически.
    const [hasRoute, setHasRoute] = useState(false)

    const employeeId = Number(sessionStorage.getItem('worker_id') || 0)
    const employeeName = sessionStorage.getItem('worker_name') || ''
    // V11: нераспределённые услуги, подходящие по роли
    const [available, setAvailable] = useState<any[]>([])
    // Правка №6: поиск и фильтр по статусу. При десятках заказов пролистывать
    // один длинный список с телефона неудобно.
    const [search, setSearch] = useState('')
    const [tab, setTab] = useState<TabKey>('progress')
    // Первую вкладку выбираем по данным: если в работе пусто, а взять есть что —
    // сразу открываем «Не взяты», иначе работник видит пустой экран и решает,
    // что заказов нет. Срабатывает один раз, дальше вкладку выбирает человек.
    const [tabPicked, setTabPicked] = useState(false)

    useEffect(() => {
        if (!employeeId) { navigate('/worker-login', { replace: true }); return }
        void reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeId])

    const reload = async () => {
        try {
            const [data, route, avail] = await Promise.all([
                myServices(employeeId),
                myRoute(employeeId).catch(() => []),
                fetch(`/api/worker/${employeeId}/available`).then(r => r.json()).catch(() => []),
            ])
            setServices(data)
            setHasRoute(route.length > 0)
            setAvailable(avail)
            if (!tabPicked) {
                setTabPicked(true)
                const hasInProgress = data.some(s => s.service_status === 'IN_PROGRESS')
                if (!hasInProgress) {
                    const hasNew = data.some(s => s.service_status === 'CREATED') || (avail?.length ?? 0) > 0
                    setTab(hasNew ? 'new' : 'done')
                }
            }
        } catch {
            setError('Не удалось загрузить услуги. Проверьте интернет.')
        }
    }

    /**
     * Взять услугу. Правка №4: если её уже кто-то взял — присоединяемся вторым
     * исполнителем (бэк это разрешает). withIds — коллеги, которые работают
     * вместе со мной: записываем их сразу, чтобы работа засчиталась каждому.
     */
    const takeService = async (serviceId: number, withIds: number[] = []) => {
        try {
            const res = await fetch(`/api/worker/${employeeId}/take/${serviceId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ with_employee_ids: withIds }),
            })
            if (!res.ok) {
                const j = await res.json().catch(() => null)
                alert(j?.error || 'Не удалось взять услугу.')
                return
            }
            await reload()
        } catch {
            alert('Не удалось взять услугу — проверьте интернет.')
        }
    }

    const pickupOrder = async (orderId: number) => {
        try {
            await fetch(`/api/worker/${employeeId}/orders/${orderId}/pickup`, { method: 'POST' })
            await reload()
        } catch {}
    }

    const deliverOrder = async (orderId: number) => {
        try {
            const res = await fetch(`/api/worker/${employeeId}/orders/${orderId}/deliver`, { method: 'POST' })
            const data = await res.json()
            if (data.message) alert(data.message)
            await reload()
        } catch {}
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
        // Правка №6: не даём уйти в фото-модалку, если размеры не заполнены —
        // бэк всё равно откажет, но работник узнает об этом только после съёмки
        // фото, и увидит невнятную ошибку. Говорим сразу и по делу.
        const missing = missingDimension(s)
        if (missing) {
            alert(`Не заполнено: ${missing}. Укажите размеры ковра через «Размеры и описание» и повторите.`)
            return
        }
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
        } catch (e: unknown) {
            alert(serverMessage(e) || 'Не удалось откатить статус.')
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
        } catch (e: unknown) {
            // Раньше здесь безусловно писали «проверьте интернет», и настоящая
            // причина (не заполнены размеры) до работника не доходила — он думал,
            // что проблема со связью, и жал кнопку повторно.
            alert(serverMessage(e) || 'Не удалось сохранить — проверьте интернет и попробуйте ещё раз.')
        }
    }

    if (!services) {
        return <div style={{ padding: 24, color: '#7f8c8d', textAlign: 'center' }}>Загрузка...</div>
    }

    // Правка №6: поиск по номеру заказа / клиенту / типу позиции / названию услуги.
    // Номер сравниваем и как есть, и с ведущими нулями — работник читает его
    // с бирки в виде «#00144», а вводит обычно «144».
    const q = search.trim().toLowerCase()
    const matches = (s: WorkerService) => {
        if (!q) return true
        const digits = q.replace(/\D/g, '')
        if (digits && (String(s.order_id) === String(Number(digits))
            || String(s.order_id).padStart(5, '0').includes(digits))) return true
        return [s.client_name, s.item_type_name, s.service_name, s.item_description]
            .some(v => (v || '').toLowerCase().includes(q))
    }
    const matchesAvailable = (a: any) => {
        if (!q) return true
        const digits = q.replace(/\D/g, '')
        if (digits && (String(a.order_id) === String(Number(digits))
            || String(a.order_id).padStart(5, '0').includes(digits))) return true
        return [a.client_name, a.item_type_name, a.service_name]
            .some((v: string | null) => (v || '').toLowerCase().includes(q))
    }

    // Вкладки. «Не взяты» = свободные услуги + назначенные на меня, но не начатые.
    const availableFiltered = available.filter(matchesAvailable)
    const notStarted = services.filter(s => s.service_status === 'CREATED').filter(matches)
    const inProgress = services.filter(s => s.service_status === 'IN_PROGRESS').filter(matches)
    const done       = services.filter(s => s.service_status === 'DONE').filter(matches)

    const TABS: { key: TabKey; label: string; count: number }[] = [
        { key: 'new',      label: 'Не взяты', count: availableFiltered.length + notStarted.length },
        { key: 'progress', label: 'В работе', count: inProgress.length },
        { key: 'done',     label: 'Завершены', count: done.length },
    ]

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

            {/* V11: кнопки Забрал/Доставил для водителей */}
            {hasRoute && (
                <div style={{ padding: '8px 16px', display: 'flex', gap: 8 }}>
                    <button
                        onClick={() => {
                            const oid = prompt('Номер заказа для забора:')
                            if (oid) void pickupOrder(Number(oid))
                        }}
                        style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none',
                                 background: '#3498db', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
                    >📦 Забрал</button>
                    <button
                        onClick={() => {
                            const oid = prompt('Номер заказа для доставки:')
                            if (oid) void deliverOrder(Number(oid))
                        }}
                        style={{ flex: 1, padding: '12px', borderRadius: 8, border: 'none',
                                 background: '#27ae60', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
                    >🚚 Доставил</button>
                </div>
            )}

            {/* Правка №6: поиск по заказам. Крупное поле — пальцем на телефоне. */}
            <div style={{ padding: '10px 16px 0' }}>
                <div style={{ position: 'relative' }}>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Поиск: номер заказа, клиент, тип…"
                        inputMode="search"
                        style={{
                            width: '100%', padding: '11px 34px 11px 12px', fontSize: 16,
                            border: '1px solid #d6dbdf', borderRadius: 8, boxSizing: 'border-box',
                        }}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            aria-label="Очистить поиск"
                            style={{
                                position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', fontSize: 20, color: '#95a5a6',
                                cursor: 'pointer', padding: '0 8px', lineHeight: 1,
                            }}
                        >&times;</button>
                    )}
                </div>
            </div>

            {/* Правка №6: вкладки статусов. */}
            <div style={{ display: 'flex', gap: 6, padding: '10px 16px 0' }}>
                {TABS.map(tb => (
                    <button
                        key={tb.key}
                        onClick={() => setTab(tb.key)}
                        style={{
                            flex: 1, padding: '9px 4px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                            cursor: 'pointer',
                            border: `1px solid ${tab === tb.key ? '#2c3e50' : '#d6dbdf'}`,
                            background: tab === tb.key ? '#2c3e50' : '#fff',
                            color: tab === tb.key ? '#fff' : '#7f8c8d',
                        }}
                    >
                        {tb.label}
                        <span style={{ opacity: 0.75, marginLeft: 4 }}>{tb.count}</span>
                    </button>
                ))}
            </div>

            {/* Вкладка «Не взяты»: свободные услуги (можно взять) + мои ещё не начатые. */}
            {tab === 'new' && (
                <div style={{ padding: '12px 16px' }}>
                    {availableFiltered.length === 0 && notStarted.length === 0 ? (
                        <EmptyState text={search ? 'По запросу ничего не найдено' : 'Нет доступных услуг'} />
                    ) : (
                        <>
                            {/* Правка №4: занятые коллегами услуги теперь тоже видны —
                                к ним можно присоединиться (совместная стирка одного ковра).
                                Свободные оранжевые, занятые серые с именами исполнителей. */}
                            {availableFiltered.map((a: any) => (
                                <div key={`avail-${a.service_id}`} style={{
                                    background: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                                    border: `1px dashed ${a.is_taken ? '#bdc3c7' : '#f39c12'}`,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                                }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 600 }}>{a.service_name}</div>
                                        <div style={{ fontSize: 12, color: '#7f8c8d' }}>
                                            {a.item_type_name} · Заказ #{String(a.order_id).padStart(5, '0')} · {a.client_name}
                                        </div>
                                        {a.is_taken && (
                                            <div style={{ fontSize: 12, color: '#e67e22', marginTop: 2 }}>
                                                Уже в работе: {a.assignee_names || '—'}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setTakeFor(a)}
                                        style={{ padding: '8px 14px', borderRadius: 6, border: 'none', whiteSpace: 'nowrap',
                                                 background: a.is_taken ? '#7f8c8d' : '#f39c12',
                                                 color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                                    >{a.is_taken ? 'Присоединиться' : 'Взять'}</button>
                                </div>
                            ))}
                            {notStarted.map(s => (
                                <ServiceCard
                                    key={s.service_id}
                                    s={s}
                                    onAdvance={() => void advance(s)}
                                    onEdit={() => setEditing(s)}
                                    onUndo={() => void undoStatus(s)}
                                />
                            ))}
                        </>
                    )}
                </div>
            )}

            {tab === 'progress' && (
                <div style={{ padding: '12px 16px' }}>
                    {inProgress.length === 0 ? (
                        <EmptyState text={search ? 'По запросу ничего не найдено' : t('home.empty')} />
                    ) : inProgress.map(s => (
                        <ServiceCard
                            key={s.service_id}
                            s={s}
                            onAdvance={() => void advance(s)}
                            onEdit={() => setEditing(s)}
                            onUndo={() => void undoStatus(s)}
                        />
                    ))}
                </div>
            )}

            {tab === 'done' && (
                <div style={{ padding: '12px 16px' }}>
                    {done.length === 0 ? (
                        <EmptyState text={search ? 'По запросу ничего не найдено' : 'Завершённых пока нет'} />
                    ) : done.map(s => (
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

            {takeFor && (
                <TakeServiceModal
                    a={takeFor}
                    myId={employeeId}
                    onClose={() => setTakeFor(null)}
                    onTake={async ids => { setTakeFor(null); await takeService(takeFor.service_id, ids) }}
                />
            )}
        </div>
    )
}

/** Заглушка пустого списка — одинаковая на всех вкладках. */
function EmptyState({ text }: { text: string }) {
    return (
        <div style={{ padding: 24, background: '#fff', borderRadius: 10, textAlign: 'center', color: '#7f8c8d' }}>
            {text}
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
                    {/* Правка №7: на служебных позициях (Приём/Доставка/Оформление)
                        размеров нет, а правит их водитель на этапе развозки — можно
                        случайно затереть данные, уже уточнённые на производстве.
                        Кнопку там не показываем; водителю остаются фото и завершение. */}
                    {!isServicePosition(s) && (
                        <button onClick={onEdit} style={{
                            flex: 1, padding: '10px',
                            background: '#fff', color: '#2c3e50',
                            border: '1px solid #d6dbdf', borderRadius: 6, fontSize: 13,
                            cursor: 'pointer',
                        }}>
                            {t('home.dimensions')}
                        </button>
                    )}
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
/**
 * Правка №4: взятие услуги в работу с возможностью указать коллег.
 *
 * Если услугу уже кто-то взял — модалка показывает, кто именно, и предлагает
 * присоединиться. Плюс можно отметить тех, кто моет ковёр вместе с тобой:
 * без этого вторым исполнителем мог назначить только оператор из веба.
 */
function TakeServiceModal({ a, myId, onClose, onTake }: {
    a: any
    myId: number
    onClose: () => void
    onTake: (withIds: number[]) => void | Promise<void>
}) {
    const [workers, setWorkers] = useState<WorkerListItem[]>([])
    const [picked, setPicked] = useState<number[]>([])
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        listWorkers().then(setWorkers).catch(() => setWorkers([]))
    }, [])

    // Себя не показываем (мы и так становимся исполнителем) и тех, кто уже взял.
    const alreadyNames = (a.assignee_names || '').split(',').map((x: string) => x.trim()).filter(Boolean)
    const candidates = workers.filter(w => w.id !== myId && !alreadyNames.includes(w.name))

    return (
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>{a.is_taken ? 'Присоединиться к работе' : 'Взять в работу'}</h3>
                <div style={{ fontSize: 13, marginBottom: 4 }}>{a.service_name}</div>
                <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 12 }}>
                    {a.item_type_name} · Заказ #{String(a.order_id).padStart(5, '0')} · {a.client_name}
                </div>
                {a.is_taken && (
                    <div style={{
                        background: '#fef5e7', border: '1px solid #f5cba7', borderRadius: 6,
                        padding: '8px 10px', fontSize: 13, marginBottom: 12, color: '#7d6608',
                    }}>
                        Уже работает: {a.assignee_names || '—'}. Вы добавитесь как ещё один исполнитель.
                    </div>
                )}

                <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 6 }}>
                    Кто работает вместе с вами? (необязательно)
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
                    {candidates.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#95a5a6' }}>Других сотрудников нет</div>
                    ) : candidates.map(w => {
                        const on = picked.includes(w.id)
                        return (
                            <label key={w.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
                                border: `1px solid ${on ? '#3498db' : '#e6e9ea'}`, borderRadius: 6,
                                marginBottom: 6, background: on ? '#eaf4fc' : '#fff', cursor: 'pointer',
                            }}>
                                <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => setPicked(p => on ? p.filter(x => x !== w.id) : [...p, w.id])}
                                    style={{ width: 18, height: 18 }}
                                />
                                <span style={{ fontSize: 14 }}>{w.name}</span>
                                {w.role_name && <span style={{ fontSize: 11, color: '#95a5a6' }}>{w.role_name}</span>}
                            </label>
                        )
                    })}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={onClose} style={{
                        flex: 1, padding: 12, background: '#fff', border: '1px solid #3498db', color: '#2980b9',
                        borderRadius: 6, cursor: 'pointer',
                    }}>Отмена</button>
                    <button
                        disabled={busy}
                        onClick={async () => { setBusy(true); await onTake(picked) }}
                        style={{
                            flex: 2, padding: 12, background: '#27ae60', color: '#fff',
                            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
                        }}
                    >{busy ? '...' : (a.is_taken ? 'Присоединиться' : 'Взять в работу')}</button>
                </div>
            </div>
        </div>
    )
}

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

    // Автопересчёт площади при вводе длины/ширины — как в OrderDetailPage.
    // Раньше на мобилке площадь не двигалась после изменения размеров, и оператор
    // молча уходил с несогласованными значениями (или считал в уме). Теперь если
    // введены и длина, и ширина — площадь пересчитывается. Для круглых/овальных
    // ковров оператор оставляет L/W пустыми и вводит площадь руками.
    const onLengthChange = (v: string) => {
        setLength(v)
        const l = v ? Number(v) : null
        const w = width ? Number(width) : null
        if (l != null && !isNaN(l) && w != null && !isNaN(w)) {
            setArea(String(Math.round(l * w * 100) / 100))
        }
    }
    const onWidthChange = (v: string) => {
        setWidth(v)
        const l = length ? Number(length) : null
        const w = v ? Number(v) : null
        if (l != null && !isNaN(l) && w != null && !isNaN(w)) {
            setArea(String(Math.round(l * w * 100) / 100))
        }
    }

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
        } catch (e: unknown) {
            alert(serverMessage(e) || 'Не удалось сохранить — проверьте интернет.')
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
                    <Field label="Длина, м"  value={length} onChange={onLengthChange} />
                    <Field label="Ширина, м" value={width}  onChange={onWidthChange} />
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
                    <button onClick={onClose} style={{ flex: 1, padding: 12, background: '#fff', border: '1px solid #3498db', color: '#2980b9', borderRadius: 6, cursor: 'pointer' }}>Отмена</button>
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
