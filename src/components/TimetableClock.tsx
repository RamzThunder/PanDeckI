import React from 'react'

// Whattime(지금 몇교시야) schedule.json 포맷 중 시정 계산에 필요한 부분만 사용
export interface TimetableItem { name: string; start: string; end: string; no_countdown?: boolean }
export interface TimetablePersonal { name: string; room: string }
export interface TimetableSpecial { name?: string; dates?: string[]; schedule?: TimetableItem[] }

export interface TimetableSchedule {
  full: TimetableItem[]
  seven_period_days?: number[]
  six_period_days?: number[]
  short_days?: number[]
  personal?: Record<string, TimetablePersonal[]>
  rest_days?: number[]
  rest_schedules?: Record<string, TimetableItem[]>
  special_schedule_enabled?: boolean
  special_schedules?: TimetableSpecial[]
  special?: TimetableItem[]
  special_dates?: string[]
  time_offset_seconds?: number
  colors?: TimetableColors          // Whattime에서 가져온 색 (위젯에 적용 버튼으로 사용)
  bell_alert_enabled?: boolean
  bell_alert_seconds?: number
  // whattime: 설치된 Whattime과 자동 동기화 / file: 파일에서 가져옴 / manual: 판떼기에서 직접 편집
  source: 'whattime' | 'file' | 'manual'
  importedAt: string
}

/** 판떼기에서 처음 시정을 만들 때 쓰는 기본 시정 */
export function createDefaultTimetable(): TimetableSchedule {
  const rows: [string, string, string][] = [
    ['1교시', '09:00', '09:45'], ['2교시', '09:55', '10:40'], ['3교시', '10:50', '11:35'], ['4교시', '11:45', '12:30'],
    ['점심', '12:30', '13:20'], ['5교시', '13:20', '14:05'], ['6교시', '14:15', '15:00'], ['7교시', '15:10', '15:55'],
  ]
  return {
    full: rows.map(([name, start, end]) => ({ name, start, end })),
    seven_period_days: [1, 2, 3, 4, 5],
    rest_days: [0, 6],
    personal: {},
    special_schedule_enabled: false,
    special_schedules: [],
    time_offset_seconds: 0,
    source: 'manual',
    importedAt: new Date().toISOString(),
  }
}

// ── 색상 (Whattime 설정 > 색상과 같은 키/프리셋) ─────────────────────────────
export type TimetableColorKey = 'bg' | 'active' | 'inactive' | 'countdown' | 'bell_alert'
export type TimetableColors = Partial<Record<TimetableColorKey, string>>

export const TT_COLOR_DEFAULTS: Record<TimetableColorKey, string> = {
  bg: '#ffffff', active: '#000000', inactive: '#f1f1ef', countdown: '#2f6df6', bell_alert: '#ff3b30',
}

export const TT_COLOR_PRESETS: Record<TimetableColorKey, string[]> = {
  bg:         ['#ffffff', '#f9f9f8', '#f5f5f4', '#1a1a1a', ''],   // '' = 투명
  inactive:   ['#ffffff', '#f1f1ef', '#f5f5f4', '#1a1a1a', '#000000'],
  active:     ['#000000', '#787774', '#ffffff', '#2f6df6', '#eab308'],
  countdown:  ['#2f6df6', '#000000', '#e74c3c', '#16a34a', '#9333ea'],
  bell_alert: ['#ff3b30', '#ff9500', '#ffcc00', '#af52de', '#2f6df6'],
}

