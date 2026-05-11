import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setViewerMode } from '../utils/viewer'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Спринт D: галка «открыть в режиме просмотра». При логине дополнительно
  // ставит viewer_mode=1; UI скрывает кнопки изменения, оставляя только чтение.
  const [viewerLogin, setViewerLogin] = useState(false)

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Введите логин и пароль')
      return
    }
    setLoading(true)
    setError('')

    const token = btoa(`${username}:${password}`)

    try {
      // Проверяем авторизацию запросом к API
      const response = await fetch('/api/employees', {
        headers: { 'Authorization': `Basic ${token}` },
      })

      if (response.status === 401) {
        setError('Неверный логин или пароль')
        setLoading(false)
        return
      }

      // Сохраняем токен и переходим
      sessionStorage.setItem('auth', token)
      setViewerMode(viewerLogin)
      // В режиме просмотра удобнее открывать дашборд (там цифры и проблемные заказы).
      navigate(viewerLogin ? '/dashboard' : '/orders')
    } catch {
      setError('Ошибка подключения к серверу')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: '#f0f2f5',
    }}>
      <div style={{
        background: '#fff', padding: '40px', borderRadius: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)', width: 360,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>КОВРОВОЕ ПРОИЗВОДСТВО</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Система учёта заказов</div>
        </div>

        <div className="form-group">
          <label>Логин</label>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Введите логин"
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>Пароль</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Введите пароль"
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
        </div>

        {/* Чекбокс «Только просмотр» — для моноблока. Логин стандартный,
            но кнопки изменения скрыты. */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 12, fontSize: 13, color: '#7f8c8d', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={viewerLogin}
            onChange={e => setViewerLogin(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Войти в режиме просмотра (для моноблока)
        </label>

        {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

        <button
          className="btn-primary"
          onClick={submit}
          disabled={loading}
          style={{ width: '100%', padding: '10px', fontSize: 15 }}
        >
          {loading ? 'Вход...' : (viewerLogin ? 'Войти на просмотр' : 'Войти')}
        </button>

        {/* Альтернатива — личный кабинет работника (Спринт D).
            Намеренно мелким текстом, не равным с операторским — операторы привычно
            идут сюда, работники сразу видят, что для них «другая дверь». */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={() => navigate('/worker-login')}
            style={{
              background: 'transparent', border: 'none', color: '#3498db',
              fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Вход для работника →
          </button>
        </div>
      </div>
    </div>
  )
}
