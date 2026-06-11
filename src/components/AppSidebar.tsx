import React from 'react'

interface Props {
  dashboardActive: boolean
  settingsOpen: boolean
  onDashboard: () => void
  onSettings: () => void
}

const DashboardIcon = () => <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>
const SettingsIcon = () => <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05-2.87 2.87-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21h-4v-.05a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.05.05-2.87-2.87.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.05-.05 2.87-2.87.05.05A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.05a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.05-.05 2.87 2.87-.05.05A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21v4h-.05a1.7 1.7 0 0 0-1.55 1Z"/></svg>

export default function AppSidebar({ dashboardActive, settingsOpen, onDashboard, onSettings }: Props): JSX.Element {
  return (
    <aside className="app-sidebar">
      <button className="app-rail-logo" title="PanDeckI" onClick={onDashboard}>P</button>
      <nav className="app-rail-nav">
        <button className={dashboardActive ? 'active' : ''} title="대시보드" onClick={onDashboard}><DashboardIcon /></button>
      </nav>
      <button className={`app-rail-settings ${settingsOpen ? 'active' : ''}`} title="설정" onClick={onSettings}><SettingsIcon /></button>
    </aside>
  )
}
