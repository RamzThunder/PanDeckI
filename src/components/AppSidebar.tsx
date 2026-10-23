import React from 'react'

interface Props {
  dashboardActive: boolean
  studentsActive: boolean
  settingsOpen: boolean
  fullscreen: boolean
  presenting?: boolean
  onFullscreen: () => void
  onDashboard: () => void
  onStudents: () => void
  onSettings: () => void
}

const DashboardIcon = () => <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>
const StudentsIcon = () => <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3.5 19c.4-3.4 2.2-5.2 5.5-5.2s5.1 1.8 5.5 5.2M14.5 14.2c3.4-.6 5.5 1 6 4.3"/></svg>
const SettingsIcon = () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05-2.87 2.87-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21h-4v-.05a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.05.05-2.87-2.87.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.05-.05 2.87-2.87.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.05a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.05-.05 2.87 2.87-.05.05A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21v4h-.05a1.7 1.7 0 0 0-1.55 1Z"/></svg>

const EnterFullscreenIcon = () => <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
const ExitFullscreenIcon = () => <svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>

export default function AppSidebar({ dashboardActive, studentsActive, settingsOpen, fullscreen, presenting, onFullscreen, onDashboard, onStudents, onSettings }: Props): JSX.Element {
  return (
    <aside className="app-sidebar">
      <button className="app-rail-logo" title="PanDeckI" onClick={onDashboard}>P</button>
      <nav className="app-rail-nav">
        <button className={dashboardActive ? 'active' : ''} title="대시보드" onClick={onDashboard}><DashboardIcon /></button>
        <button className={studentsActive ? 'active' : ''} title="학생 목록" onClick={onStudents}><StudentsIcon /></button>
      </nav>
      <button className={`app-rail-settings app-rail-fullscreen ${fullscreen ? 'active' : ''}`} title={presenting ? '발표 끝내기 (F11 / Esc)' : fullscreen ? '전체화면 끝내기 (F11)' : '전체화면 / 다른 디스플레이에 발표 (F11)'} onClick={onFullscreen}>{fullscreen ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}</button>
      <button className={`app-rail-settings ${settingsOpen ? 'active' : ''}`} title="설정" onClick={onSettings}><SettingsIcon /></button>
    </aside>
  )
}
