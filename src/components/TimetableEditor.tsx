import React, { useState } from 'react'
import { api } from '../api'
import {
  TimetableItem, TimetablePersonal, TimetableSchedule, TimetableSpecial,
  createDefaultTimetable, getRegularSchedule, getSevenPeriodDays, parseWhattimeSchedule,
} from './TimetableClock'

type Tab = 'regular' | 'personal' | 'special' | 'etc'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const SCHOOL_DAYS = [1, 2, 3, 4, 5]
const TIME_RE = /^\d{2}:\d{2}$/

function normalizeTime(value: string): string {
  const [h, m] = value.split(':')
  return `${String(Number(h) || 0).padStart(2, '0')}:${String(Number(m) || 0).padStart(2, '0')}`
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function normalizeRows(rows: TimetableItem[]): TimetableItem[] {
  return rows.map(row => ({ ...row, start: normalizeTime(row.start), end: normalizeTime(row.end) }))
}

function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort()
}

// 일반 시정 순서가 바뀌면 개인 시간표 칸도 같은 순서로 따라가도록 맞춤
function remapPersonal(personal: TimetableSchedule['personal'], op: (list: TimetablePersonal[]) => TimetablePersonal[]) {
  const next: Record<string, TimetablePersonal[]> = {}
  for (const [day, list] of Object.entries(personal ?? {})) next[day] = op([...list])
  return next
}

interface RowsProps {
  rows: TimetableItem[]
  onChange: (rows: TimetableItem[], op?: (list: TimetablePersonal[]) => TimetablePersonal[]) => void
}

function ScheduleRows({ rows, onChange }: RowsProps): JSX.Element {
  const update = (index: number, patch: Partial<TimetableItem>) =>
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row))

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    const swap = <T,>(list: T[]) => { const next = [...list]; [next[index], next[target]] = [next[target], next[index]]; return next }
    onChange(swap(rows), list => { while (list.length <= Math.max(index, target)) list.push({ name: '', room: '' }); return swap(list) })
  }

  const remove = (index: number) =>
    onChange(rows.filter((_, i) => i !== index), list => list.filter((_, i) => i !== index))

  const add = () => {
    const last = rows[rows.length - 1]
    const start = last ? addMinutes(last.end, 10) : '09:00'
    const nextNumber = rows.filter(row => /교시/.test(row.name)).length + 1
    onChange([...rows, { name: `${nextNumber}교시`, start, end: addMinutes(start, 45) }])
  }

  return (
    <div className="tt-editor-rows">
      <div className="tt-editor-row tt-editor-row-head">
        <span>이름</span><span>시작</span><span>종료</span><span title="카운트다운에서 제외">제외</span><span />
      </div>
      {rows.map((row, index) => (
        <div key={index} className={`tt-editor-row ${row.no_countdown ? 'muted' : ''}`}>
          <input value={row.name} placeholder="예: 1교시" onChange={e => update(index, { name: e.target.value })} />
          <input type="time" value={normalizeTime(row.start)} onChange={e => update(index, { start: e.target.value })} />
          <input type="time" value={normalizeTime(row.end)} onChange={e => update(index, { end: e.target.value })} />
          <input type="checkbox" checked={!!row.no_countdown} title="카운트다운·시계 표시에서 제외 (예: 영업시간)"
            onChange={e => update(index, { no_countdown: e.target.checked || undefined })} />
          <span className="tt-editor-row-actions">
            <button onClick={() => move(index, -1)} disabled={index === 0} title="위로">↑</button>
            <button onClick={() => move(index, 1)} disabled={index === rows.length - 1} title="아래로">↓</button>
            <button onClick={() => remove(index)} title="삭제" className="danger">×</button>
          </span>
        </div>
      ))}
      <button className="tt-editor-add" onClick={add}>+ 교시 추가</button>
    </div>
  )
}

interface Props {
  initial: TimetableSchedule | null
  onSave: (schedule: TimetableSchedule) => void
  onClose: () => void
}

