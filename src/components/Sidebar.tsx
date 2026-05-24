import React from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ViewMode } from '../store/diary'

const startDrag = () => invoke('window_start_dragging')

interface Props {
  viewMode: ViewMode
  currentDate: Date
  onViewChange: (v: ViewMode) => void
  onDateSelect: (d: Date) => void
  onThemeToggle: () => void
  themeOpen: boolean
  onSave: () => void
  onExport: () => void
  exportPrivacy: boolean
  onPrivacyToggle: () => void
}

const ICONS = {
  monthly:  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2.5" ry="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  daily:    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M 8 21 H 5 a 2 2 0 0 1 -2 -2 V 5 a 2 2 0 0 1 2 -2 h 10 a 2 2 0 0 1 2 2 v 2"/><line x1="7" y1="9" x2="12" y2="9"/><line x1="7" y1="13" x2="9" y2="13"/><path d="M19.5 8.5a1.5 1.5 0 0 0-2.12 0l-6.88 6.88v3h3l6.88-6.88a1.5 1.5 0 0 0 0-2.12z"/><line x1="16" y1="10" x2="18" y2="12"/></svg>,
  export:   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  save:     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M 6 21 v -5 a 1 1 0 0 1 1 -1 h 10 a 1 1 0 0 1 1 1 v 5"/><path d="M 8 3 v 4 a 1 1 0 0 0 1 1 h 6 a 1 1 0 0 0 1 -1 v -4"/></svg>,
  settings: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
}

const views: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'monthly', label: '월간', icon: ICONS.monthly },
  { id: 'daily',   label: '일간', icon: ICONS.daily   },
]

const TrafficLight = ({ color, hoverColor, onClick }: { color: string; hoverColor: string; onClick: () => void }) => {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onClick={onClick}
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 12, height: 12, borderRadius: '50%', cursor: 'pointer',
        background: hovered ? hoverColor : color,
        transition: 'background 0.1s',
        flexShrink: 0,
      }}
    />
  )
}

export default function Sidebar({ viewMode, currentDate, onViewChange, onThemeToggle, themeOpen, onSave, onExport, exportPrivacy, onPrivacyToggle }: Props): JSX.Element {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  return (
    <aside
      className="w-16 flex flex-col items-center shrink-0 gap-2"
      style={{ background: 'var(--color-sidebar)', borderRight: '1px solid var(--color-border)' }}
    >
      {/* 드래그 가능한 트래픽라이트 영역 */}
      <div
        className="w-full flex items-center justify-center gap-1.5 shrink-0"
        style={{ height: 36, paddingTop: 4 }}
        onMouseDown={startDrag}
      >
        <TrafficLight color="#FF5F57" hoverColor="#E0443E" onClick={() => invoke('window_close')} />
        <TrafficLight color="#FEBC2E" hoverColor="#D49B1C" onClick={() => invoke('window_minimize')} />
        <TrafficLight color="#28C840" hoverColor="#1DAF34" onClick={() => invoke('window_toggle_maximize')} />
      </div>

      {/* 연/월 표시 */}
      <div className="mb-4 mt-2 text-center">
        <div className="text-xs font-bold" style={{ color: 'var(--color-primary-dark)' }}>
          {year}
        </div>
        <div className="text-lg font-bold" style={{ color: 'var(--color-primary-dark)' }}>
          {String(month).padStart(2, '0')}
        </div>
      </div>

      {views.map((v) => (
        <button
          key={v.id}
          onClick={() => onViewChange(v.id)}
          title={v.label}
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
          style={{
            background: viewMode === v.id ? 'var(--color-primary)' : 'transparent',
            color: viewMode === v.id ? '#fff' : 'var(--color-text-muted)'
          }}
        >
          {v.icon}
        </button>
      ))}

      {/* 내보내기 버튼 */}
      <button
        onClick={onExport}
        className="w-11 h-11 rounded-xl flex items-center justify-center transition-all mt-1"
        style={{ background: 'transparent', color: 'var(--color-text-muted)' }}
        title="PNG로 내보내기"
      >
        {ICONS.export}
      </button>

      {/* 프라이버시 토글 */}
      <button
        onClick={onPrivacyToggle}
        title={exportPrivacy ? '프라이버시 보호 필터 ON — 클릭하여 끄기' : '프라이버시 보호 필터 OFF — 클릭하여 켜기'}
        style={{
          width: 48, height: 18, borderRadius: 9,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.02em',
          cursor: 'pointer', border: 'none', outline: 'none',
          transition: 'background 0.2s, color 0.2s',
          background: exportPrivacy ? 'var(--color-primary)' : 'transparent',
          color: exportPrivacy ? '#fff' : 'var(--color-text-muted)',
          boxShadow: exportPrivacy ? 'none' : 'inset 0 0 0 1px var(--color-border)',
          flexShrink: 0,
        }}
      >
        {exportPrivacy ? '필터 켜짐' : '필터 꺼짐'}
      </button>

      <div className="flex-1" style={{ width: '100%', cursor: 'move' }} onMouseDown={startDrag} />

      {/* 수동 저장 버튼 (설정 버튼 위) */}
      <button
        onClick={onSave}
        className="w-11 h-11 rounded-xl flex items-center justify-center transition-all mb-1"
        style={{ background: 'transparent', color: 'var(--color-text-muted)' }}
        title="저장"
      >
        {ICONS.save}
      </button>

      <button
        onClick={onThemeToggle}
        className="w-11 h-11 rounded-xl flex items-center justify-center transition-all mb-4"
        style={{
          background: themeOpen ? 'var(--color-primary)' : 'transparent',
          color: themeOpen ? '#fff' : 'var(--color-text-muted)'
        }}
        title="설정"
      >
        {ICONS.settings}
      </button>
    </aside>
  )
}
