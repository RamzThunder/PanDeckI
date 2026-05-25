import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { toLocalDate, toYearMonth } from '../store/diary'

interface Props {
  currentDate: Date
  onPrev: () => void
  onNext: () => void
  onDayClick: (date: Date) => void
  onNavigate: (date: Date) => void
  diaryName: string
}

interface DayNote {
  id: string
  type: 'text' | 'image'
  content: string
  color?: string
  fontSize?: number
  imageScale?: number
}

interface ContextMenu { x: number; y: number; date: Date; dateStr: string }
interface NoteCtxMenu { x: number; y: number; dateStr: string; noteId: string; noteType: string }
interface DayBg { bg?: string; bgImage?: string }
interface GoalItem { id: string; text: string; done: boolean }
interface BucketItem { id: string; text: string; done: boolean }
interface DDayItem { id: string; label: string; date: string }

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getDaysInMonth(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days: Date[] = []
  for (let i = 0; i < firstDay.getDay(); i++) {
    days.push(new Date(year, month, -firstDay.getDay() + i + 1))
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i))
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1]
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1))
  }
  return days
}

export default function MonthlyView({ currentDate, onPrev, onNext, onDayClick, onNavigate, diaryName }: Props): JSX.Element {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const days = getDaysInMonth(year, month)
  const todayStr = toLocalDate(new Date())
  const yearMonth = toYearMonth(currentDate)

  const [exportPreview, setExportPreview] = useState<{ dataUrl: string; filename: string } | null>(null)
  const [entryDates, setEntryDates] = useState<string[]>([])
  const [dayBgs, setDayBgs] = useState<Record<string, DayBg>>({})
  const [goals, setGoals] = useState<GoalItem[]>([])
  const [newGoal, setNewGoal] = useState('')
  const [bucket, setBucket] = useState<BucketItem[]>([])
  const [newBucket, setNewBucket] = useState('')
  const [ddays, setDDays] = useState<DDayItem[]>([])
  const [newDDayLabel, setNewDDayLabel] = useState('')
  const [newDDayDate, setNewDDayDate] = useState('')
  const [editingDDay, setEditingDDay] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileBio, setProfileBio] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [noteCtxMenu, setNoteCtxMenu] = useState<NoteCtxMenu | null>(null)
  const [monthlyNotes, setMonthlyNotes] = useState<Record<string, DayNote[]>>({})
  const [addingTextDate, setAddingTextDate] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [textFontSize, setTextFontSize] = useState(10)
  const [showYearPicker, setShowYearPicker] = useState(false)
  const [monthlyMotto, setMonthlyMotto] = useState('')
  const [saved, setSaved] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const noteMenuRef = useRef<HTMLDivElement>(null)
  const yearPickerRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)

  const getMenuPos = (e: React.MouseEvent) => {
    const root = rootRef.current
    if (!root) return { x: e.clientX, y: e.clientY }
    const rect = root.getBoundingClientRect()
    const scaleX = rect.width / root.offsetWidth
    const scaleY = rect.height / root.offsetHeight
    return { x: (e.clientX - rect.left) / scaleX, y: (e.clientY - rect.top) / scaleY }
  }
  const notesKey = `monthlyNotes_${yearMonth}`
  const goalsKey = `monthlyGoals_${yearMonth}`
  const mottoKey = `monthlyMotto_${yearMonth}`

  useEffect(() => {
    api.entry.listMonthBgs(yearMonth).then((rows) => {
      setEntryDates(rows.map(r => r.date))
      const bgs: Record<string, DayBg> = {}
      rows.forEach(r => { bgs[r.date] = { bg: r.bg ?? undefined, bgImage: r.bg_image ?? undefined } })
      setDayBgs(bgs)
    }).catch(() => {})

    api.settings.get(goalsKey).then(raw => {
      if (raw) try { setGoals(JSON.parse(raw)) } catch {}
      else setGoals([])
    }).catch(() => { setGoals([]) })

    api.settings.get(notesKey).then(raw => {
      if (raw) try { setMonthlyNotes(JSON.parse(raw)) } catch {}
      else setMonthlyNotes({})
    }).catch(() => { setMonthlyNotes({}) })

    api.settings.get(mottoKey).then(raw => {
      setMonthlyMotto(raw ?? '')
    }).catch(() => { setMonthlyMotto('') })
  }, [yearMonth])

  useEffect(() => {
    api.settings.get('globalBucket').then(raw => {
      if (raw) try { setBucket(JSON.parse(raw)) } catch {}
    }).catch(() => {})
    api.settings.get('globalDDays').then(raw => {
      if (raw) try { setDDays(JSON.parse(raw)) } catch {}
    }).catch(() => {})
    api.settings.get('globalProfile').then(raw => {
      if (raw) try {
        const p = JSON.parse(raw)
        setProfileName(p.name ?? '')
        setProfileBio(p.bio ?? '')
        setProfilePhoto(p.photo ?? '')
      } catch {}
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null)
      if (noteMenuRef.current && !noteMenuRef.current.contains(e.target as Node)) setNoteCtxMenu(null)
      if (yearPickerRef.current && !yearPickerRef.current.contains(e.target as Node)) setShowYearPicker(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (addingTextDate && textInputRef.current) textInputRef.current.focus()
  }, [addingTextDate])

  useEffect(() => {
    const onManualSave = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }
    window.addEventListener('diary-manual-save', onManualSave)
    return () => window.removeEventListener('diary-manual-save', onManualSave)
  }, [])

  useEffect(() => {
    const onExportPng = async () => {
      const b64 = await api.export.captureToB64().catch(() => '')
      if (!b64) return
      const now = new Date()
      const yy  = String(now.getFullYear()).slice(2)
      const mm  = String(now.getMonth() + 1).padStart(2, '0')
      const dd  = String(now.getDate()).padStart(2, '0')
      const hh  = String(now.getHours()).padStart(2, '0')
      const min = String(now.getMinutes()).padStart(2, '0')
      const safeName = (diaryName || 'on_diary').replace(/\s+/g, '_')
      const filename = `${safeName}_${yy}${mm}${dd}_${hh}${min}.png`
      setExportPreview({ dataUrl: `data:image/png;base64,${b64}`, filename })
    }
    window.addEventListener('diary-export-png', onExportPng)
    return () => window.removeEventListener('diary-export-png', onExportPng)
  }, [diaryName])

  const saveNotes = (updated: Record<string, DayNote[]>) => {
    setMonthlyNotes(updated)
    api.settings.set(notesKey, JSON.stringify(updated)).catch(() => {})
  }

  const addNote = (dateStr: string, note: DayNote) => {
    const raw = monthlyNotes[dateStr]
    const prev = Array.isArray(raw) ? raw : []
    saveNotes({ ...monthlyNotes, [dateStr]: [...prev, note] })
  }

  const deleteNote = (dateStr: string, noteId: string) => {
    const prev = monthlyNotes[dateStr] ?? []
    const next = prev.filter(n => n.id !== noteId)
    const updated = { ...monthlyNotes }
    if (next.length === 0) delete updated[dateStr]
    else updated[dateStr] = next
    saveNotes(updated)
  }

  const updateNoteScale = (dateStr: string, noteId: string, scale: number) => {
    const prev = monthlyNotes[dateStr] ?? []
    const next = prev.map(n => n.id === noteId ? { ...n, imageScale: scale } : n)
    saveNotes({ ...monthlyNotes, [dateStr]: next })
  }

  const updateNoteFontSize = (dateStr: string, noteId: string, fontSize: number) => {
    const prev = monthlyNotes[dateStr] ?? []
    const next = prev.map(n => n.id === noteId ? { ...n, fontSize } : n)
    saveNotes({ ...monthlyNotes, [dateStr]: next })
  }

  const saveGoals = (updated: GoalItem[]) => {
    setGoals(updated)
    api.settings.set(goalsKey, JSON.stringify(updated)).catch(() => {})
  }

  const saveBucket = (updated: BucketItem[]) => {
    setBucket(updated)
    api.settings.set('globalBucket', JSON.stringify(updated)).catch(() => {})
  }

  const saveProfile = (name: string, bio: string, photo?: string) => {
    const p = photo !== undefined ? photo : profilePhoto
    api.settings.set('globalProfile', JSON.stringify({ name, bio, photo: p })).catch(() => {})
  }

  const handlePickProfilePhoto = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = await api.file.pickImage().catch(() => null)
    if (!url) return
    setProfilePhoto(url)
    saveProfile(profileName, profileBio, url)
  }

  const saveDDays = (updated: DDayItem[]) => {
    setDDays(updated)
    api.settings.set('globalDDays', JSON.stringify(updated)).catch(() => {})
  }

  const getDDayCount = (dateStr: string): string => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
    const diff = Math.round((target.getTime() - today.getTime()) / 86400000)
    if (diff === 0) return 'D-Day'
    return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`
  }

  const handleContextMenu = (e: React.MouseEvent, day: Date, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return
    e.preventDefault()
    const dateStr = toLocalDate(day)
    const pos = getMenuPos(e)
    setContextMenu({ x: pos.x, y: pos.y, date: day, dateStr })
    setNoteCtxMenu(null)
    setAddingTextDate(null)
  }

  const handleNoteContextMenu = (e: React.MouseEvent, dateStr: string, noteId: string, noteType: string) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = getMenuPos(e)
    setNoteCtxMenu({ x: pos.x, y: pos.y, dateStr, noteId, noteType })
    setContextMenu(null)
  }

  const handleAddText = () => {
    if (!contextMenu) return
    setAddingTextDate(contextMenu.dateStr)
    setTextInput('')
    setContextMenu(null)
  }

  const handleAddImage = async () => {
    if (!contextMenu) return
    const dateStr = contextMenu.dateStr
    setContextMenu(null)
    const url = await api.file.pickImage().catch(() => null)
    if (!url) return
    addNote(dateStr, { id: crypto.randomUUID(), type: 'image', content: url, imageScale: 1 })
  }

  const commitText = () => {
    if (!addingTextDate || !textInput.trim()) { setAddingTextDate(null); return }
    addNote(addingTextDate, { id: crypto.randomUUID(), type: 'text', content: textInput.trim(), fontSize: textFontSize })
    setAddingTextDate(null)
    setTextInput('')
  }

  const dismissAll = () => {
    setContextMenu(null)
    setNoteCtxMenu(null)
    setAddingTextDate(null)
    setShowYearPicker(false)
  }

  const noteForCtx = noteCtxMenu
    ? (monthlyNotes[noteCtxMenu.dateStr] ?? []).find(n => n.id === noteCtxMenu.noteId)
    : null

  return (
    <div ref={rootRef} className="flex h-full relative" onClick={dismissAll}>
      {/* Left panel */}
      <div className="w-56 shrink-0 flex flex-col overflow-hidden"
        style={{ borderRight: '1px solid var(--color-border)', background: 'var(--color-primary-light)' }}>
        <div className="flex flex-col gap-3 p-5 overflow-y-auto flex-1">

          {/* PROFILE */}
          <section style={{
            borderRadius: 14, overflow: 'hidden',
            border: '1px solid var(--color-border)', background: '#fff',
          }}>
            <div className="text-xs font-bold tracking-widest text-center py-1.5"
              style={{ background: 'var(--color-primary)', color: '#fff', borderBottom: '1px solid var(--color-border)', letterSpacing: '0.12em' }}>
              PROFILE
            </div>
            {/* Photo area */}
            <div style={{ padding: '12px 16px 8px', display: 'flex', justifyContent: 'center' }}>
              <div
                onClick={handlePickProfilePhoto}
                style={{
                  width: '100%', aspectRatio: '1', borderRadius: 10,
                  border: '1.5px solid var(--color-border)',
                  background: profilePhoto ? 'transparent' : 'var(--color-primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden', position: 'relative',
                }}>
                {profilePhoto
                  ? <img src={profilePhoto} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                      <circle cx="22" cy="17" r="9" fill="var(--color-border)" />
                      <ellipse cx="22" cy="38" rx="16" ry="10" fill="var(--color-border)" />
                    </svg>
                }
              </div>
            </div>
            {/* Name */}
            <div style={{ padding: '0 12px 6px' }}>
              <input
                className="w-full text-xs px-2 py-1.5 outline-none text-center"
                style={{ borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', fontWeight: 600 }}
                placeholder="이름..." value={profileName}
                onClick={e => e.stopPropagation()}
                onChange={e => setProfileName(e.target.value)}
                onBlur={() => saveProfile(profileName, profileBio)} />
            </div>
            {/* Bio */}
            <div style={{ padding: '0 12px 12px' }}>
              <textarea
                className="w-full text-xs px-2 py-1 outline-none resize-none text-center"
                style={{ border: 'none', background: 'transparent', color: 'var(--color-text-muted)' }}
                placeholder="소개..." rows={2} value={profileBio}
                onClick={e => e.stopPropagation()}
                onChange={e => setProfileBio(e.target.value)}
                onBlur={() => saveProfile(profileName, profileBio)} />
            </div>
          </section>

          {/* D-DAY */}
          {(() => {
            const cur = ddays[0] ?? null
            const showForm = !cur || editingDDay
            return (
              <section style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--color-border)', background: '#fff' }}>
                <div className="text-xs font-bold tracking-widest text-center py-1.5"
                  style={{ background: 'var(--color-primary)', color: '#fff', borderBottom: '1px solid var(--color-border)', letterSpacing: '0.12em' }}>
                  D-DAY
                </div>
                {/* Hero display when D-Day registered */}
                {cur && !editingDDay && (
                  <div
                    onClick={e => { e.stopPropagation(); setEditingDDay(true); setNewDDayLabel(cur.label); setNewDDayDate(cur.date) }}
                    style={{ padding: '14px 12px 14px', textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>{cur.label}</div>
                    <div style={{ fontSize: 38, fontWeight: 800, color: 'var(--color-primary)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                      {getDDayCount(cur.date)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 5 }}>
                      {new Date(cur.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                )}
                {/* Form (when empty or editing) */}
                {showForm && (
                  <div style={{ padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}
                    onClick={e => e.stopPropagation()}>
                    <input
                      style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border)', outline: 'none', background: 'var(--color-primary-light)', boxSizing: 'border-box' }}
                      placeholder="기념일 이름..." value={newDDayLabel}
                      onChange={e => setNewDDayLabel(e.target.value)} />
                    <input type="date"
                      style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border)', outline: 'none', background: 'var(--color-primary-light)', boxSizing: 'border-box' }}
                      value={newDDayDate}
                      onChange={e => setNewDDayDate(e.target.value)} />
                    <div style={{ display: 'flex', gap: 4 }}>
                      {editingDDay && (
                        <button
                          onClick={e => { e.stopPropagation(); saveDDays([]); setEditingDDay(false); setNewDDayLabel(''); setNewDDayDate('') }}
                          style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 6, border: '1px solid var(--color-border)', background: '#fff', color: '#e03060', cursor: 'pointer' }}>
                          삭제
                        </button>
                      )}
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (newDDayLabel.trim() && newDDayDate) {
                            saveDDays([{ id: cur?.id ?? crypto.randomUUID(), label: newDDayLabel.trim(), date: newDDayDate }])
                            setEditingDDay(false); setNewDDayLabel(''); setNewDDayDate('')
                          }
                        }}
                        style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 6, background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        {editingDDay ? '저장' : '등록'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )
          })()}

          {/* MONTHLY GOALS */}
          <section>
            <h3 className="text-xs font-bold tracking-widest mb-2 text-center py-1 rounded"
              style={{ background: 'var(--color-primary)', color: '#fff' }}>MONTHLY GOALS</h3>
            <ul className="flex flex-col gap-1 mb-2">
              {goals.map(g => (
                <li key={g.id} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={g.done}
                    onChange={e => { e.stopPropagation(); saveGoals(goals.map(x => x.id === g.id ? { ...x, done: e.target.checked } : x)) }}
                    onClick={e => e.stopPropagation()}
                    style={{ flexShrink: 0, accentColor: 'var(--color-primary)', cursor: 'pointer' }} />
                  <span className="flex-1" style={{
                    color: 'var(--color-text)',
                    textDecoration: g.done ? 'line-through' : 'none',
                    opacity: g.done ? 0.45 : 1,
                  }}>{g.text}</span>
                  <button className="text-gray-300 hover:text-red-400 flex-shrink-0"
                    onClick={e => { e.stopPropagation(); saveGoals(goals.filter(x => x.id !== g.id)) }}>×</button>
                </li>
              ))}
            </ul>
            <input
              className="w-full text-xs px-2 py-1 rounded border outline-none"
              style={{ borderColor: 'var(--color-border)', background: '#fff' }}
              placeholder="Add goal..." value={newGoal}
              onChange={e => setNewGoal(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter' && newGoal.trim()) {
                  saveGoals([...goals, { id: crypto.randomUUID(), text: newGoal.trim(), done: false }])
                  setNewGoal('')
                }
              }} />
          </section>

          {/* BUCKET LIST */}
          <section>
            <h3 className="text-xs font-bold tracking-widest mb-2 text-center py-1 rounded"
              style={{ background: 'var(--color-secondary)', color: '#fff' }}>BUCKET LIST</h3>
            <ul className="flex flex-col gap-1 mb-2">
              {bucket.map(b => (
                <li key={b.id} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={b.done ?? false}
                    onChange={e => { e.stopPropagation(); saveBucket(bucket.map(x => x.id === b.id ? { ...x, done: e.target.checked } : x)) }}
                    onClick={e => e.stopPropagation()}
                    style={{ flexShrink: 0, accentColor: 'var(--color-secondary)', cursor: 'pointer' }} />
                  <span className="flex-1" style={{
                    color: 'var(--color-text)',
                    textDecoration: (b.done ?? false) ? 'line-through' : 'none',
                    opacity: (b.done ?? false) ? 0.45 : 1,
                  }}>{b.text}</span>
                  <button className="text-gray-300 hover:text-red-400 flex-shrink-0"
                    onClick={e => { e.stopPropagation(); saveBucket(bucket.filter(x => x.id !== b.id)) }}>×</button>
                </li>
              ))}
            </ul>
            <input
              className="w-full text-xs px-2 py-1 rounded border outline-none"
              style={{ borderColor: 'var(--color-border)', background: '#fff' }}
              placeholder="Add item..." value={newBucket}
              onChange={e => setNewBucket(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter' && newBucket.trim()) {
                  saveBucket([...bucket, { id: crypto.randomUUID(), text: newBucket.trim(), done: false }])
                  setNewBucket('')
                }
              }} />
          </section>

        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 flex flex-col p-5 overflow-hidden relative"
        style={{
          background: 'var(--color-bg)', marginRight: 44,
          borderTopRightRadius: 12, borderBottomRightRadius: 12,
        }}>
        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          padding: '5px 10px', flexShrink: 0,
          background: 'var(--color-primary-light)',
          borderRadius: 10, border: '1px solid var(--color-border)',
        }}>
          {/* Month pill */}
          <div style={{
            padding: '3px 12px', borderRadius: 20, flexShrink: 0,
            border: '1.5px solid var(--color-primary)',
            background: '#fff',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            color: 'var(--color-primary-dark)',
          }}>
            {MONTHS[month].toUpperCase()}
          </div>

          {/* Monthly motto */}
          <input
            className="flex-1 outline-none"
            style={{ background: 'transparent', border: 'none', fontSize: 11, color: 'var(--color-text)', minWidth: 0 }}
            placeholder="이달의 문구를 입력하세요..."
            value={monthlyMotto}
            onChange={e => setMonthlyMotto(e.target.value)}
            onClick={e => e.stopPropagation()}
            onBlur={() => api.settings.set(mottoKey, monthlyMotto).catch(() => {})}
          />

          {saved && <span style={{ fontSize: 10, color: 'var(--color-primary-dark)', flexShrink: 0 }}>저장됨 ✓</span>}

          {/* 오늘 버튼 */}
          <button
            onClick={e => { e.stopPropagation(); onNavigate(new Date()) }}
            style={{
              fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 20, flexShrink: 0,
              background: 'var(--color-primary)', border: '1.5px solid var(--color-primary)',
              color: '#fff', cursor: 'pointer',
            }}>
            오늘
          </button>

          {/* Year/month nav */}
          <div className="relative flex items-center gap-1" ref={yearPickerRef} style={{ flexShrink: 0 }}>
            <button onClick={e => { e.stopPropagation(); onPrev() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--color-primary-dark)', padding: '0 2px', lineHeight: 1 }}>‹</button>
            <button
              onClick={e => { e.stopPropagation(); setShowYearPicker(v => !v) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', padding: '0 4px' }}>
              {year}
            </button>
            <button onClick={e => { e.stopPropagation(); onNext() }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--color-primary-dark)', padding: '0 2px', lineHeight: 1 }}>›</button>
            {showYearPicker && (
              <div style={{
                position: 'absolute', top: 30, right: 0, zIndex: 50,
                background: '#fff', borderRadius: 14,
                boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
                padding: 10, width: 176,
              }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {[2026,2027,2028,2029,2030,2031,2032,2033,2034,2035].map(y => (
                    <button key={y}
                      onClick={() => { onNavigate(new Date(y, month, 1)); setShowYearPicker(false) }}
                      style={{
                        padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: y === year ? 700 : 400,
                        background: y === year ? 'var(--color-primary)' : 'var(--color-primary-light)',
                        color: y === year ? '#fff' : 'var(--color-text)',
                      }}
                      onMouseEnter={e => { if (y !== year) (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}>
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Calendar grid */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={{
          width: '100%', height: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: `auto repeat(${days.length / 7}, 1fr)`,
          border: '1px solid var(--color-border)',
          borderRadius: 8, overflow: 'hidden',
        }}>
          {WEEKDAYS.map((w, wi) => (
            <div key={w} style={{
              textAlign: 'center', padding: '5px 0', fontSize: 9, fontWeight: 700,
              background: 'var(--color-primary-light)',
              borderRight: wi < 6 ? '1px solid var(--color-border)' : 'none',
              borderBottom: '1px solid var(--color-border)',
              color: w === 'SUN' ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
            }}>{w}</div>
          ))}

          {days.map((day, i) => {
            const isCurrentMonth = day.getMonth() === month
            const dateStr = toLocalDate(day)
            const isToday = dateStr === todayStr
            const hasEntry = entryDates.includes(dateStr)
            const dayBg = dayBgs[dateStr]
            const notes = monthlyNotes[dateStr] ?? []
            const isAddingText = addingTextDate === dateStr
            const col = i % 7
            const totalWeekRows = days.length / 7
            const row = Math.floor(i / 7)

            return (
              <div key={i}
                onClick={e => { e.stopPropagation(); if (!isAddingText && isCurrentMonth) onDayClick(day) }}
                onContextMenu={e => handleContextMenu(e, day, isCurrentMonth)}
                style={{
                  borderRight: col < 6 ? '1px solid var(--color-border)' : 'none',
                  borderBottom: row < totalWeekRows - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: isCurrentMonth ? 'pointer' : 'default',
                  background: dayBg?.bg ?? (isCurrentMonth ? 'rgba(255,255,255,0.5)' : 'var(--color-bg)'),
                  position: 'relative', overflow: 'hidden',
                }}>

                {dayBg?.bgImage && (
                  <img src={dayBg.bgImage} draggable={false} style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover', display: 'block', pointerEvents: 'none', zIndex: 0,
                  }} />
                )}
                {dayBg?.bgImage && (
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.25)', pointerEvents: 'none', zIndex: 1 }} />
                )}

                <span style={{
                  fontSize: 10, fontWeight: isToday ? 700 : 400, display: 'block',
                  padding: '3px 4px', position: 'relative', zIndex: 20,
                  color: day.getDay() === 0 ? 'var(--color-primary-dark)' : 'var(--color-text)',
                  opacity: isCurrentMonth ? 1 : 0.5,
                }}>
                  {day.getDate()}
                </span>

                {notes.length > 0 && !isAddingText && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 2, overflow: 'hidden', zIndex: 10,
                  }}>
                    {notes.map(note => (
                      <div key={note.id}
                        onContextMenu={e => handleNoteContextMenu(e, dateStr, note.id, note.type)}
                        onClick={e => e.stopPropagation()}
                        style={{ maxWidth: '100%', display: 'flex', justifyContent: 'center' }}>
                        {note.type === 'text' && (
                          <div style={{
                            fontSize: note.fontSize ?? 9, color: note.color ?? 'var(--color-text)',
                            textAlign: 'center', borderRadius: 2, padding: '1px 3px',
                            maxWidth: '100%', overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}>{note.content}</div>
                        )}
                        {note.type === 'image' && (
                          <img src={note.content} alt=""
                            style={{
                              height: Math.round(32 * (note.imageScale ?? 1)),
                              width: 'auto', maxWidth: '100%',
                              objectFit: 'contain', display: 'block', borderRadius: 2,
                            }} />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isAddingText && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 20,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 3, padding: 4, background: 'rgba(255,255,255,0.95)',
                  }}
                    onClick={e => e.stopPropagation()}
                    onContextMenu={e => e.stopPropagation()}>
                    <textarea ref={textInputRef} value={textInput}
                      onChange={e => setTextInput(e.target.value)}
                      onKeyDown={e => {
                        e.stopPropagation()
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText() }
                        if (e.key === 'Escape') setAddingTextDate(null)
                      }}
                      rows={2}
                      style={{
                        width: '100%', border: '1px solid var(--color-primary)',
                        borderRadius: 3, outline: 'none', textAlign: 'center',
                        fontSize: textFontSize, padding: '1px 3px',
                        background: '#fff', minWidth: 0, resize: 'none', lineHeight: 1.4,
                      }}
                      placeholder="텍스트..." />
                    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 8, color: 'var(--color-text-muted)', flexShrink: 0 }}>A</span>
                      <input type="range" min={8} max={50} value={textFontSize}
                        onChange={e => setTextFontSize(Number(e.target.value))}
                        style={{ flex: 1, height: 3, cursor: 'pointer', minWidth: 0 }} />
                      <span style={{ fontSize: 8, color: 'var(--color-primary-dark)', flexShrink: 0 }}>{textFontSize}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button onClick={e => { e.stopPropagation(); setAddingTextDate(null) }}
                        style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', background: '#fff', cursor: 'pointer' }}>
                        취소
                      </button>
                      <button onClick={e => { e.stopPropagation(); commitText() }}
                        style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: 'var(--color-primary)', color: '#fff', cursor: 'pointer' }}>
                        확인
                      </button>
                    </div>
                  </div>
                )}

              </div>
            )
          })}
        </div>

        {/* Today outline overlay — overflow:hidden 밖에 렌더, 외곽선이 항상 최상위 */}
        <div style={{
          position: 'absolute', top: 1, left: 1, right: 1, bottom: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: `auto repeat(${days.length / 7}, 1fr)`,
          pointerEvents: 'none',
          zIndex: 10,
        }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ padding: '5px 0', fontSize: 9, fontWeight: 700, visibility: 'hidden' }}>{w}</div>
          ))}
          {days.map((day, i) => {
            const isToday = toLocalDate(day) === todayStr
            return (
              <div key={`ov-${i}`} style={isToday ? {
                outline: '3px solid var(--color-primary)',
                outlineOffset: '-2px',
              } : {}} />
            )
          })}
        </div>
        </div>

      </div>

      {/* 월 인덱스 — absolute, 캘린더 오른쪽 투명 영역에 뜸 */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 44,
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start',
        paddingTop: 30, paddingBottom: 30,
        pointerEvents: 'none',
      }}>
        {['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map((abbr, i) => {
          const isCur = i === month
          return (
            <div key={abbr}
              style={{
                flex: 1, minHeight: 0,
                width: 30,
                borderRadius: '0 7px 7px 0',
                overflow: 'hidden',
                marginBottom: i < 11 ? 7 : 0,
                pointerEvents: 'all',
                position: 'relative',
              }}>
              <button
                onClick={e => { e.stopPropagation(); onNavigate(new Date(year, i, 1)) }}
                style={{
                  width: '100%', height: '100%',
                  background: isCur ? 'var(--color-primary)' : 'var(--color-primary-light)',
                  border: 'none', cursor: 'pointer',
                  fontSize: 8,
                  fontWeight: isCur ? 700 : 400,
                  color: isCur ? '#fff' : 'var(--color-primary-dark)',
                  textAlign: 'center',
                  letterSpacing: '0.04em',
                }}>
                {abbr}
              </button>
              {/* 탭 안에서만 그림자 — overflow:hidden에 의해 탭 모양대로 클리핑됨 */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to right, rgba(0,0,0,0.18), transparent 30%)',
                pointerEvents: 'none',
              }} />
            </div>
          )
        })}
      </div>

      {/* Cell context menu */}
      {contextMenu && (
        <div ref={menuRef}
          className="absolute z-50 rounded-xl shadow-2xl py-1 overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y, background: '#fff', border: '1px solid var(--color-border)', minWidth: 130 }}
          onClick={e => e.stopPropagation()}>
          <div className="px-3 py-1.5 text-xs font-semibold" style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
            {contextMenu.date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
          </div>
          {([
            ['text', '✎', '텍스트 추가', handleAddText],
            ['photo', '🖼', '사진 추가', handleAddImage],
          ] as const).map(([action, icon, label, handler]) => (
            <button key={action}
              onClick={() => (handler as () => void)()}
              className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs"
              style={{ color: 'var(--color-text)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-light)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Note context menu */}
      {noteCtxMenu && (
        <div ref={noteMenuRef}
          className="absolute z-50 rounded-xl shadow-2xl py-1 overflow-hidden"
          style={{ left: noteCtxMenu.x, top: noteCtxMenu.y, background: '#fff', border: '1px solid var(--color-border)', minWidth: 150 }}
          onClick={e => e.stopPropagation()}>
          {noteCtxMenu.noteType === 'image' && (
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="text-xs mb-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>사이즈 조절</div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>50%</span>
                <input type="range" min={50} max={500} step={5}
                  value={Math.round((noteForCtx?.imageScale ?? 1) * 100)}
                  onChange={e => updateNoteScale(noteCtxMenu.dateStr, noteCtxMenu.noteId, Number(e.target.value) / 100)}
                  className="flex-1 cursor-pointer" style={{ height: 4 }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>500%</span>
              </div>
              <div className="text-center mt-1" style={{ fontSize: 10, color: 'var(--color-primary-dark)', fontWeight: 600 }}>
                {Math.round((noteForCtx?.imageScale ?? 1) * 100)}%
              </div>
            </div>
          )}
          {noteCtxMenu.noteType === 'text' && (
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="text-xs mb-1.5 font-medium" style={{ color: 'var(--color-text-muted)' }}>글자 크기</div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>A</span>
                <input type="range" min={8} max={50} step={1}
                  value={noteForCtx?.fontSize ?? 9}
                  onChange={e => updateNoteFontSize(noteCtxMenu.dateStr, noteCtxMenu.noteId, Number(e.target.value))}
                  className="flex-1 cursor-pointer" style={{ height: 4 }} />
                <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>A</span>
              </div>
              <div className="text-center mt-1" style={{ fontSize: 10, color: 'var(--color-primary-dark)', fontWeight: 600 }}>
                {noteForCtx?.fontSize ?? 9}px
              </div>
            </div>
          )}
          <button
            onClick={() => { deleteNote(noteCtxMenu.dateStr, noteCtxMenu.noteId); setNoteCtxMenu(null) }}
            className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs"
            style={{ color: '#e03060' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fff0f3')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            삭제
          </button>
        </div>
      )}

      {exportPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setExportPreview(null)}>
          <div style={{ background: 'var(--color-bg)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: '90%', maxHeight: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>내보내기 미리보기</p>
              <button onClick={() => setExportPreview(null)} style={{ fontSize: 18, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflow: 'auto', borderRadius: 8, border: '1px solid var(--color-border)', background: '#888' }}>
              <img src={exportPreview.dataUrl} alt="미리보기" draggable={false}
                style={{ display: 'block', maxWidth: '70vw', maxHeight: '60vh', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--color-primary-light)', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>파일명</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exportPreview.filename}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setExportPreview(null)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                취소
              </button>
              <button onClick={async () => {
                const b64 = exportPreview.dataUrl.split(',')[1]
                setExportPreview(null)
                await api.export.savePng(b64, exportPreview.filename)
              }}
                style={{ flex: 2, padding: '8px 0', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