export default function TimetableEditor({ initial, onSave, onClose }: Props): JSX.Element {
  const [draft, setDraft] = useState<TimetableSchedule>(() => initial ? structuredClone(initial) : createDefaultTimetable())
  const [edited, setEdited] = useState(false)
  const [tab, setTab] = useState<Tab>('regular')
  const [personalDay, setPersonalDay] = useState(1)
  const [notice, setNotice] = useState('')

  const change = (patch: Partial<TimetableSchedule>) => {
    setDraft(prev => ({ ...prev, ...patch }))
    setEdited(true)
  }

  const importFrom = async (from: 'whattime' | 'file') => {
    try {
      const raw = from === 'whattime' ? await api.whattime.readInstalled() : await api.whattime.pick()
      if (!raw) {
        if (from === 'whattime') setNotice('이 컴퓨터에서 Whattime 시정표를 찾지 못했어요. "파일에서"로 schedule.json이나 백업 파일을 골라주세요.')
        return
      }
      setDraft(parseWhattimeSchedule(raw, from))
      setEdited(false)
      setNotice(from === 'whattime' ? 'Whattime 앱의 시정을 가져왔어요. 저장 후에도 Whattime과 자동으로 맞춰져요.' : '파일에서 시정을 가져왔어요.')
    } catch (error) {
      setNotice(`불러오지 못했어요: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const allRows = [...draft.full, ...(draft.special_schedules ?? []).flatMap(profile => profile.schedule ?? [])]
  const invalid = allRows.some(row => !TIME_RE.test(normalizeTime(row.start)) || !TIME_RE.test(normalizeTime(row.end)) || !row.name.trim())

  const save = () => {
    if (invalid) { setNotice('이름이나 시간이 비어 있는 교시가 있어요.'); return }
    onSave({
      ...draft,
      full: normalizeRows(draft.full),
      special_schedules: (draft.special_schedules ?? []).map(profile => ({ ...profile, schedule: normalizeRows(profile.schedule ?? []) })),
      // 직접 고친 경우 Whattime 자동 동기화가 편집 내용을 덮어쓰지 않도록 수동으로 전환
      source: edited ? 'manual' : draft.source,
      importedAt: new Date().toISOString(),
    })
  }

  // ── 개인 시간표 ─────────────────────────────────────────
  const personalRows = getRegularSchedule(draft, personalDay)
  const personalList = draft.personal?.[String(personalDay)] ?? []
  const updatePersonal = (index: number, patch: Partial<TimetablePersonal>) => {
    const list = [...personalList]
    while (list.length < personalRows.length) list.push({ name: '', room: '' })
    list[index] = { ...list[index], ...patch }
    change({ personal: { ...draft.personal, [String(personalDay)]: list } })
  }

  // ── 특별 시정 ───────────────────────────────────────────
  const specials = draft.special_schedules ?? []
  const updateSpecial = (index: number, patch: Partial<TimetableSpecial>) =>
    change({ special_schedules: specials.map((profile, i) => i === index ? { ...profile, ...patch } : profile) })
  const addSpecial = () => change({
    special_schedule_enabled: true,
    special_schedules: [...specials, { name: `특별 시정 ${specials.length + 1}`, dates: [], schedule: structuredClone(draft.full) }],
  })

  const sevenDays = getSevenPeriodDays(draft)
  const restDays = draft.rest_days ?? [0, 6]

  const sourceLabel = draft.source === 'whattime' && !edited ? 'Whattime 앱과 자동 동기화 중'
    : draft.source === 'file' && !edited ? '파일에서 가져옴' : '판떼기에서 직접 편집'

  return (
    <div className="create-board-backdrop" onClick={onClose} onPointerDown={e => e.stopPropagation()}>
      <section className="create-board-modal tt-editor" onClick={e => e.stopPropagation()}>
        <header>
          <div>
            <small>Timetable</small>
            <h2>시정 설정</h2>
            <p className="tt-editor-source">{sourceLabel}</p>
          </div>
          <button onClick={onClose}>×</button>
        </header>

        <div className="tt-editor-import">
          <span>Whattime 시정 가져오기</span>
          <button onClick={() => importFrom('whattime')}>앱에서 불러오기</button>
          <button onClick={() => importFrom('file')}>파일에서</button>
        </div>
        {notice && <p className="tt-editor-notice">{notice}</p>}

        <nav className="tt-editor-tabs">
          {([['regular', '일반 시정'], ['personal', '개인 시간표'], ['special', '특별 시정'], ['etc', '요일 · 보정']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>

        <div className="tt-editor-body">
          {tab === 'regular' && (<>
            <p className="tt-editor-help">7교시까지 있는 날 기준으로 입력하세요. 7교시가 없는 요일은 "요일 · 보정" 탭에서 정하면 7교시가 자동으로 빠져요.</p>
            <ScheduleRows rows={draft.full} onChange={(rows, op) => change(op ? { full: rows, personal: remapPersonal(draft.personal, op) } : { full: rows })} />
          </>)}

          {tab === 'personal' && (<>
            <p className="tt-editor-help">요일별로 반과 과목을 넣으면 시계에 함께 표시돼요. (툴바의 "반" 버튼으로 숨길 수 있어요)</p>
            <div className="tt-editor-days">
              {SCHOOL_DAYS.map(day => (
                <button key={day} className={personalDay === day ? 'active' : ''} onClick={() => setPersonalDay(day)}>{WEEKDAYS[day]}</button>
              ))}
            </div>
            <div className="tt-editor-rows">
              <div className="tt-editor-row tt-editor-personal-row tt-editor-row-head"><span>교시</span><span>반</span><span>과목</span></div>
              {personalRows.map((row, index) => (
                <div key={index} className={`tt-editor-row tt-editor-personal-row ${row.no_countdown ? 'muted' : ''}`}>
                  <span className="tt-editor-period">{row.name}<small>{row.start} - {row.end}</small></span>
                  <input value={personalList[index]?.room ?? ''} placeholder="예: 3-4" onChange={e => updatePersonal(index, { room: e.target.value })} />
                  <input value={personalList[index]?.name ?? ''} placeholder="예: 국어" onChange={e => updatePersonal(index, { name: e.target.value })} />
                </div>
              ))}
            </div>
          </>)}

          {tab === 'special' && (<>
            <label className="tt-editor-check">
              <input type="checkbox" checked={draft.special_schedule_enabled === true} onChange={e => change({ special_schedule_enabled: e.target.checked })} />
              특별 시정 사용 — 지정한 날짜에는 일반 시정 대신 적용돼요
            </label>
            {specials.map((profile, index) => (
              <div key={index} className="tt-editor-special">
                <div className="tt-editor-special-head">
                  <input value={profile.name ?? ''} placeholder="시정 이름 (예: 단축수업)" onChange={e => updateSpecial(index, { name: e.target.value })} />
                  <button className="danger" onClick={() => change({ special_schedules: specials.filter((_, i) => i !== index) })}>삭제</button>
                </div>
                <div className="tt-editor-dates">
                  {(profile.dates ?? []).map(date => (
                    <span key={date}>{date}<button onClick={() => updateSpecial(index, { dates: (profile.dates ?? []).filter(d => d !== date) })}>×</button></span>
                  ))}
                  <input type="date" title="적용할 날짜 추가" value="" onChange={e => {
                    const date = e.target.value
                    if (date && !(profile.dates ?? []).includes(date)) updateSpecial(index, { dates: [...(profile.dates ?? []), date].sort() })
                  }} />
                </div>
                <ScheduleRows rows={profile.schedule ?? []} onChange={rows => updateSpecial(index, { schedule: rows })} />
              </div>
            ))}
            <button className="tt-editor-add" onClick={addSpecial}>+ 특별 시정 추가 (일반 시정 복사)</button>
          </>)}

          {tab === 'etc' && (<>
            <div className="tt-editor-field">
              <strong>7교시가 있는 요일</strong>
              <div className="tt-editor-days">
                {SCHOOL_DAYS.map(day => (
                  <button key={day} className={sevenDays.includes(day) ? 'active' : ''} onClick={() => change({ seven_period_days: toggleDay(sevenDays, day) })}>{WEEKDAYS[day]}</button>
                ))}
              </div>
            </div>
            <div className="tt-editor-field">
              <strong>쉬는 날</strong>
              <div className="tt-editor-days">
                {WEEKDAYS.map((label, day) => (
                  <button key={day} className={restDays.includes(day) ? 'active' : ''} onClick={() => change({ rest_days: toggleDay(restDays, day) })}>{label}</button>
                ))}
              </div>
            </div>
            <div className="tt-editor-field">
              <strong>시간 보정 (초)</strong>
              <span className="tt-editor-help">학교 종보다 시계가 늦으면 +, 빠르면 − 로 맞춰요.</span>
              <input type="number" step={1} value={draft.time_offset_seconds ?? 0}
                onChange={e => change({ time_offset_seconds: Number(e.target.value) || 0 })} style={{ width: 120 }} />
            </div>
          </>)}
        </div>

        <footer>
          <button onClick={onClose}>취소</button>
          <button className="primary" onClick={save} disabled={invalid}>저장</button>
        </footer>
      </section>
    </div>
  )
}
