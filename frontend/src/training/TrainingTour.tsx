import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Joyride, EVENTS, STATUS, ACTIONS, type EventData, type Controls } from 'react-joyride'
import { markTourCompleted } from './index'
import { fullTourSteps, pageScenarioFor, type TourStep } from './tourSteps'

/**
 * Пассивный обзорный тур (Joyride) — подсветка + текст «вот это раздел».
 *
 * <p>Раньше запускался автоматически при первом входе; теперь — только по
 * клику кнопок «Обзор» / «Тур по странице» в баннере. Активные задания
 * (оператор реально выполняет шаги) живут в ChallengePanel — это две разные
 * штуки, не путать.
 *
 * Поддерживает два триггера:
 *   1. Большой тур — `forceRun = 'full'` — все вкладки по порядку.
 *   2. Тур по текущей странице — `forceRun = 'page'` — мини-обзор только
 *      того, что есть на текущем pathname.
 *
 * Особенности:
 *   • Многостраничный: при переходе к шагу с другим маршрутом мы вызываем
 *     navigate() и через короткий setTimeout показываем шаг — DOM успевает
 *     смонтировать целевой элемент.
 *   • Подсветка по `data-tour="<id>"` — независимо от классов и текста,
 *     устойчиво к рефакторингам.
 *   • После прохождения сохраняет флаг в localStorage — повторно не запускается
 *     автоматически (но кнопка в баннере всегда работает).
 *   • Все строки UI Joyride переведены на русский, включая прогресс
 *     "X из Y" и aria-метку открывающего диалога.
 */
export type TourMode = 'full' | 'page'

export default function TrainingTour({
    forceRun,
    onClose,
}: {
    /** undefined — автозапуск; 'full' — большой тур; 'page' — мини-тур по странице */
    forceRun?: TourMode
    /** вызывается, когда тур закрылся (FINISHED/SKIPPED) */
    onClose?: () => void
}) {
    const navigate = useNavigate()
    const location = useLocation()
    const [run, setRun] = useState(false)
    const [stepIndex, setStepIndex] = useState(0)
    const [steps, setSteps] = useState<TourStep[]>([])

    // Запоминаем актуальный location.pathname без перезапуска эффектов навигации.
    const pathRef = useRef(location.pathname)
    pathRef.current = location.pathname

    // Запуск тура — только по явному forceRun из баннера. Автозапуска нет:
    // при первом входе оператор видит только баннер с кнопками и решает сам,
    // запускать обзор или сразу взять челлендж.
    useEffect(() => {
        if (forceRun === 'full') {
            setSteps(fullTourSteps)
            setStepIndex(0)
            setRun(true)
            return
        }
        if (forceRun === 'page') {
            const pageSteps = pageScenarioFor(location.pathname)
            if (pageSteps.length > 0) {
                setSteps(pageSteps)
                setStepIndex(0)
                setRun(true)
            } else {
                // На страницах без сценария (login, error-log и т.п.) — сразу закрываем.
                onClose?.()
            }
            return
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [forceRun])

    const handleEvent = (data: EventData, _controls: Controls) => {
        const { status, type, index, action } = data

        if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
            const nextIndex = action === ACTIONS.PREV ? index - 1 : index + 1
            const nextStep = steps[nextIndex]
            const desiredRoute = (nextStep?.data as { route?: string } | undefined)?.route

            // Переходим на нужный маршрут перед показом следующего шага.
            if (desiredRoute && pathRef.current !== desiredRoute) {
                setRun(false)
                navigate(desiredRoute)
                setTimeout(() => {
                    setStepIndex(nextIndex)
                    setRun(true)
                }, 350)
                return
            }
            setStepIndex(nextIndex)
        }

        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
            setRun(false)
            setStepIndex(0)
            // Помечаем «пройдено» только для большого тура — иначе
            // мини-тур по странице тоже отменял бы автозапуск.
            if (steps.length > 5) markTourCompleted()
            onClose?.()
        }
    }

    return (
        <Joyride
            steps={steps}
            run={run}
            stepIndex={stepIndex}
            continuous
            scrollToFirstStep
            onEvent={handleEvent}
            options={{
                primaryColor: '#3498db',
                zIndex: 10000,
                skipBeacon: true,
                showProgress: true,
                buttons: ['back', 'skip', 'primary'],
            }}
            locale={{
                back:             'Назад',
                close:            'Закрыть',
                last:             'Готово',
                next:             'Далее',
                nextWithProgress: 'Далее ({current} из {total})',
                open:             'Открыть подсказку',
                skip:             'Пропустить',
            }}
        />
    )
}
