import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    myRoute, getItemsForDelivery, setItemDeliveryState,
    type RoutePoint, type DeliveryItem,
} from '../../api/worker'

/**
 * Маршрут водителя/логиста на день. Из ответов заказчика (10 мая):
 *   • точки отсортированы по времени (бэкенд это уже делает);
 *   • водитель сам определяет порядок объезда — просто видит, что надо;
 *   • можно распечатать маршрутный лист (общий обзор) и отдельные
 *     накладные на каждого клиента (для подписи получателя).
 *
 * <p>Печать — через {@code window.print()}: окно содержит две секции,
 * каждая с CSS-page-break, чтобы накладные печатались каждая на своём листе.
 * Стили для печати — в этом же файле, scoped к `.print-only`.
 */
export default function WorkerRoutePage() {
    const navigate = useNavigate()
    const [route, setRoute] = useState<RoutePoint[] | null>(null)
    const [error, setError] = useState('')
    // V9: при доставке водитель раскрывает точку и отмечает позиции.
    // expandedOrderId — какая точка сейчас раскрыта. Позиции грузим лениво.
    const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null)
    const [itemsByOrder, setItemsByOrder] = useState<Record<number, DeliveryItem[]>>({})

    const employeeId = Number(sessionStorage.getItem('worker_id') || 0)
    const employeeName = sessionStorage.getItem('worker_name') || ''

    useEffect(() => {
        if (!employeeId) { navigate('/worker-login', { replace: true }); return }
        void reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employeeId])

    const reload = async () => {
        try {
            const data = await myRoute(employeeId)
            setRoute(data)
        } catch {
            setError('Не удалось загрузить маршрут')
        }
    }

    /** Раскрыть точку доставки и подгрузить позиции для отметки. */
    const toggleExpand = async (point: RoutePoint) => {
        if (point.point_type !== 'delivery') return // забор не требует per-item отметки
        if (expandedOrderId === point.order_id) {
            setExpandedOrderId(null)
            return
        }
        setExpandedOrderId(point.order_id)
        if (!itemsByOrder[point.order_id]) {
            try {
                const items = await getItemsForDelivery(employeeId, point.order_id)
                setItemsByOrder(prev => ({ ...prev, [point.order_id]: items }))
            } catch {
                alert('Не удалось загрузить позиции')
            }
        }
    }

    const toggleItemState = async (orderId: number, itemId: number, newState: 'DELIVERED' | 'LOST') => {
        try {
            await setItemDeliveryState(employeeId, itemId, newState)
            setItemsByOrder(prev => ({
                ...prev,
                [orderId]: (prev[orderId] || []).map(i =>
                    i.item_id === itemId ? { ...i, delivery_state: newState } : i
                ),
            }))
        } catch {
            alert('Не удалось сохранить')
        }
    }

    if (!route) {
        return <div style={{ padding: 24, color: '#7f8c8d', textAlign: 'center' }}>Загрузка...</div>
    }

    return (
        <div style={{ background: '#f4f6f7', minHeight: '100vh', paddingBottom: 80 }}>
            {/* CSS для печати: на странице видна только секция .print-only, а в обычном режиме — скрыта */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    .print-page { page-break-after: always; padding: 16px; }
                    .print-page:last-child { page-break-after: auto; }
                    body { background: #fff; }
                }
                .print-only { display: none; }
            `}</style>

            <div className="no-print">
                {/* Шапка */}
                <div style={{
                    background: '#27ae60', color: '#fff', padding: '14px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    position: 'sticky', top: 0, zIndex: 10,
                }}>
                    <div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>Маршрут на сегодня</div>
                        <div style={{ fontSize: 17, fontWeight: 600 }}>{employeeName}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => navigate('/worker')} style={btnLightStyle}>← Услуги</button>
                        <button onClick={() => window.print()} style={btnLightStyle}>🖨 Печать</button>
                    </div>
                </div>

                {error && <div style={{ padding: 16, color: '#c0392b' }}>{error}</div>}

                <div style={{ padding: '12px 16px' }}>
                    {route.length === 0 ? (
                        <div style={{
                            padding: 24, background: '#fff', borderRadius: 10, textAlign: 'center', color: '#7f8c8d',
                        }}>
                            На сегодня точек нет
                        </div>
                    ) : route.map((p, idx) => {
                        const isExpanded = expandedOrderId === p.order_id
                        const items = itemsByOrder[p.order_id] || []
                        const isDelivery = p.point_type === 'delivery'
                        return (
                        <div key={`${p.order_id}-${p.point_type}`} style={{
                            background: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 10,
                            borderLeft: `4px solid ${isDelivery ? '#27ae60' : '#2980b9'}`,
                        }}>
                            <div
                                onClick={() => void toggleExpand(p)}
                                style={{
                                    cursor: isDelivery ? 'pointer' : 'default',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: 11, color: '#7f8c8d', textTransform: 'uppercase' }}>
                                        {idx + 1}. {isDelivery ? 'Доставка' : 'Забор'}
                                        {p.time_slot && ` · ${p.time_slot}`}
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 600, color: '#2c3e50', marginTop: 2 }}>
                                        {p.client_name}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 16, fontWeight: 600 }}>
                                        {Number(p.total_amount).toFixed(0)} ₽
                                    </div>
                                    <div style={{ fontSize: 11, color: p.paid ? '#27ae60' : '#c0392b' }}>
                                        {p.paid ? '✓ оплачен' : 'к получению'}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: 13, color: '#34495e', marginTop: 6 }}>
                                {p.address || '— адрес не указан —'}
                            </div>
                            {p.client_phone && (
                                <a href={`tel:${p.client_phone}`} style={{
                                    display: 'inline-block', marginTop: 6,
                                    fontSize: 14, color: '#2980b9', textDecoration: 'none',
                                }}>
                                    📞 {p.client_phone}
                                </a>
                            )}
                            {/* V9: для точек доставки — раскрытие со списком позиций
                                и отметкой «доставил / не довёз». При нажатии на
                                «✕ не довёз» заказ автоматом перейдёт в
                                PARTIALLY_DELIVERED, оператор увидит проблему на главной. */}
                            {isDelivery && !isExpanded && (
                                <button
                                    type="button"
                                    onClick={() => void toggleExpand(p)}
                                    style={{
                                        marginTop: 10, width: '100%', padding: '10px',
                                        background: '#27ae60', color: '#fff',
                                        border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Отметить доставку
                                </button>
                            )}
                            {isDelivery && isExpanded && (
                                <div style={{ marginTop: 10, borderTop: '1px solid #ecf0f1', paddingTop: 10 }}>
                                    <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 6 }}>
                                        Отметьте каждую позицию: доставили или не довезли.
                                    </div>
                                    {items.length === 0 ? (
                                        <div style={{ fontSize: 13, color: '#7f8c8d' }}>Загрузка...</div>
                                    ) : items.map(it => {
                                        const isDone = it.delivery_state === 'DELIVERED'
                                        const isLost = it.delivery_state === 'LOST'
                                        return (
                                            <div key={it.item_id} style={{
                                                padding: '8px 0', borderBottom: '1px dashed #ecf0f1',
                                            }}>
                                                <div style={{ fontSize: 14, fontWeight: 500, color: '#2c3e50' }}>
                                                    {it.item_type_name}
                                                </div>
                                                {it.description && (
                                                    <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 6 }}>
                                                        {it.description}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => void toggleItemState(p.order_id, it.item_id, 'DELIVERED')}
                                                        style={{
                                                            flex: 1, padding: '8px',
                                                            background: isDone ? '#27ae60' : '#fff',
                                                            color: isDone ? '#fff' : '#27ae60',
                                                            border: '1px solid #27ae60', borderRadius: 6,
                                                            cursor: 'pointer', fontSize: 13, fontWeight: 500,
                                                        }}
                                                    >✓ Доставлено</button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void toggleItemState(p.order_id, it.item_id, 'LOST')}
                                                        style={{
                                                            flex: 1, padding: '8px',
                                                            background: isLost ? '#c0392b' : '#fff',
                                                            color: isLost ? '#fff' : '#c0392b',
                                                            border: '1px solid #c0392b', borderRadius: 6,
                                                            cursor: 'pointer', fontSize: 13, fontWeight: 500,
                                                        }}
                                                    >✕ Не довёз</button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        )
                    })}
                </div>
            </div>

            {/* === ПЕЧАТАЕМАЯ ЧАСТЬ === */}
            <div className="print-only">
                {/* Страница 1 — общий маршрутный лист */}
                <div className="print-page">
                    <h1 style={{ fontSize: 20, marginBottom: 4 }}>Маршрутный лист</h1>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                        {employeeName} · {new Date().toLocaleDateString('ru')}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>№</th>
                                <th style={thStyle}>Тип</th>
                                <th style={thStyle}>Время</th>
                                <th style={thStyle}>Клиент / Адрес</th>
                                <th style={thStyle}>Телефон</th>
                                <th style={thStyle}>Сумма</th>
                                <th style={thStyle}>Подпись</th>
                            </tr>
                        </thead>
                        <tbody>
                            {route.map((p, idx) => (
                                <tr key={`${p.order_id}-${p.point_type}-row`}>
                                    <td style={tdStyle}>{idx + 1}</td>
                                    <td style={tdStyle}>{p.point_type === 'pickup' ? 'Забор' : 'Доставка'}</td>
                                    <td style={tdStyle}>{p.time_slot || '—'}</td>
                                    <td style={tdStyle}>
                                        <div style={{ fontWeight: 600 }}>{p.client_name}</div>
                                        <div style={{ fontSize: 11 }}>{p.address || '—'}</div>
                                    </td>
                                    <td style={tdStyle}>{p.client_phone || '—'}</td>
                                    <td style={tdStyle}>
                                        {p.paid ? '—' : `${Number(p.total_amount).toFixed(0)} ₽`}
                                    </td>
                                    <td style={{ ...tdStyle, width: 100 }}></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ marginTop: 24, fontSize: 12, color: '#666' }}>
                        Итого точек: {route.length} ·
                        К получению наличными:{' '}
                        {route.filter(p => !p.paid).reduce((s, p) => s + Number(p.total_amount), 0).toFixed(0)} ₽
                    </div>
                </div>

                {/* Страницы 2..N — отдельная накладная на каждого клиента (Спринт D.5) */}
                {route.map(p => (
                    <div className="print-page" key={`${p.order_id}-${p.point_type}-invoice`}>
                        <h1 style={{ fontSize: 18, marginBottom: 4 }}>
                            Накладная № {p.order_id}-{p.point_type === 'pickup' ? 'З' : 'Д'}
                        </h1>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
                            от {new Date().toLocaleDateString('ru')}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
                            <tbody>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 600, width: 130 }}>Клиент:</td>
                                    <td style={tdStyle}>{p.client_name}</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 600 }}>Телефон:</td>
                                    <td style={tdStyle}>{p.client_phone || '—'}</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                                        {p.point_type === 'pickup' ? 'Адрес забора:' : 'Адрес доставки:'}
                                    </td>
                                    <td style={tdStyle}>{p.address || '—'}</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 600 }}>Время:</td>
                                    <td style={tdStyle}>{p.time_slot || '—'}</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 600 }}>Сумма заказа:</td>
                                    <td style={tdStyle}>{Number(p.total_amount).toFixed(2)} ₽</td>
                                </tr>
                                <tr>
                                    <td style={{ ...tdStyle, fontWeight: 600 }}>Оплата:</td>
                                    <td style={tdStyle}>
                                        {p.paid
                                            ? `Оплачен ранее${p.payment_type ? ' (' + paymentLabel(p.payment_type) + ')' : ''}`
                                            : '☐ Карта   ☐ Наличные   ☐ Перевод'}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ borderTop: '1px solid #333', width: 200, paddingTop: 4, fontSize: 11 }}>
                                    Подпись клиента
                                </div>
                            </div>
                            <div>
                                <div style={{ borderTop: '1px solid #333', width: 200, paddingTop: 4, fontSize: 11 }}>
                                    Подпись водителя
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function paymentLabel(pt: string): string {
    switch (pt) {
        case 'CARD':     return 'карта'
        case 'CASH':     return 'наличные'
        case 'TRANSFER': return 'перевод'
        default:         return pt
    }
}

const btnLightStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const thStyle: React.CSSProperties = {
    border: '1px solid #333', padding: '6px 8px', textAlign: 'left',
    background: '#f0f0f0', fontWeight: 600,
}
const tdStyle: React.CSSProperties = {
    border: '1px solid #333', padding: '6px 8px', verticalAlign: 'top',
}
