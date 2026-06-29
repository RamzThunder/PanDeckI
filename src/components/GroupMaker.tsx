import React, { useEffect, useRef, useState } from 'react'
import type { StudentList } from '../pages/StudentLists'

interface Props {
  lists: StudentList[]
  position: { x: number; y: number }
  onPositionChange: (p: { x: number; y: number }) => void
  size: { width: number; height: number }
  onSizeChange: (s: { width: number; height: number }) => void
  visible: boolean
  selected: boolean
  onSelect: () => void
  onClose: () => void
  z: number
  onBringFront: () => void
  onSendBack: () => void
  onMoveForward: () => void
  onMoveBack: () => void
}

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

const Icon = ({ name }: { name: 'trash' | 'settings' | 'shuffle' | 'bringFront' | 'bringForward' | 'sendBackward' | 'sendBack' }): JSX.Element => {
  const paths: Record<string, React.ReactNode> = {
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 15H6L5 6" /><path d="M10 11v6M14 11v6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
    shuffle: <><path d="M16 3h5v5" /><path d="m21 3-6.5 6.5a4 4 0 0 1-5.7 0L3 4" /><path d="M16 21h5v-5" /><path d="m21 21-6.5-6.5" /><path d="M3 20l5.8-5.8" /></>,
    bringFront: <><path d="M7 12H2V2h10v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><path d="M12 17H7V7h10v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><rect x="12" y="12" width="10" height="10" fill="currentColor"/></>,
    bringForward: <><path d="M8 16H2V2h14v6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><rect x="8" y="8" width="14" height="14" fill="currentColor"/></>,
    sendBackward: <><path d="M2 2h14v6H8v8H2z" fill="currentColor"/><rect x="8" y="8" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter"/></>,
    sendBack: <><path d="M2 2h10v5H7v5H2z" fill="currentColor"/><path d="M12 17H7V7h10v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><rect x="12" y="12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter"/></>,
  }
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function buildGroups(
  students: { name: string; index: number }[],
  groupCount: number,
  avoidPairs: [number, number][],
): number[][] {
  const count = Math.min(groupCount, Math.max(1, students.length))
  let best: number[][] = []
  for (let t = 0; t < 400; t++) {
    const shuffled = [...students].sort(() => Math.random() - 0.5)
    const gs: number[][] = Array.from({ length: count }, () => [])
    shuffled.forEach((s, i) => gs[i % count].push(s.index))
    const ok = !avoidPairs.some(([a, b]) => {
      const ga = gs.findIndex(g => g.includes(a))
      const gb = gs.findIndex(g => g.includes(b))
      return ga !== -1 && ga === gb
    })
    best = gs
    if (ok) return gs
  }
  return best
}

export default function GroupMaker({
  lists, position, onPositionChange, size, onSizeChange,
  visible, selected, onSelect, onClose, z,
  onBringFront, onSendBack, onMoveForward, onMoveBack,
}: Props): JSX.Element {
  const availableLists = lists.filter(list => list.students.length > 0)
  const [listId, setListId] = useState(availableLists[0]?.id ?? '')
  const [groupCount, setGroupCount] = useState(4)
  const [groups, setGroups] = useState<number[][] | null>(null)
  const [absent, setAbsent] = useState<number[]>([])
  const [showSettings, setShowSettings] = useState(false)

  const widgetRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const resizeRef = useRef<{ corner: ResizeCorner; sx: number; sy: number; x: number; y: number; width: number; height: number } | null>(null)

  const selectedList = availableLists.find(list => list.id === listId) ?? null

  const activeStudents = selectedList?.students
    .map((name, index) => ({ name, index }))
    .filter(s => !absent.includes(s.index)) ?? []

  const avoidPairs: [number, number][] = selectedList?.avoidPairs ?? []

  // Layout calculations
  const contentScale = Math.max(0.4, Math.min(2.2, Math.min(size.width / 620, size.height / 380)))
  const buttonAreaH = (58 + 32) * contentScale
  const textAreaH = size.height - buttonAreaH
  const textAreaW = size.width - 48
  const actualGroupCount = Math.min(groupCount, Math.max(1, activeStudents.length))
  const cols = actualGroupCount <= 3 ? actualGroupCount : Math.min(4, Math.ceil(actualGroupCount / 2))
  const rows = Math.ceil(actualGroupCount / cols)
  const CARD_GAP = 8
  const CARD_PAD = 14
  const cardW = (textAreaW - (cols - 1) * CARD_GAP - CARD_PAD * 2) / cols
  const cardH = (textAreaH - (rows - 1) * CARD_GAP - CARD_PAD * 2) / rows
  const maxStudentsInGroup = groups
    ? Math.max(1, ...groups.map(g => g.length))
    : Math.ceil(Math.max(1, activeStudents.length) / actualGroupCount)
  const longestGroupNameLen = groups
    ? Math.max(2, ...groups.flat().map(idx => (selectedList?.students[idx] ?? '').length))
    : 2
  const GROUP_HEADER_H = Math.max(16, Math.min(28, cardH * 0.22))
  const groupNameSize = Math.max(9, Math.floor(Math.min(
    (cardH - GROUP_HEADER_H - 8) / Math.max(1, maxStudentsInGroup) * 0.82,
    (cardW - 8) / longestGroupNameLen,
  )))

  useEffect(() => {
    setGroups(null)
    setAbsent([])
  }, [listId])

  useEffect(() => {
    if (!availableLists.some(list => list.id === listId)) setListId(availableLists[0]?.id ?? '')
  }, [lists, listId])

  useEffect(() => {
    if (!selected) setShowSettings(false)
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

  const shuffleGroups = () => {
    if (activeStudents.length === 0) return
    setGroups(buildGroups(activeStudents, groupCount, avoidPairs))
  }

  const toggleAbsent = (index: number) => {
    setAbsent(cur => cur.includes(index) ? cur.filter(v => v !== index) : [...cur, index])
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

  return (
    <section
      ref={widgetRef}
      className={`random-picker classroom-widget ${selected ? 'selected' : ''}`}
      style={{ left: position.x, top: position.y, width: size.width, height: size.height, zIndex: z, display: visible ? undefined : 'none' }}
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
          <button className={showSettings ? 'active' : ''} onClick={() => setShowSettings(v => !v)} title="설정"><Icon name="settings" /></button>
        </div>
      )}

      {/* Settings Panel */}
      {selected && showSettings && (
        <aside className="random-picker-settings">
          <header>
            <strong>조 만들기 설정</strong>
            <button onClick={() => setShowSettings(false)}>×</button>
          </header>

          <label className="random-picker-list-select">학생 목록
            <select value={listId} onChange={e => setListId(e.target.value)}>
              {availableLists.map(list => <option key={list.id} value={list.id}>{list.title} ({list.students.length}명)</option>)}
            </select>
          </label>

          <label className="random-picker-count">그룹 수
            <span>
              <input type="number" min={2} max={Math.max(2, activeStudents.length)} value={groupCount}
                onChange={e => {
                  setGroupCount(Math.max(2, Math.min(activeStudents.length || 2, Number(e.target.value) || 2)))
                  setGroups(null)
                }} />
              <small>개</small>
            </span>
          </label>

          {/* Attendance */}
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
      <div className="random-picker-stage">
        {availableLists.length === 0
          ? <div className="random-picker-empty"><h3>학생 목록이 필요해요</h3><p>학생 목록 메뉴에서 학생을 먼저 저장해주세요.</p></div>
          : <>
              <div className="random-picker-text-area">
                {groups
                  ? <div className="random-picker-groups"
                      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, padding: CARD_PAD, gap: CARD_GAP }}>
                      {groups.map((group, gi) => (
                        <div key={gi} className="random-picker-group-card">
                          <div className="random-picker-group-header" style={{ fontSize: Math.max(9, groupNameSize * 0.7) }}>
                            {gi + 1}조
                          </div>
                          {group.map(idx => (
                            <div key={idx} className="random-picker-group-name" style={{ fontSize: groupNameSize }}>
                              {selectedList?.students[idx] ?? ''}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  : <strong className="waiting" style={{ fontSize: 24 }}>•••</strong>}
              </div>

              <div className="random-picker-button-area" style={{ transform: `scale(${contentScale})` }}>
                <button className="random-picker-draw" onClick={shuffleGroups} disabled={activeStudents.length === 0}
                  aria-label="조 섞기" title="조 섞기">
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
