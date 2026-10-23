import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { StudentList } from '../pages/StudentLists'

export interface PickerResult {
  listId: string
  resultIndices: number[]
  excluded: number[]
  absent: number[]
}

interface Props {
  lists: StudentList[]
  onClose: () => void
  position: { x: number; y: number }
  onPositionChange: (position: { x: number; y: number }) => void
  size: { width: number; height: number }
  onSizeChange: (size: { width: number; height: number }) => void
  visible: boolean
  selected: boolean
  onSelect: () => void
  z: number
  maxZ: number
  onBringFront: () => void
  onSendBack: () => void
  onMoveForward: () => void
  onMoveBack: () => void
  initialResult?: PickerResult
  onResultChange?: (result: PickerResult) => void
}

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

const Icon = ({ name }: { name: 'trash' | 'settings' | 'more' | 'shuffle' | 'bringFront' | 'bringForward' | 'sendBackward' | 'sendBack' }): JSX.Element => {
  const paths: Record<string, React.ReactNode> = {
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 15H6L5 6" /><path d="M10 11v6M14 11v6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    more: <><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>,
    shuffle: <><path d="M16 3h5v5" /><path d="m21 3-6.5 6.5a4 4 0 0 1-5.7 0L3 4" /><path d="M16 21h5v-5" /><path d="m21 21-6.5-6.5" /><path d="M3 20l5.8-5.8" /></>,
    bringFront: <><path d="M7 12H2V2h10v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><path d="M12 17H7V7h10v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><rect x="12" y="12" width="10" height="10" fill="currentColor"/></>,
    bringForward: <><path d="M8 16H2V2h14v6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><rect x="8" y="8" width="14" height="14" fill="currentColor"/></>,
    sendBackward: <><path d="M2 2h14v6H8v8H2z" fill="currentColor"/><rect x="8" y="8" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter"/></>,
    sendBack: <><path d="M2 2h10v5H7v5H2z" fill="currentColor"/><path d="M12 17H7V7h10v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><rect x="12" y="12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

const CANVAS_W = 1800
const CANVAS_H = 1012

export default function RandomStudentPicker({
  lists, onClose, position, onPositionChange, size, onSizeChange,
  visible, selected, onSelect, z, maxZ, onBringFront, onSendBack, onMoveForward, onMoveBack,
  initialResult, onResultChange,
}: Props): JSX.Element {
  const availableLists = lists.filter(list => list.students.length > 0)
  const [listId, setListId] = useState(initialResult?.listId ?? availableLists[0]?.id ?? '')

  const [excluded, setExcluded] = useState<number[]>(initialResult?.excluded ?? [])
  const [absent, setAbsent] = useState<number[]>(initialResult?.absent ?? [])
  const [resultIndices, setResultIndices] = useState<number[]>(initialResult?.resultIndices ?? [])
  const [rollingName, setRollingName] = useState('')
  const [drawing, setDrawing] = useState(false)
  const [animations, setAnimations] = useState(true)
  const [remember, setRemember] = useState(true)
  const [drawCount, setDrawCount] = useState(1)
  const onResultChangeRef = useRef(onResultChange)

  const [showSettings, setShowSettings] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const timersRef = useRef<number[]>([])
  const widgetRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const resizeRef = useRef<{ corner: ResizeCorner; sx: number; sy: number; x: number; y: number; width: number; height: number } | null>(null)

  const selectedList = availableLists.find(list => list.id === listId) ?? null

  const activeStudents = useMemo(
    () => selectedList?.students.map((name, index) => ({ name, index })).filter(s => !absent.includes(s.index)) ?? [],
    [selectedList, absent],
  )
  const remaining = useMemo(
    () => activeStudents.filter(s => !excluded.includes(s.index)),
    [activeStudents, excluded],
  )
  const rememberedStudents = useMemo(
    () => selectedList?.students.map((name, index) => ({ name, index })).filter(s => excluded.includes(s.index)) ?? [],
    [selectedList, excluded],
  )
  const resultStudents = useMemo(
    () => selectedList?.students.map((name, index) => ({ name, index })).filter(s => resultIndices.includes(s.index)) ?? [],
    [selectedList, resultIndices],
  )

  useEffect(() => { onResultChangeRef.current = onResultChange }, [onResultChange])

  const contentScale = Math.max(0.4, Math.min(2.2, Math.min(size.width / 620, size.height / 380)))
  const buttonAreaH = (58 + 32) * contentScale
  const textAreaH = size.height - buttonAreaH
  const textAreaW = size.width - 48

  const resultCount = resultStudents.length
  const longestNameLen = resultStudents.length > 0 ? Math.max(...resultStudents.map(s => s.name.length)) : 4
  const maxFontByWidth = Math.floor(textAreaW * 0.92 / Math.max(1, longestNameLen))
  const resultFontSize = (() => {
    if (resultCount <= 1) return Math.max(36, Math.floor(Math.min(textAreaH * 0.75, maxFontByWidth)))
    if (resultCount <= 3) return Math.max(28, Math.floor(Math.min(textAreaH / resultCount * 0.85, maxFontByWidth)))
    if (resultCount <= 6) return Math.max(22, Math.floor(Math.min(textAreaH / Math.ceil(resultCount / 2) * 0.8, maxFontByWidth)))
    return Math.max(16, Math.floor(Math.min(textAreaH / Math.ceil(resultCount / 3) * 0.75, maxFontByWidth * 0.8)))
  })()
  const waitingFontSize = Math.max(20, Math.floor(resultFontSize * 0.3))
  const rollingFontSize = Math.max(16, Math.floor(resultFontSize * 0.5))

  // Settings panel position — flip if would go off canvas
  const SETTINGS_W = 300
  const SETTINGS_MAX_H = 560
  const settingsStyle: React.CSSProperties = {
    ...(position.x + size.width + 18 + SETTINGS_W > CANVAS_W
      ? { left: 'auto', right: 'calc(100% + 18px)' }
      : { left: 'calc(100% + 18px)' }),
    top: Math.max(-position.y + 8, Math.min(-2, CANVAS_H - position.y - SETTINGS_MAX_H)),
  }

  useEffect(() => {
    setExcluded([])
    setAbsent([])
    setResultIndices([])
    setRollingName('')
  }, [listId])

  useEffect(() => {
    if (!availableLists.some(list => list.id === listId)) setListId(availableLists[0]?.id ?? '')
  }, [lists, listId])

  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), [])

  useEffect(() => {
    if (!selected) { setShowSettings(false); setShowMore(false) }
  }, [selected])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const widgetRect = widgetRef.current?.getBoundingClientRect()
      const pointerScale = widgetRef.current && widgetRect ? widgetRef.current.offsetWidth / widgetRect.width : 1
      const bounds = widgetRef.current?.offsetParent as HTMLElement | null
      const boundsWidth = bounds?.clientWidth ?? window.innerWidth
      const boundsHeight = bounds?.clientHeight ?? window.innerHeight
      const resize = resizeRef.current
      if (resize) {
        const dx = (event.clientX - resize.sx) * pointerScale
        const dy = (event.clientY - resize.sy) * pointerScale
        const fromLeft = resize.corner.includes('w')
        const fromTop = resize.corner.includes('n')
        const nextWidth = Math.max(280, resize.width + (fromLeft ? -dx : dx))
        const nextHeight = Math.max(200, resize.height + (fromTop ? -dy : dy))
        onSizeChange({ width: Math.min(boundsWidth - 16, nextWidth), height: Math.min(boundsHeight - 16, nextHeight) })
        onPositionChange({
          x: Math.max(8, fromLeft ? resize.x + resize.width - nextWidth : resize.x),
          y: Math.max(8, fromTop ? resize.y + resize.height - nextHeight : resize.y),
        })
        return
      }
      const drag = dragRef.current
      if (!drag) return
      onPositionChange({
        x: Math.max(8, Math.min(boundsWidth - size.width - 8, drag.ox + (event.clientX - drag.sx) * pointerScale)),
        y: Math.max(52, Math.min(boundsHeight - size.height - 8, drag.oy + (event.clientY - drag.sy) * pointerScale)),
      })
    }
    const up = () => { dragRef.current = null; resizeRef.current = null }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [onPositionChange, onSizeChange, size.height, size.width])

  const resetDraw = () => {
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = []
    setDrawing(false)
    setExcluded([])
    setResultIndices([])
    setRollingName('')
    onResultChangeRef.current?.({ listId, resultIndices: [], excluded: [], absent })
  }

  const draw = () => {
    if (!selectedList || remaining.length === 0 || drawing) return
    setDrawing(true)
    setResultIndices([])
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = []
    const winnerCount = Math.min(drawCount, remaining.length)
    const winners = [...remaining].sort(() => Math.random() - 0.5).slice(0, winnerCount)
    if (animations) {
      for (let step = 0; step < 14; step++) {
        timersRef.current.push(window.setTimeout(() => {
          setRollingName(remaining[Math.floor(Math.random() * remaining.length)].name)
        }, step * 70))
      }
    }
    timersRef.current.push(window.setTimeout(() => {
      setRollingName('')
      const winnerIndices = winners.map(w => w.index)
      setResultIndices(winnerIndices)
      const nextExcluded = remember ? [...new Set([...excluded, ...winnerIndices])] : excluded
      if (remember) setExcluded(nextExcluded)
      setDrawing(false)
      onResultChangeRef.current?.({ listId, resultIndices: winnerIndices, excluded: nextExcluded, absent })
    }, animations ? 1050 : 120))
  }

  const toggleAbsent = (index: number) => {
    setAbsent(cur => cur.includes(index) ? cur.filter(v => v !== index) : [...cur, index])
  }

  const restoreStudent = (index: number) => {
    const nextExcluded = excluded.filter(v => v !== index)
    const nextResult = resultIndices.filter(v => v !== index)
    setExcluded(nextExcluded)
    setResultIndices(nextResult)
    onResultChangeRef.current?.({ listId, resultIndices: nextResult, excluded: nextExcluded, absent })
  }

  const startResize = (event: React.PointerEvent, corner: ResizeCorner) => {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = { corner, sx: event.clientX, sy: event.clientY, x: position.x, y: position.y, width: size.width, height: size.height }
  }

  const startDrag = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, input, select, label, .random-picker-toolbar, .random-picker-settings, .random-picker-resize')) return
    event.preventDefault()
    dragRef.current = { sx: event.clientX, sy: event.clientY, ox: position.x, oy: position.y }
  }

  const displayZ = selected ? Math.max(z, maxZ) + 1 : z

  return (
    <section
      ref={widgetRef}
      className={`random-picker classroom-widget ${selected ? 'selected' : ''}`}
      style={{ left: position.x, top: position.y, width: size.width, height: size.height, zIndex: displayZ, display: visible ? undefined : 'none' }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => { e.stopPropagation(); onSelect(); startDrag(e) }}
    >
      {/* Toolbar */}
      {selected && (
        <div className="random-picker-toolbar"
          onPointerDown={e => {
            if ((e.target as HTMLElement).closest('button')) return
            e.preventDefault()
            dragRef.current = { sx: e.clientX, sy: e.clientY, ox: position.x, oy: position.y }
          }}
        >
          <button onClick={onBringFront} title="맨앞으로"><Icon name="bringFront" /></button>
          <button onClick={onMoveForward} title="앞으로"><Icon name="bringForward" /></button>
          <button onClick={onMoveBack} title="뒤로"><Icon name="sendBackward" /></button>
          <button onClick={onSendBack} title="맨뒤로"><Icon name="sendBack" /></button>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-border)', margin: '0 2px' }} />
          <button className="danger" onClick={onClose} title="위젯 닫기"><Icon name="trash" /></button>
          <button className={showSettings ? 'active' : ''} onClick={() => { setShowSettings(v => !v); setShowMore(false) }} title="설정"><Icon name="settings" /></button>
          <button className={showMore ? 'active' : ''} onClick={() => { setShowMore(v => !v); setShowSettings(false) }} title="더보기"><Icon name="more" /></button>
          {showMore && (
            <div className="random-picker-more">
              <button onClick={() => { resetDraw(); setShowMore(false) }} disabled={excluded.length === 0 && resultIndices.length === 0}>추첨 초기화</button>
            </div>
          )}
        </div>
      )}

      {/* Settings Panel */}
      {selected && showSettings && (
        <aside className="random-picker-settings" style={settingsStyle}>
          <header>
            <strong>발표 뽑기 설정</strong>
            <button onClick={() => setShowSettings(false)}>×</button>
          </header>

          <label className="random-picker-list-select">학생 목록
            <select value={listId} onChange={e => setListId(e.target.value)}>
              {availableLists.map(list => <option key={list.id} value={list.id}>{list.title} ({list.students.length}명)</option>)}
            </select>
          </label>

          <label className="random-picker-count">한 번에 뽑을 인원
            <span>
              <input type="number" min={1} max={Math.max(1, selectedList?.students.length ?? 1)} value={drawCount}
                onChange={e => setDrawCount(Math.max(1, Math.min(selectedList?.students.length ?? 1, Number(e.target.value) || 1)))} />
              <small>명</small>
            </span>
          </label>
          <label className="random-picker-toggle">
            <span><strong>애니메이션</strong><small>이름이 섞이는 효과를 사용합니다.</small></span>
            <input type="checkbox" checked={animations} onChange={() => setAnimations(v => !v)} />
          </label>
          <label className="random-picker-toggle">
            <span><strong>뽑은 학생 기억</strong><small>뽑힌 학생은 다음 추첨에서 제외합니다.</small></span>
            <input type="checkbox" checked={remember} onChange={() => setRemember(v => !v)} />
          </label>
          <section className="random-picker-remembered">
            <header><strong>기억 중인 학생</strong><span>{rememberedStudents.length}명</span></header>
            {rememberedStudents.length > 0
              ? <div>{rememberedStudents.map(s => <button key={s.index} onClick={() => restoreStudent(s.index)} title="다시 추첨 대상에 포함">{s.name}<span>×</span></button>)}</div>
              : <p>아직 뽑힌 학생이 없습니다.</p>}
          </section>
          <button className="random-picker-reset" onClick={resetDraw} disabled={excluded.length === 0 && resultIndices.length === 0}>추첨 기록 초기화</button>

          <div className="random-picker-students">
            {selectedList?.students.map((student, index) => (
              <label key={index}>
                <input type="checkbox" checked={!absent.includes(index)} onChange={() => toggleAbsent(index)} />
                <span>{index + 1}</span>{student}
              </label>
            ))}
          </div>
        </aside>
      )}

      {/* Stage */}
      <div className={`random-picker-stage ${drawing ? 'drawing' : ''}`}>
        {availableLists.length === 0
          ? <div className="random-picker-empty"><h3>학생 목록이 필요해요</h3><p>학생 목록 메뉴에서 학생을 먼저 저장해주세요.</p></div>
          : <>
              <div className="random-picker-text-area">
                {drawing
                  ? <strong style={{ fontSize: rollingFontSize }}>{rollingName || '•••'}</strong>
                  : resultStudents.length > 0
                    ? <div className={`random-picker-winners ${resultCount > 3 ? 'many' : ''}`}>
                        {resultStudents.map(s => <strong key={s.index} style={{ fontSize: resultFontSize }}>{s.name}</strong>)}
                      </div>
                    : <strong className="waiting" style={{ fontSize: waitingFontSize }}>•••</strong>}
                {remaining.length === 0 && !drawing && <span>추첨 가능한 학생이 없습니다.</span>}
              </div>

              <div className="random-picker-button-area" style={{ transform: `scale(${contentScale})` }}>
                <button className="random-picker-draw" onClick={draw} disabled={drawing || remaining.length === 0}
                  aria-label={`${drawCount}명 발표자 뽑기`} title={`${drawCount}명 발표자 뽑기`}>
                  <Icon name="shuffle" />
                </button>
              </div>
            </>}
      </div>

      {selected && (['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map(corner =>
        <button key={corner} className={`random-picker-resize ${corner}`} aria-label="위젯 크기 조절" onPointerDown={e => startResize(e, corner)} />,
      )}
    </section>
  )
}
