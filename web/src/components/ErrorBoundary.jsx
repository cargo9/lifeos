// Предохранитель: если что-то упало при отрисовке — показываем ошибку, а не чёрный экран
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ maxWidth: 430, margin: '0 auto', padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Что-то сломалось</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#e8b04a', background: '#1c1c1e', padding: 12, borderRadius: 12 }}>
          {`${error.name}: ${error.message}\n\n${error.stack ?? ""}`}
        </pre>
        <button onClick={() => location.reload()} style={{ padding: '10px 16px', borderRadius: 12, border: 0, background: '#a48bff', color: '#141414', fontWeight: 700 }}>
          Перезагрузить
        </button>
      </div>
    )
  }
}
