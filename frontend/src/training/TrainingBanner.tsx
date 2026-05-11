import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import client from '../api/client'
import { resetTourProgress } from './index'
import TrainingTour, { type TourMode } from './TrainingTour'
import { pageScenarioFor } from './tourSteps'
import ChallengePanel from './ChallengePanel'
import { SCENARIOS } from './challenges'

/**
 * Зелёный баннер сверху, видим только в режиме тренажёра (см. isTrainingMode).
 *
 * <p>Управляет тремя инструментами обучения:
 *   1. <b>Обзор</b> — пассивный тур по Joyride: подсветка элементов + текст
 *      «вот это раздел». Хорош для первого знакомства; в будущем заменится
 *      видеороликом и останется только как fallback.
 *   2. <b>Челлендж</b> — активные сценарии (3 шт): оператор реально выполняет
 *      действия, панель справа проверяет прогресс. Это то, что должен пройти
 *      каждый новый оператор перед допуском к боевой системе.
 *   3. <b>Сбросить</b> — POST /api/training/reset: сидер пересоздаёт демо-данные,
 *      страница перезагружается. На случай, если что-то нагородили.
 *
 * <p>Тур и челлендж — независимые: можно запустить тур, посмотреть, закрыть
 * и сразу взять челлендж, или наоборот.
 */
export default function TrainingBanner() {
    const location = useLocation()
    const [tourMode, setTourMode] = useState<TourMode | undefined>(undefined)
    const [scenarioId, setScenarioId] = useState<string | null>(null)
    const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false)
    const [tourMenuOpen, setTourMenuOpen] = useState(false)
    const [resetting, setResetting] = useState(false)

    const handleReset = async () => {
        if (resetting) return
        if (!window.confirm('Перезалить демо-данные? Все ваши изменения в тренажёре пропадут.')) return
        setResetting(true)
        try {
            await client.post('/api/training/reset')
            window.location.reload()
        } catch {
            setResetting(false)
            alert('Не удалось сбросить демо-данные. Проверьте, что бэкенд запущен в профиле training.')
        }
    }

    const startTour = (mode: TourMode) => {
        resetTourProgress()
        setTourMenuOpen(false)
        setTourMode(undefined)
        setTimeout(() => setTourMode(mode), 0)
    }

    const startScenario = (id: string) => {
        setScenarioMenuOpen(false)
        setScenarioId(id)
    }

    // Скрываем кнопку «Тур по странице» там, где сценария нет (login, error-log...).
    const hasPageScenario = pageScenarioFor(location.pathname).length > 0

    return (
        <>
            <div className="training-banner">
                <span className="training-banner__label">
                    Тренажёр — изменения не сохраняются
                </span>
                <div className="training-banner__actions">
                    {/* Меню «Челлендж» — выбор сценария */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            className="training-banner__btn"
                            onClick={() => setScenarioMenuOpen(s => !s)}
                            title="Активные задания с проверкой прогресса"
                            style={{ background: scenarioMenuOpen ? 'rgba(255,255,255,0.3)' : undefined }}
                        >
                            Челлендж ▾
                        </button>
                        {scenarioMenuOpen && (
                            <div style={dropdownStyle}>
                                <div style={dropdownHeaderStyle}>Выберите сценарий</div>
                                {SCENARIOS.map(s => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => startScenario(s.id)}
                                        style={dropdownItemStyle}
                                    >
                                        <div style={{ fontWeight: 600, color: '#2c3e50', fontSize: 13 }}>
                                            {s.title}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 2, lineHeight: 1.3 }}>
                                            {s.description}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Меню «Обзор» — пассивный Joyride-тур */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            className="training-banner__btn"
                            onClick={() => setTourMenuOpen(s => !s)}
                            title="Подсветка элементов интерфейса с подсказками (без действий)"
                            style={{ background: tourMenuOpen ? 'rgba(255,255,255,0.3)' : undefined }}
                        >
                            Обзор ▾
                        </button>
                        {tourMenuOpen && (
                            <div style={dropdownStyle}>
                                <button
                                    type="button"
                                    onClick={() => startTour('full')}
                                    style={dropdownItemStyle}
                                >
                                    <div style={{ fontWeight: 600, color: '#2c3e50', fontSize: 13 }}>
                                        Большой тур
                                    </div>
                                    <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 2 }}>
                                        Все разделы по порядку, ~3 минуты
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => startTour('page')}
                                    style={{ ...dropdownItemStyle, opacity: hasPageScenario ? 1 : 0.4 }}
                                    disabled={!hasPageScenario}
                                >
                                    <div style={{ fontWeight: 600, color: '#2c3e50', fontSize: 13 }}>
                                        Тур по этой странице
                                    </div>
                                    <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 2 }}>
                                        {hasPageScenario ? 'Мини-обзор текущего раздела' : 'Для этой страницы нет'}
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        className="training-banner__btn training-banner__btn--reset"
                        data-tour="training-reset"
                        onClick={handleReset}
                        disabled={resetting}
                    >
                        {resetting ? 'Сбрасываю...' : 'Начать заново'}
                    </button>
                </div>
            </div>

            {/* Пассивный обзорный тур */}
            <TrainingTour forceRun={tourMode} onClose={() => setTourMode(undefined)} />

            {/* Активная панель челленджа */}
            <ChallengePanel scenarioId={scenarioId} onClose={() => setScenarioId(null)} />
        </>
    )
}

// ---- inline-стили для дроп-даунов (compact CSS не заведено в index.css) ----

const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    minWidth: 280,
    background: '#fff',
    border: '1px solid #d6dbdf',
    borderRadius: 6,
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.18)',
    zIndex: 100,
    overflow: 'hidden',
}

const dropdownHeaderStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 11,
    color: '#7f8c8d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    background: '#f8f9fa',
    borderBottom: '1px solid #ecf0f1',
}

const dropdownItemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    borderBottom: '1px solid #ecf0f1',
}
