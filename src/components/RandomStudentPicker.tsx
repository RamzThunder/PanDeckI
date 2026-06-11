import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { StudentList } from '../pages/StudentLists'

interface Props {
  lists: StudentList[]
  onClose: () => void
  position: { x: number; y: number }
  onPositionChange: (position: { x: number; y: number }) => void
  size: { width: number; height: number }
  onSizeChange: (size: { width: number; height: number }) => void
  visible: boolean
}

export default function RandomStudentPicker({ lists, onClose, position, onPositionChange, size, onSizeChange, visible }: Props): JSX.Element {
  const availableLists = lists.filter(list => list.students.length > 0)
  const [listId, setListId] = useState(availableLists[0]?.id ?? '')
  const [excluded, setExcluded] = useState<number[]>([])
  const [absent, setAbsent] = useState<number[]>([])
  const [showAttendance, setShowAttendance] = useState(false)
  const [resultIndex, setResultIndex] = useState<number | null>(null)
  const [rollingName, setRollingName] = useState('')
  const [drawing, setDrawing] = useState(false)
  const timersRef = useRef<number[]>([])
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const resizeRef = useRef<{ sx: number; sy: number; width: number; height: number } | null>(null)
  const selectedList = availableLists.find(list => list.id === listId) ?? null
  const remaining = useMemo(
    () => selectedList?.students.map((name, index) => ({ name, index })).filter(student => !excluded.includes(student.index) && !absent.includes(student.index)) ?? [],
    [selectedList, excluded, absent],
  )

  useEffect(() => {
    setExcluded([])
    setAbsent([])
    setShowAttendance(false)
    setResultIndex(null)
    setRollingName('')
  }, [listId])

  useEffect(() => {
    if (!availableLists.some(list => list.id === listId)) {
      setListId(availableLists[0]?.id ?? '')
    }
  }, [lists, listId])

  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), [])

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const resize = resizeRef.current
      if (resize) {
        const maxWidth = window.innerWidth - position.x - 8
        const maxHeight = window.innerHeight - position.y - 8
        onSizeChange({
          width: Math.max(Math.min(420, maxWidth), Math.min(maxWidth, resize.width + event.clientX - resize.sx)),
          height: Math.max(Math.min(430, maxHeight), Math.min(maxHeight, resize.height + event.clientY - resize.sy)),
        })
        return
      }
      const drag = dragRef.current
      if (!drag) return
      onPositionChange({
        x: Math.max(8, Math.min(window.innerWidth - size.width - 8, drag.ox + event.clientX - drag.sx)),
        y: Math.max(8, Math.min(window.innerHeight - size.height - 8, drag.oy + event.clientY - drag.sy)),
      })
    }
    const up = () => {
      dragRef.current = null
      resizeRef.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [onPositionChange, onSizeChange, position.x, position.y, size.height, size.width])

  const reset = () => {
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = []
    setDrawing(false)
    setExcluded([])
    setResultIndex(null)
    setRollingName('')
  }

  const draw = () => {
    if (!selectedList || remaining.length === 0 || drawing) return
    setDrawing(true)
    setResultIndex(null)
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = []

    const winner = remaining[Math.floor(Math.random() * remaining.length)]
    for (let step = 0; step < 14; step += 1) {
      const timer = window.setTimeout(() => {
        const preview = remaining[Math.floor(Math.random() * remaining.length)]
        setRollingName(preview.name)
      }, step * 70)
      timersRef.current.push(timer)
    }
    timersRef.current.push(window.setTimeout(() => {
      setRollingName(winner.name)
      setResultIndex(winner.index)
      setExcluded(current => [...current, winner.index])
      setDrawing(false)
    }, 1050))
  }

  const excludedStudents = selectedList?.students
    .map((name, index) => ({ name, index }))
    .filter(student => excluded.includes(student.index)) ?? []

  const restoreStudent = (index: number) => {
    setExcluded(current => current.filter(studentIndex => studentIndex !== index))
    if (resultIndex === index) {
      setResultIndex(null)
      setRollingName('')
    }
  }

  const toggleAbsent = (index: number) => {
    setAbsent(current => current.includes(index) ? current.filter(studentIndex => studentIndex !== index) : [...current, index])
  }

  return (
      <section
        className="random-picker classroom-widget"
        style={{ left: position.x, top: position.y, width: size.width, height: size.height, display: visible ? undefined : 'none' }}
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <header onPointerDown={event => {
          if ((event.target as HTMLElement).closest('button')) return
          event.preventDefault()
          dragRef.current = { sx: event.clientX, sy: event.clientY, ox: position.x, oy: position.y }
        }}>
          <div><small>수업 위젯</small><h2>발표 뽑기</h2></div>
          <button onClick={onClose}>×</button>
        </header>

        {availableLists.length === 0 ? (
          <div className="random-picker-empty">
            <h3>학생 목록이 필요해요</h3>
            <p>사이드바의 학생 목록 메뉴에서 학생을 먼저 저장해주세요.</p>
          </div>
        ) : <>
          <div className="random-picker-controls">
            <label>학생 목록<select value={listId} onChange={event => setListId(event.target.value)}>{availableLists.map(list => <option key={list.id} value={list.id}>{list.title} ({list.students.length}명)</option>)}</select></label>
            <span>남은 학생 <strong>{remaining.length}</strong>명</span>
            <button className={showAttendance ? 'active' : ''} onClick={() => setShowAttendance(current => !current)}>결석 제외 {absent.length > 0 && `(${absent.length})`}</button>
            <button onClick={reset} disabled={excluded.length === 0}>추첨 초기화</button>
          </div>

          {showAttendance && <section className="random-picker-attendance">
            <header>
              <div><strong>오늘 결석한 학생</strong><span>선택한 학생은 추첨에서 제외됩니다.</span></div>
              <button onClick={() => setAbsent([])} disabled={absent.length === 0}>모두 해제</button>
            </header>
            <div>{selectedList?.students.map((student, index) => <button className={absent.includes(index) ? 'absent' : ''} key={index} onClick={() => toggleAbsent(index)}>{student}</button>)}</div>
          </section>}

          <div className={`random-picker-stage ${drawing ? 'drawing' : ''}`}>
            <p>{drawing ? '누가 발표할까요?' : resultIndex !== null ? '발표할 학생' : '버튼을 눌러 발표자를 뽑아보세요'}</p>
            <strong>{rollingName || '?'}</strong>
            {remaining.length === 0 && !drawing && <span>추첨 가능한 학생이 없습니다. 추첨 기록이나 결석 여부를 확인하세요.</span>}
          </div>

          <button className="random-picker-draw" onClick={draw} disabled={drawing || remaining.length === 0}>
            {drawing ? '뽑는 중...' : resultIndex === null ? '발표자 뽑기' : '다음 발표자 뽑기'}
          </button>

          <section className="random-picker-history">
            <header><strong>뽑힌 학생</strong><span>{excluded.length}명</span></header>
            {excludedStudents.length > 0
              ? <div>{excludedStudents.map(student => <button key={student.index} onClick={() => restoreStudent(student.index)} title="다시 추첨 대상에 포함">{student.name}<span>×</span></button>)}</div>
              : <p>한 번 뽑힌 학생은 다음 추첨에서 자동으로 제외됩니다.</p>}
          </section>
        </>}
        <button
          className="classroom-widget-resize-handle"
          aria-label="위젯 크기 조절"
          onPointerDown={event => {
            event.preventDefault()
            event.stopPropagation()
            resizeRef.current = { sx: event.clientX, sy: event.clientY, width: size.width, height: size.height }
          }}
        />
      </section>
  )
}
