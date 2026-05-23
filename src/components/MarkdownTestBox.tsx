import React, { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface Props {
  onClose: () => void
}

const INITIAL_MD = `# 마크다운 테스트

**볼드** 텍스트와 *이탤릭* 텍스트를 써보세요.

- 항목 1
- 항목 2

> 인용문도 됩니다.
`

export default function MarkdownTestBox({ onClose }: Props) {
  const [md, setMd] = useState(INITIAL_MD)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 드래그
  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const [pos, setPos] = useState({ x: 80, y: 80 })

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const panel = panelRef.current
    if (!panel) return
    dragState.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y }
    const onMove = (me: PointerEvent) => {
      if (!dragState.current) return
      setPos({
        x: dragState.current.ox + me.clientX - dragState.current.startX,
        y: dragState.current.oy + me.clientY - dragState.current.startY,
      })
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // [B] 버튼: 선택 텍스트를 **로 감싸기
  const wrapBold = () => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e, value } = ta
    if (s === e) return
    const selected = value.slice(s, e)
    const wrapped = `**${selected}**`
    const next = value.slice(0, s) + wrapped + value.slice(e)
    setMd(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + 2, e + 2)
    })
  }

  const wrapItalic = () => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: s, selectionEnd: e, value } = ta
    if (s === e) return
    const selected = value.slice(s, e)
    const wrapped = `*${selected}*`
    const next = value.slice(0, s) + wrapped + value.slice(e)
    setMd(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + 1, e + 1)
    })
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: 680,
        zIndex: 200,
        borderRadius: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* 헤더 (드래그 핸들) */}
      <div
        onPointerDown={onHeaderPointerDown}
        style={{
          padding: '8px 12px',
          background: 'var(--color-sidebar)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <span className="text-xs font-bold" style={{ color: 'var(--color-primary-dark)', flex: 1 }}>
          📝 Markdown Test Box
        </span>

        {/* 인라인 툴바 */}
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={wrapBold}
          title="굵게 (**bold**)"
          style={{
            width: 26, height: 26, borderRadius: 6, border: '1px solid var(--color-border)',
            background: 'var(--color-bg)', color: 'var(--color-text)',
            fontWeight: 'bold', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >B</button>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={wrapItalic}
          title="기울임 (*italic*)"
          style={{
            width: 26, height: 26, borderRadius: 6, border: '1px solid var(--color-border)',
            background: 'var(--color-bg)', color: 'var(--color-text)',
            fontStyle: 'italic', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >I</button>

        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onClose}
          style={{
            width: 22, height: 22, borderRadius: '50%', border: 'none',
            background: 'var(--color-primary)', color: '#fff',
            fontSize: 14, cursor: 'pointer', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>

      {/* 본문: 입력 | 미리보기 */}
      <div style={{ display: 'flex', height: 340 }}>
        {/* 입력창 */}
        <div style={{ flex: 1, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column' }}>
          <div className="text-xs" style={{ padding: '4px 10px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-primary-light)' }}>
            입력 (Markdown)
          </div>
          <textarea
            ref={textareaRef}
            value={md}
            onChange={e => setMd(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1, resize: 'none', border: 'none', outline: 'none',
              padding: '10px 12px',
              fontFamily: 'monospace',
              fontSize: `calc(12px * var(--font-scale, 1))`,
              color: 'var(--color-text)',
              background: 'transparent',
              lineHeight: 1.6,
            }}
          />
        </div>

        {/* 미리보기 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="text-xs" style={{ padding: '4px 10px', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-primary-light)' }}>
            미리보기
          </div>
          <div
            className="markdown-preview"
            style={{
              flex: 1, overflowY: 'auto', padding: '10px 14px',
              fontSize: `calc(13px * var(--font-scale, 1))`,
              position: 'relative',
              top: 'var(--font-offset-y, 0px)',
              lineHeight: 1.7,
              color: 'var(--color-text)',
            }}
          >
            <ReactMarkdown>{md}</ReactMarkdown>
          </div>
        </div>
      </div>

      {/* CSS 변수 확인 배지 */}
      <div style={{ padding: '5px 12px', background: 'var(--color-sidebar)', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 12 }}>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          font-scale: <code style={{ color: 'var(--color-primary-dark)' }} id="md-scale-badge">–</code>
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          font-offset-y: <code style={{ color: 'var(--color-primary-dark)' }} id="md-offset-badge">–</code>
        </span>
        <ScaleBadge />
      </div>
    </div>
  )
}

// CSS 변수 실시간 읽기 (MutationObserver 대신 requestAnimationFrame 루프)
function ScaleBadge() {
  const [vals, setVals] = React.useState({ scale: '–', offset: '–' })
  React.useEffect(() => {
    let raf: number
    const read = () => {
      const style = getComputedStyle(document.documentElement)
      const scale = style.getPropertyValue('--font-scale').trim() || '1'
      const offset = style.getPropertyValue('--font-offset-y').trim() || '0px'
      setVals(prev => (prev.scale === scale && prev.offset === offset ? prev : { scale, offset }))
      raf = requestAnimationFrame(read)
    }
    raf = requestAnimationFrame(read)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        scale: <code style={{ color: 'var(--color-primary-dark)' }}>{vals.scale}</code>
      </span>
      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        offset-y: <code style={{ color: 'var(--color-primary-dark)' }}>{vals.offset}</code>
      </span>
    </>
  )
}
