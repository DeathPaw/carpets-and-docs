/**
 * Дата сборки фронта — тонкой вертикальной строкой у правого края экрана.
 *
 * Сервер обновляется сам из git; по этой метке сразу видно, что новая сборка
 * действительно встала (дата и коммит меняются после каждого обновления).
 * Бледная и не ловит клики — работе не мешает.
 */
function readStamp(): { time: string; commit: string } | null {
  try {
    if (typeof __BUILD_STAMP__ === 'undefined' || !__BUILD_STAMP__) return null
    return JSON.parse(__BUILD_STAMP__)
  } catch {
    return null
  }
}

const stamp = readStamp()

export default function BuildStamp() {
  if (!stamp) return null
  const when = new Date(stamp.time).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const text = `сборка ${when}${stamp.commit ? ` · ${stamp.commit}` : ''}`
  return (
    <div
      aria-hidden="true"
      title={text}
      style={{
        position: 'fixed', right: 2, top: '50%',
        transform: 'translateY(-50%) rotate(180deg)', writingMode: 'vertical-rl',
        fontSize: 10, letterSpacing: 0.5, color: '#7f8c8d', opacity: 0.55,
        pointerEvents: 'none', userSelect: 'none', zIndex: 1, whiteSpace: 'nowrap',
      }}
    >{text}</div>
  )
}
