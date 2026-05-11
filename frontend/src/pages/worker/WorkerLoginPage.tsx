import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listWorkers, workerLogin, workerSetPin, type WorkerListItem } from '../../api/worker'
import { hashColor } from '../../components/Tiles'
import { SUPPORTED_LANGS, getLang, setLang, t } from '../../i18n'

/**
 * Вход работника по PIN — отдельный экран, не пересекающийся с экраном
 * оператора (см. Спринт D).
 *
 * <p>Сценарий:
 *   1) Открывается список сотрудников плитками (имя + роль).
 *   2) Работник кликает свою — открывается цифровая клавиатура.
 *   3) Если PIN не задан (has_pin = false) — экран «придумайте 4 цифры».
 *   4) После успешного логина — sessionStorage.worker_id + редирект в /worker.
 *
 * <p>UX рассчитан на людей с минимальными компьютерными навыками:
 * крупные плитки и кнопки, никаких выпадающих списков, всё цифровое.
 */
export default function WorkerLoginPage() {
    const navigate = useNavigate()
    const [workers, setWorkers] = useState<WorkerListItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selected, setSelected] = useState<WorkerListItem | null>(null)
    const [pin, setPin] = useState('')
    const [settingPin, setSettingPin] = useState(false)
    const [pinConfirm, setPinConfirm] = useState('')

    useEffect(() => {
        listWorkers().then(setWorkers).catch(() => setError('Не удалось загрузить сотрудников')).finally(() => setLoading(false))
    }, [])

    const pickWorker = (w: WorkerListItem) => {
        setSelected(w)
        setPin('')
        setPinConfirm('')
        setError('')
        // Если PIN ещё не задан — переключаемся в режим первой настройки.
        setSettingPin(!w.has_pin)
    }

    const appendDigit = (d: string) => {
        if (settingPin) {
            // Двухстадийный ввод: сначала PIN (минимум 4), потом подтверждение
            // ровно такой же длины. Когда подтверждение собрано — submit
            // сработает по OK.
            if (pin.length < 4) {
                setPin(prev => prev + d)
            } else if (pinConfirm.length < pin.length && pinConfirm.length < 6) {
                setPinConfirm(prev => prev + d)
            } else if (pin.length < 6 && pinConfirm.length === 0) {
                // Если ещё ничего не введено в confirm — позволяем удлинить PIN до 5-6.
                setPin(prev => prev + d)
            }
        } else {
            if (pin.length < 6) setPin(prev => prev + d)
        }
    }

    const backspace = () => {
        if (settingPin && pinConfirm) setPinConfirm(prev => prev.slice(0, -1))
        else setPin(prev => prev.slice(0, -1))
    }

    const submit = async () => {
        if (!selected) return
        setError('')
        try {
            if (settingPin) {
                if (pin.length < 4) { setError('PIN не короче 4 цифр'); return }
                if (pin !== pinConfirm) { setError('Цифры не совпадают, попробуйте ещё раз'); setPinConfirm(''); return }
                await workerSetPin(selected.id, pin)
                // Сразу делаем логин — оператор не должен вводить дважды.
                const me = await workerLogin(selected.id, pin)
                sessionStorage.setItem('worker_id', String(me.employee_id))
                sessionStorage.setItem('worker_name', me.name)
                navigate('/worker')
            } else {
                const me = await workerLogin(selected.id, pin)
                sessionStorage.setItem('worker_id', String(me.employee_id))
                sessionStorage.setItem('worker_name', me.name)
                navigate('/worker')
            }
        } catch (e: any) {
            const msg = e?.response?.data?.error || 'Неверный PIN'
            setError(msg)
            setPin('')
            setPinConfirm('')
        }
    }

    // Готов ли «Войти» — для setting режима нужно оба поля заполнены.
    const canSubmit = settingPin ? pin.length >= 4 && pinConfirm.length >= 4 : pin.length >= 4

    if (loading) return <FullScreen><div style={{ color: '#fff', fontSize: 18 }}>Загрузка...</div></FullScreen>

    // Экран PIN-ввода
    if (selected) {
        const activeValue = settingPin && pinConfirm !== '' ? pinConfirm : pin
        return (
            <FullScreen>
                <div style={{
                    background: '#fff', borderRadius: 16, padding: 24,
                    width: '100%', maxWidth: 360, boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
                }}>
                    <div style={{ textAlign: 'center', marginBottom: 18 }}>
                        <div style={{ fontSize: 12, color: '#7f8c8d', textTransform: 'uppercase', letterSpacing: 1 }}>
                            Вход
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 600, color: '#2c3e50', marginTop: 6 }}>
                            {selected.name}
                        </div>
                        {selected.role_name && (
                            <div style={{ fontSize: 13, color: '#95a5a6', marginTop: 2 }}>
                                {selected.role_name}
                            </div>
                        )}
                    </div>

                    {settingPin && (
                        <div style={{
                            background: '#fef9e7', border: '1px solid #f1c40f',
                            borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#7d6608',
                        }}>
                            {t('login.first_time')}
                        </div>
                    )}

                    {/* Поле ввода — точки */}
                    <div style={{
                        background: '#f8f9fa', borderRadius: 8, padding: '14px 0',
                        textAlign: 'center', fontSize: 28, letterSpacing: 12, marginBottom: 8,
                        fontVariantNumeric: 'tabular-nums', minHeight: 56,
                    }}>
                        {activeValue
                            ? '•'.repeat(activeValue.length) + '_'.repeat(Math.max(0, 4 - activeValue.length))
                            : '____'}
                    </div>
                    {settingPin && (
                        <div style={{ fontSize: 12, textAlign: 'center', color: '#7f8c8d', marginBottom: 12 }}>
                            {pin.length < 4
                                ? t('login.step1')
                                : pinConfirm.length === 0
                                    ? t('login.step2')
                                    : t('login.confirm')}
                        </div>
                    )}
                    {error && (
                        <div style={{ color: '#c0392b', textAlign: 'center', fontSize: 13, marginBottom: 10 }}>{error}</div>
                    )}

                    {/* Цифровая клавиатура */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
                    }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                            <button key={n} type="button" onClick={() => appendDigit(String(n))} style={padBtnStyle}>{n}</button>
                        ))}
                        <button type="button" onClick={backspace} style={padBtnStyle}>⌫</button>
                        <button type="button" onClick={() => appendDigit('0')} style={padBtnStyle}>0</button>
                        <button
                            type="button"
                            onClick={() => { if (canSubmit) void submit() }}
                            style={{ ...padBtnStyle, background: canSubmit ? '#3498db' : '#bdc3c7', color: '#fff' }}
                        >OK</button>
                    </div>

                    <button
                        type="button"
                        onClick={() => { setSelected(null); setPin(''); setPinConfirm(''); setError('') }}
                        style={{
                            marginTop: 14, width: '100%', padding: '10px',
                            background: 'transparent', border: '1px solid #bdc3c7',
                            borderRadius: 8, fontSize: 14, color: '#7f8c8d', cursor: 'pointer',
                        }}
                    >{t('login.other')}</button>
                </div>
            </FullScreen>
        )
    }

    // Экран выбора сотрудника — плитки
    return (
        <FullScreen>
            <div style={{
                width: '100%', maxWidth: 760, padding: '0 20px',
            }}>
                {/* Языковой переключатель — компактные плитки в правом верхнем углу.
                    Доступен сразу со стартового экрана, чтобы работник переключился
                    на свой язык до ввода PIN. */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 16 }}>
                    {SUPPORTED_LANGS.map(l => (
                        <button
                            key={l.code}
                            type="button"
                            onClick={() => setLang(l.code)}
                            style={{
                                padding: '4px 10px',
                                background: getLang() === l.code ? '#fff' : 'rgba(255,255,255,0.15)',
                                color: getLang() === l.code ? '#2c3e50' : '#fff',
                                border: '1px solid rgba(255,255,255,0.3)',
                                borderRadius: 6, fontSize: 12, cursor: 'pointer',
                            }}
                        >{l.nativeLabel}</button>
                    ))}
                </div>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 600, margin: 0 }}>{t('login.who')}</h1>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 6 }}>
                        {t('login.tap_yours')}
                    </div>
                </div>
                {error && (
                    <div style={{ color: '#fff', background: 'rgba(231,76,60,0.4)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, textAlign: 'center' }}>
                        {error}
                    </div>
                )}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: 12,
                }}>
                    {workers.map(w => {
                        const c = hashColor(w.name)
                        return (
                            <button
                                key={w.id}
                                type="button"
                                onClick={() => pickWorker(w)}
                                style={{
                                    background: c.bg, color: c.text,
                                    border: 'none',
                                    borderRadius: 12, padding: '20px 12px',
                                    cursor: 'pointer',
                                    fontSize: 16, fontWeight: 600,
                                    textAlign: 'center',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                }}
                                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                            >
                                <div>{w.name}</div>
                                {w.role_name && (
                                    <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4, opacity: 0.85 }}>
                                        {w.role_name}
                                    </div>
                                )}
                                {!w.has_pin && (
                                    <div style={{ fontSize: 10, marginTop: 4, color: '#c0392b' }}>
                                        {t('login.no_pin')}
                                    </div>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div style={{ textAlign: 'center', marginTop: 20 }}>
                    <button
                        type="button"
                        onClick={() => navigate('/login')}
                        style={{
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.4)',
                            color: 'rgba(255,255,255,0.85)',
                            padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                        }}
                    >Вход для оператора →</button>
                </div>
            </div>
        </FullScreen>
    )
}

/** Полноэкранная обёртка с тёмным фоном — мобильный лэндинг.
 *  overflowY:auto нужен на маленьких экранах: когда 10+ сотрудников, плитки
 *  не помещаются в высоту телефона и пользователь не может проскроллить
 *  (фидбэк 11 мая). alignItems flex-start (а не center) — чтобы при множестве
 *  плиток контент шёл сверху и был доступен скролл. */
function FullScreen({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'linear-gradient(135deg, #2c3e50 0%, #1a5276 100%)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '24px 20px 40px',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
        }}>
            <div style={{
                width: '100%',
                minHeight: 'min-content',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {children}
            </div>
        </div>
    )
}

const padBtnStyle: React.CSSProperties = {
    padding: '18px 0',
    fontSize: 22,
    fontWeight: 500,
    background: '#fff',
    color: '#2c3e50',
    border: '1px solid #d6dbdf',
    borderRadius: 10,
    cursor: 'pointer',
    fontVariantNumeric: 'tabular-nums',
}