const WHATTIME_COLOR_KEYS: Record<TimetableColorKey, string> = {
  bg: 'bg_color', active: 'active_color', inactive: 'inactive_color', countdown: 'countdown_color', bell_alert: 'bell_alert_color',
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function blendColors(hex1: string, hex2: string, ratio: number): string {
  const c = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16)
  return '#' + [1, 3, 5].map(i => Math.round(c(hex1, i) + (c(hex2, i) - c(hex1, i)) * ratio).toString(16).padStart(2, '0')).join('')
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Whattime applyTheme와 같은 규칙으로 CSS 변수 계산: 배경 명도 → 글자색, 진행 바 명도 → 진행 바 위 글자색 */
function colorVars(colors: TimetableColors | undefined): Record<string, string> {
  const pick = (key: TimetableColorKey) => {
    const value = colors?.[key]
    return value !== undefined && (value === '' || HEX_RE.test(value)) ? value : TT_COLOR_DEFAULTS[key]
  }
  const bg = pick('bg')
  const active = HEX_RE.test(pick('active')) ? pick('active') : TT_COLOR_DEFAULTS.active
  const dark = HEX_RE.test(bg) && luminance(bg) < 0.5
  return {
    '--tt-bg': bg === '' ? 'transparent' : bg,
    '--tt-fg': dark ? '#ffffff' : '#1a1a1a',
    '--tt-fg-dim': dark ? 'rgba(255,255,255,0.55)' : '#787774',
    '--tt-active': active,
    '--tt-active-text': luminance(active) > 0.55 ? '#000000' : '#ffffff',
    '--tt-inactive': pick('inactive') || TT_COLOR_DEFAULTS.inactive,
    '--tt-countdown': pick('countdown') || TT_COLOR_DEFAULTS.countdown,
  }
}

const SCHEDULE_KEYS = [
  'full', 'seven_period_days', 'six_period_days', 'short_days', 'personal', 'rest_days', 'rest_schedules',
  'special_schedule_enabled', 'special_schedules', 'special', 'special_dates', 'time_offset_seconds',
  'bell_alert_enabled', 'bell_alert_seconds',
] as const

const TIME_RE = /^\d{1,2}:\d{2}$/

function isItem(value: unknown): value is TimetableItem {
  const item = value as TimetableItem
  return !!item && typeof item.name === 'string' && TIME_RE.test(item.start) && TIME_RE.test(item.end)
}

/** Whattime schedule.json(또는 설정 백업) 문자열을 시정표로 변환. 형식이 맞지 않으면 예외 */
export function parseWhattimeSchedule(raw: string, source: TimetableSchedule['source']): TimetableSchedule {
  const data = JSON.parse(raw) as Record<string, unknown>
  if (!data || !Array.isArray(data.full) || !data.full.every(isItem)) {
    throw new Error('Whattime 시정표 형식이 아니에요. (full 시정이 없음)')
  }
  // 노션 토큰 등 시정과 무관한 값은 저장하지 않음
  const picked: Record<string, unknown> = {}
  for (const key of SCHEDULE_KEYS) if (data[key] !== undefined) picked[key] = data[key]
  const colors: TimetableColors = {}
  for (const [key, dataKey] of Object.entries(WHATTIME_COLOR_KEYS) as [TimetableColorKey, string][]) {
    const value = data[dataKey]
    if (typeof value === 'string' && (HEX_RE.test(value) || (key === 'bg' && value === ''))) colors[key] = value
  }
  if (Object.keys(colors).length > 0) picked.colors = colors
  return { ...(picked as Omit<TimetableSchedule, 'source' | 'importedAt'>), source, importedAt: new Date().toISOString() }
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function deriveSixPeriodSchedule(schedule: TimetableItem[]): TimetableItem[] {
  const seventhIndex = schedule.findIndex(item => /^\s*7교시/.test(item.name))
  if (seventhIndex < 0) return schedule
  const sixth = schedule.find(item => /^\s*6교시/.test(item.name))
  return schedule
    .filter((_, index) => index !== seventhIndex)
    .map((item, filteredIndex) => {
      const originalIndex = filteredIndex < seventhIndex ? filteredIndex : filteredIndex + 1
      const isTerminal = /수업\s*끝|수업\s*종료|일정\s*종료/.test(item.name)
      if (sixth && originalIndex > seventhIndex && isTerminal) return { ...item, start: sixth.end }
      return item
    })
}

export function getSevenPeriodDays(schedule: TimetableSchedule): number[] {
  if (Array.isArray(schedule.seven_period_days)) return schedule.seven_period_days
  const oldSixDays = schedule.six_period_days ?? schedule.short_days ?? [3, 5]
  return [1, 2, 3, 4, 5].filter(d => !oldSixDays.includes(d))
}

/** 특별 시정을 제외한 요일별 일반 시정 (7교시 없는 요일은 7교시 제외) */
export function getRegularSchedule(schedule: TimetableSchedule, day: number): TimetableItem[] {
  return getSevenPeriodDays(schedule).includes(day) ? schedule.full : deriveSixPeriodSchedule(schedule.full)
}

/** Whattime getTodaySchedule와 동일한 규칙: 쉬는 날 → 특별 시정 → 7교시/6교시 일반 시정 */
function getTodaySchedule(schedule: TimetableSchedule, date: Date): TimetableItem[] {
  const day = date.getDay()
  const restDays = schedule.rest_days ?? [0, 6]
  if (restDays.includes(day)) return schedule.rest_schedules?.[String(day)] ?? []

  if (schedule.special_schedule_enabled === true) {
    const dateKey = localDateKey(date)
    const profiles = Array.isArray(schedule.special_schedules) ? schedule.special_schedules : []
    const profile = profiles.find(item => Array.isArray(item?.dates) && item.dates.includes(dateKey))
    if (profile && Array.isArray(profile.schedule) && profile.schedule.length > 0) return profile.schedule
    const legacy = schedule.special ?? []
    if (!profiles.length && (schedule.special_dates ?? []).includes(dateKey) && legacy.length > 0) return legacy
  }

  return getRegularSchedule(schedule, day)
}

function isItemActive(sMin: number, eMin: number, currentMinutes: number): boolean {
  if (eMin <= sMin) return currentMinutes >= sMin
  return currentMinutes >= sMin && currentMinutes < eMin
}

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

interface RowInfo { item: TimetableItem; personal?: TimetablePersonal; state: 'past' | 'active' | 'future'; progress: number }

interface TimetableStatus {
  title: string
  personal?: string
  countdownLabel?: string
  countdown?: string
  remainingMs?: number
  active?: RowInfo
  rows: RowInfo[]
}

// Whattime 미니 모드 카운트다운 표기: "N분 SS초" (1시간 이상이면 시간도 표시)
function formatRemainingKo(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}시간 ${m}분 ${s}초` : `${m}분 ${s}초`
}

function getTimetableStatus(schedule: TimetableSchedule, time: Date): TimetableStatus {
  const now = new Date(time.getTime() + (schedule.time_offset_seconds ?? 0) * 1000)
  const msOfDay = now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const today = getTodaySchedule(schedule, now)
  const personalList = schedule.personal?.[String(now.getDay())] ?? []

  // 개인 시간표는 Whattime과 같이 오늘 시정의 순서(index)로 매칭
  const rows: RowInfo[] = []
  let active: RowInfo | undefined
  today.forEach((item, index) => {
    const sMin = toMinutes(item.start)
    const eMin = toMinutes(item.end)
    const isActive = isItemActive(sMin, eMin, currentMinutes)
    const span = ((eMin <= sMin ? eMin + 1440 : eMin) - sMin) * 60000
    const progress = isActive ? Math.min(1, Math.max(0, (msOfDay - sMin * 60000) / span)) : 0
    const row: RowInfo = {
      item,
      personal: personalList[index],
      state: isActive ? 'active' : currentMinutes >= eMin && eMin > sMin ? 'past' : 'future',
      progress,
    }
    if (item.no_countdown) return
    rows.push(row)
    if (isActive) active = row
  })

  if (today.length === 0) return { title: '쉬는 날', rows }

  if (active) {
    const sMin = toMinutes(active.item.start)
    let endMs = toMinutes(active.item.end) * 60000
    if (endMs <= sMin * 60000 && msOfDay > endMs) endMs += 86400000
    const personal = active.personal ? [active.personal.room, active.personal.name].filter(Boolean).join(' ') : ''
    return {
      title: active.item.name,
      personal: personal || undefined,
      countdownLabel: '종료까지',
      countdown: formatRemaining(endMs - msOfDay),
      remainingMs: endMs - msOfDay,
      active,
      rows,
    }
  }

  const next = rows.find(row => toMinutes(row.item.start) > currentMinutes)
  if (next) {
    const started = rows.some(row => row.state === 'past')
    const remainingMs = toMinutes(next.item.start) * 60000 - msOfDay
    return {
      title: started ? '쉬는 시간' : '수업 전',
      countdownLabel: `${next.item.name} 시작까지`,
      countdown: formatRemaining(remainingMs),
      remainingMs,
      rows,
    }
  }

  return { title: '오늘 일정 종료', rows }
}

interface RowAlert { fill: string; text: string }

function PeriodRow({ row, showPersonal, className = '', alert }: { row: RowInfo; showPersonal: boolean; className?: string; alert?: RowAlert }): JSX.Element {
  const personal = showPersonal && row.personal ? [row.personal.room, row.personal.name].filter(Boolean).join(' ') : ''
  const content = (
    <>
      <span className="timetable-clock-row-name">
        {row.item.name}
        {personal && <em>{personal}</em>}
      </span>
      {row.item.start && <span className="timetable-clock-row-time">{row.item.start} - {row.item.end}</span>}
    </>
  )
  return (
    <div className={`timetable-clock-row ${row.state} ${className}`}>
      <div className="timetable-clock-row-base">{content}</div>
      {row.state === 'active' && (<>
        <div className="timetable-clock-row-fill" style={{ width: `${row.progress * 100}%`, ...(alert ? { background: alert.fill } : {}) }} />
        {/* 진행된 부분만 글자색을 바꿔 보여주는 Whattime 스타일 */}
        <div className="timetable-clock-row-base timetable-clock-row-over" style={{ clipPath: `inset(0 ${100 - row.progress * 100}% 0 0)`, ...(alert ? { color: alert.text } : {}) }}>{content}</div>
      </>)}
    </div>
  )
}

interface Props {
  time: Date
  schedule: TimetableSchedule | null
  width: number
  mode: 'mini' | 'full'
  showPersonal: boolean
  colors?: TimetableColors
  bellAlert?: { enabled: boolean; seconds: number }
}

export default function TimetableClock({ time, schedule, width, mode, showPersonal, colors, bellAlert }: Props): JSX.Element {
  // 기본 폭 300px 기준으로 내부 글자/여백을 비율 확대
  const style = { '--tt-s': String(width / 300), ...colorVars(colors) } as React.CSSProperties

  if (!schedule) {
    return (
      <div className="timetable-clock timetable-clock-empty" style={style}>
        <strong>시정표가 없어요</strong>
        <span>위젯을 선택하고 툴바의<br />"시정 설정"을 눌러주세요</span>
      </div>
    )
  }

  const status = getTimetableStatus(schedule, time)
  const clockText = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`

  // 종료 알림: 개인 수업이 있는 교시가 끝나기 N초 전부터 진행 바 색을 알림 색으로 점점 바꿈 (Whattime bell_alert)
  let alert: RowAlert | undefined
  const activePersonal = status.active?.personal
  if (bellAlert?.enabled && activePersonal && (activePersonal.room || activePersonal.name) && status.remainingMs !== undefined) {
    const seconds = Math.max(1, bellAlert.seconds)
    const remaining = status.remainingMs / 1000
    if (remaining >= 0 && remaining <= seconds) {
      const vars = colorVars(colors)
      const fill = blendColors(vars['--tt-active'], HEX_RE.test(colors?.bell_alert ?? '') ? colors!.bell_alert! : TT_COLOR_DEFAULTS.bell_alert, (seconds - remaining) / seconds)
      alert = { fill, text: luminance(fill) > 0.55 ? '#000000' : '#ffffff' }
    }
  }

  if (mode === 'mini') {
    // Whattime 미니 모드: 시각 / 현재 교시 블록 하나 / 카운트다운 한 줄
    const row: RowInfo = status.active ?? { item: { name: status.title, start: '', end: '' }, state: 'future', progress: 0 }
    const timerText = status.remainingMs === undefined
      ? status.title
      : status.active
        ? `${status.active.item.name} 종료까지 ${formatRemainingKo(status.remainingMs)}`
        : `${status.countdownLabel} ${formatRemainingKo(status.remainingMs)}`
    return (
      <div className="timetable-clock timetable-clock-mini" style={style}>
        <span className="timetable-clock-mini-now">{clockText}</span>
        <PeriodRow row={row} showPersonal={showPersonal} className={status.active ? '' : 'inactive'} alert={alert} />
        <span className="timetable-clock-mini-timer">{timerText}</span>
      </div>
    )
  }

  return (
    <div className="timetable-clock" style={style}>
      <div className="timetable-clock-head">
        <span className="timetable-clock-now">{clockText}</span>
        <strong className="timetable-clock-title">{status.title}</strong>
        {showPersonal && status.personal && <span className="timetable-clock-personal">{status.personal}</span>}
        {status.countdown && (
          <span className="timetable-clock-countdown">
            <small>{status.countdownLabel}</small>
            {status.countdown}
          </span>
        )}
      </div>
      {status.rows.length > 0 && (
        <div className="timetable-clock-list">
          {status.rows.map((row, index) => <PeriodRow key={index} row={row} showPersonal={showPersonal} alert={row === status.active ? alert : undefined} />)}
        </div>
      )}
    </div>
  )
}
