import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { onApiSuccess, type ApiSuccessEvent } from '../api/events'
import { SCENARIOS, type ChallengeScenario, type Trigger } from './challenges'

/**
 * Боковая панель «Челлендж» — активная тренировка оператора.
 *
 * <p>Появляется справа когда пользователь выбрал сценарий в баннере. Внутри:
 *   • заголовок сценария и описание;
 *   • прогресс «3 из 5»;
 *   • список шагов: ✓ выполненные / → текущий с раскрытой подсказкой / □ будущие;
 *   • кнопки «Отмена» и «Заново».
 *
 * <p>Шаги отмечаются автоматически:
 *   • `route` — слушаем useLocation;
 *   • `api` — слушаем API-шину (axios response интерсептор);
 *   • `manual` — отдельная кнопка «Я сделал» в подсказке текущего шага.
 *
 * <p>Сценарий выбирается через проп `scenarioId | null`. После завершения
 * вызывается `onClose()` — обычно баннер сбрасывает scenarioId.
 */
export default function ChallengePanel({
    scenarioId,
    onClose,
}: {
    scenarioId: string | null
    onClose: () => void
}) {
    const location = useLocation()
    const [stepIndex, setStepIndex] = useState(0)
    const [completed, setCompleted] = useState(false)

    const scenario: ChallengeScenario | null =
        scenarioId ? SCENARIOS.find(s => s.id === scenarioId) ?? null : null

    // Текущий шаг — в ref'е, чтобы листенер API не пересоздавался каждое обновление.
    const stepRef = useRef(stepIndex)
    stepRef.current = stepIndex

    // Сброс при смене сценария.
    useEffect(() => {
        setStepIndex(0)
        setCompleted(false)
    }, [scenarioId])

    // Проверка триггера. Возвращает true если шаг закрылся этим событием.
    const matchTrigger = (trigger: Trigger, event: { kind: 'route'; pathname: string } | { kind: 'api'; ev: ApiSuccessEvent }): boolean => {
        if (trigger.type === 'route' && event.kind === 'route') {
            const p = trigger.pathname
            if (typeof p === 'string') return event.pathname === p
            return p.test(event.pathname)
        }
        if (trigger.type === 'api' && event.kind === 'api') {
            if (event.ev.method !== trigger.method) return false
            if (event.ev.status < 200 || event.ev.status >= 300) return false
            if (!trigger.urlPattern.test(event.ev.url)) return false
            if (trigger.predicate) {
                return trigger.predicate(event.ev.requestData, event.ev.responseData)
            }
            return true
        }
        return false
    }

    const advanceIfMatch = (event: { kind: 'route'; pathname: string } | { kind: 'api'; ev: ApiSuccessEvent }) => {
        if (!scenario) return
        const i = stepRef.current
        if (i >= scenario.steps.length) return
        const step = scenario.steps[i]
        if (matchTrigger(step.trigger, event)) {
            const nextIdx = i + 1
            setStepIndex(nextIdx)
            if (nextIdx >= scenario.steps.length) setCompleted(true)
        }
    }

    // Слушаем смены маршрута.
    useEffect(() => {
        if (!scenario) return
        advanceIfMatch({ kind: 'route', pathname: location.pathname })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname, scenarioId])

    // Слушаем API-шину.
    useEffect(() => {
        if (!scenario) return
        const unsub = onApiSuccess(ev => {
            advanceIfMatch({ kind: 'api', ev })
        })
        return unsub
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scenarioId])

    // Сдвигаем main-content вправо, когда панель открыта — иначе она перекрывает
    // правую колонку (это было замечено на скриншоте: панель закрыла кнопки заказа).
    // Делаем через переменную CSS, которую Layout прикладывает к main-content.
    useEffect(() => {
        if (scenario) {
            document.body.style.setProperty('--challenge-panel-width', '340px')
        } else {
            document.body.style.removeProperty('--challenge-panel-width')
        }
        return () => { document.body.style.removeProperty('--challenge-panel-width') }
    }, [scenario])

    if (!scenario) return null

    const total = scenario.steps.length

    return (
        <aside
            style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 340,
                background: '#fff',
                borderLeft: '1px solid #d6dbdf',
                boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.08)',
                zIndex: 9000,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* Шапка с цветной плашкой */}
            <div style={{ background: '#16a085', color: '#fff', padding: '12px 16px' }}>
                <div style={{ fontSize: 11, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Челлендж
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{scenario.title}</div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4, lineHeight: 1.35 }}>
                    {scenario.description}
                </div>
            </div>

            {/* Прогресс-бар */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #ecf0f1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7f8c8d', marginBottom: 4 }}>
                    <span>{completed ? 'Готово' : `Шаг ${Math.min(stepIndex + 1, total)} из ${total}`}</span>
                    <span>{stepIndex} / {total}</span>
                </div>
                <div style={{ height: 6, background: '#ecf0f1', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${(stepIndex / total) * 100}%`,
                        background: '#16a085',
                        transition: 'width 0.4s',
                    }} />
                </div>
            </div>

            {/* Список шагов */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {scenario.steps.map((step, idx) => {
                    const isDone = idx < stepIndex
                    const isCurrent = idx === stepIndex && !completed
                    return (
                        <div
                            key={idx}
                            style={{
                                padding: '10px 0',
                                borderBottom: '1px dashed #ecf0f1',
                                opacity: isDone ? 0.55 : 1,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <span style={{
                                    flex: '0 0 22px',
                                    height: 22,
                                    borderRadius: 11,
                                    background: isDone ? '#27ae60' : isCurrent ? '#3498db' : '#ecf0f1',
                                    color: isDone || isCurrent ? '#fff' : '#7f8c8d',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginTop: 1,
                                }}>
                                    {isDone ? '✓' : idx + 1}
                                </span>
                                <div style={{ flex: 1 }}>
                                    <div style={{
                                        fontSize: 13,
                                        fontWeight: isCurrent ? 600 : 500,
                                        color: isDone ? '#7f8c8d' : '#2c3e50',
                                        lineHeight: 1.3,
                                    }}>
                                        {step.title}
                                    </div>
                                    {isCurrent && (
                                        <>
                                            <div style={{
                                                fontSize: 12,
                                                color: '#5d6d7e',
                                                marginTop: 6,
                                                lineHeight: 1.45,
                                            }}>
                                                {step.hint}
                                            </div>
                                            {step.trigger.type === 'manual' && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const nextIdx = idx + 1
                                                        setStepIndex(nextIdx)
                                                        if (nextIdx >= total) setCompleted(true)
                                                    }}
                                                    style={{
                                                        marginTop: 8,
                                                        background: '#3498db',
                                                        color: '#fff',
                                                        border: 'none',
                                                        padding: '5px 12px',
                                                        borderRadius: 4,
                                                        fontSize: 12,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    Я сделал — дальше
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}

                {completed && (
                    <div style={{
                        marginTop: 16,
                        padding: '12px 14px',
                        background: '#e8f8f5',
                        border: '1px solid #16a085',
                        borderRadius: 6,
                    }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0e6655', marginBottom: 4 }}>
                            Сценарий пройден
                        </div>
                        <div style={{ fontSize: 12, color: '#196f3d' }}>
                            Отличная работа! Можно попробовать ещё один или закрыть панель.
                        </div>
                    </div>
                )}
            </div>

            {/* Низ — кнопки управления */}
            <div style={{
                padding: '10px 16px',
                borderTop: '1px solid #ecf0f1',
                display: 'flex',
                gap: 8,
            }}>
                <button
                    type="button"
                    onClick={() => { setStepIndex(0); setCompleted(false) }}
                    style={{
                        flex: 1,
                        padding: '8px',
                        border: '1px solid #d6dbdf',
                        background: '#fff',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 13,
                    }}
                    title="Начать сценарий с первого шага"
                >
                    Заново
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        flex: 1,
                        padding: '8px',
                        border: '1px solid #d6dbdf',
                        background: '#fff',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 13,
                    }}
                >
                    Закрыть
                </button>
            </div>
        </aside>
    )
}
