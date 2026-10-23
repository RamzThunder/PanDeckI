import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { TT_COLOR_DEFAULTS, TT_COLOR_PRESETS, TimetableColorKey, TimetableColors } from './TimetableClock'

const CUSTOM_COLORS_KEY = 'timetableCustomColors'
const CUSTOM_SLOTS = 10
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const TRANSPARENT_BG = 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 8px 8px'

const COLOR_ROWS: { key: TimetableColorKey; label: string; help: string }[] = [
  { key: 'bg', label: '배경', help: '어두운 색이면 글자가 자동으로 밝아져요' },
  { key: 'active', label: '진행 바', help: '진행 바 위 글자색은 자동으로 맞춰져요' },
  { key: 'inactive', label: '교시 블록', help: '진행되지 않은 부분의 바탕색' },
  { key: 'countdown', label: '카운트다운', help: '남은 시간 글자색' },
]

type CustomColors = Partial<Record<TimetableColorKey, string[]>>

interface Props {
  colors: TimetableColors
  bellAlert: boolean
  bellSeconds: number
  whattimeColors?: TimetableColors
  whattimeBell?: { enabled: boolean; seconds: number }
  onChange: (patch: { ttColors?: TimetableColors; ttBellAlert?: boolean; ttBellSeconds?: number }) => void
  onClose: () => void
}

function swatchStyle(color: string, selected: boolean): React.CSSProperties {
  return {
    background: color === '' ? TRANSPARENT_BG : color,
    border: color === '' || color.toLowerCase() === '#ffffff' ? '1.5px solid #ddd' : '1.5px solid transparent',
    outline: selected ? '2.5px solid #555' : 'none',
    outlineOffset: 2,
  }
}

export default function TimetableColorPanel({ colors, bellAlert, bellSeconds, whattimeColors, whattimeBell, onChange, onClose }: Props): JSX.Element {
  const [customs, setCustoms] = useState<CustomColors>({})
  const [hexDrafts, setHexDrafts] = useState<Partial<Record<TimetableColorKey, string>>>({})

  useEffect(() => {
    api.settings.get(CUSTOM_COLORS_KEY).then(raw => {
      if (raw) { try { setCustoms(JSON.parse(raw)) } catch {} }
    }).catch(() => {})
  }, [])

  const current = (key: TimetableColorKey) => colors[key] ?? TT_COLOR_DEFAULTS[key]
  const setColor = (key: TimetableColorKey, color: string) => {
    setHexDrafts(prev => ({ ...prev, [key]: undefined }))
    onChange({ ttColors: { ...colors, [key]: color } })
  }

  const saveCustoms = (next: CustomColors) => {
    setCustoms(next)
    api.settings.set(CUSTOM_COLORS_KEY, JSON.stringify(next)).catch(() => {})
  }

  const renderPicker = (key: TimetableColorKey, label: string, help: string) => {
    const value = current(key)
    const list = customs[key] ?? []
    return (
      <div key={key} className="tt-color-row">
        <div className="tt-color-row-head">
          <strong>{label}</strong>
          <small>{help}</small>
        </div>
        <div className="tt-color-row-inputs">
          <label className="tt-color-preview" style={{ background: value === '' ? TRANSPARENT_BG : value }} title="직접 고르기">
            <input type="color" value={HEX_RE.test(value) ? value : '#ffffff'} onChange={e => setColor(key, e.target.value)} />
          </label>
          <input className="tt-color-hex" value={hexDrafts[key] ?? (value === '' ? '투명' : value)}
            onChange={e => {
              const text = e.target.value.trim()
              setHexDrafts(prev => ({ ...prev, [key]: text }))
              const hex = text.startsWith('#') ? text : `#${text}`
              if (HEX_RE.test(hex)) onChange({ ttColors: { ...colors, [key]: hex.toLowerCase() } })
            }}
            onBlur={() => setHexDrafts(prev => ({ ...prev, [key]: undefined }))} />
          <div className="tt-color-swatches">
            {TT_COLOR_PRESETS[key].map(color => (
              <button key={color || 'transparent'} className="tt-color-swatch" title={color || '투명'}
                style={swatchStyle(color, color.toLowerCase() === value.toLowerCase())} onClick={() => setColor(key, color)} />
            ))}
          </div>
        </div>
        <div className="tt-color-swatches tt-color-customs">
          {Array.from({ length: CUSTOM_SLOTS }, (_, i) => list[i] ? (
            <span key={i} className="tt-color-custom-wrap">
              <button className="tt-color-swatch" title={list[i]} style={swatchStyle(list[i], list[i].toLowerCase() === value.toLowerCase())}
                onClick={() => setColor(key, list[i])} />
              <span className="tt-color-del" title="삭제" onClick={() => saveCustoms({ ...customs, [key]: list.filter((_, j) => j !== i) })}>×</span>
            </span>
          ) : (
            <button key={i} className="tt-color-swatch empty" title="현재 색상 저장"
              onClick={() => { if (HEX_RE.test(value) && !list.includes(value)) saveCustoms({ ...customs, [key]: [...list, value] }) }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="tt-color-panel" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <header>
        <strong>시정표 색상</strong>
        <button onClick={onClose}>×</button>
      </header>
      <div className="tt-color-actions">
        {whattimeColors && <button onClick={() => onChange({ ttColors: { ...whattimeColors }, ...(whattimeBell ? { ttBellAlert: whattimeBell.enabled, ttBellSeconds: whattimeBell.seconds } : {}) })}>Whattime 색 적용</button>}
        <button onClick={() => onChange({ ttColors: {} })}>기본값</button>
      </div>
      {COLOR_ROWS.map(row => renderPicker(row.key, row.label, row.help))}
      <div className="tt-color-bell">
        <label>
          <input type="checkbox" checked={bellAlert} onChange={e => onChange({ ttBellAlert: e.target.checked })} />
          <strong>종료 알림</strong>
          <small>개인 수업이 끝나기</small>
          <input type="number" min={1} max={600} value={bellSeconds} onChange={e => onChange({ ttBellSeconds: Math.max(1, Number(e.target.value) || 5) })} />
          <small>초 전부터 진행 바 색 변경</small>
        </label>
        {bellAlert && renderPicker('bell_alert', '알림 색', '끝날수록 진행 바가 이 색으로 바뀌어요')}
      </div>
    </div>
  )
}
