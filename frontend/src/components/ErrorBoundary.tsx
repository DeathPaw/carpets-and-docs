import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    // Log to backend error log
    fetch('/api/error-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionStorage.getItem('auth') ? { 'Authorization': `Basic ${sessionStorage.getItem('auth')}` } : {}),
      },
      body: JSON.stringify({
        error_type: 'FRONTEND_ERROR',
        message: `${error.name}: ${error.message}\n${error.stack || ''}`,
        request_path: window.location.pathname,
      }),
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h1 style={{ color: '#e74c3c' }}>Произошла ошибка</h1>
          <p style={{ color: '#666' }}>{this.state.error?.message}</p>
          <button className="btn-primary" onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = '/orders' }}>
            Вернуться на главную
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
