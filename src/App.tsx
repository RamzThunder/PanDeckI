import React, { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import DailyView from './pages/DailyView'
import AppSidebar from './components/AppSidebar'
import SettingsPanel from './components/SettingsPanel'
import UpdateNotice from './components/UpdateNotice'
import Dashboard, { BoardInfo } from './pages/Dashboard'
import StudentLists, { StudentList } from './pages/StudentLists'
import { api } from './api'
import { PRESET_THEMES, applyGlobalFont, applyTheme } from './store/theme'

const DEFAULT_CATEGORIES = ['수업', '학급 운영', '행사', '개인', '기타']
const APP_WIDTH = 1800
const APP_HEIGHT = 1012
const WINDOW_TITLEBAR_HEIGHT = 28
const SIDEBAR_WIDTH = 56
type AppView = 'dashboard' | 'students'

function resizeWindow(zoom: number) {
  invoke('resize_window', {
    width: Math.round(APP_WIDTH * zoom),
    height: Math.round(APP_HEIGHT * zoom) + WINDOW_TITLEBAR_HEIGHT,
  }).catch(() => {})
}

export default function App(): JSX.Element {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeThemeId, setActiveThemeId] = useState('sky')
  const [appZoom, setAppZoom] = useState(1)
  const [fontScale, setFontScale] = useState(1)
  const [fontOffsetY, setFontOffsetY] = useState(0)
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [globalFont, setGlobalFont] = useState('')
  const [boards, setBoards] = useState<BoardInfo[]>([])
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [activeBoard, setActiveBoard] = useState<BoardInfo | null>(null)
  const [dashboardCategory, setDashboardCategory] = useState('전체')
  const [createRequest, setCreateRequest] = useState(0)
  const [appView, setAppView] = useState<AppView>('dashboard')
  const [studentLists, setStudentLists] = useState<StudentList[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const zoomRef = useRef(appZoom)
  zoomRef.current = appZoom
  const fullscreenRef = useRef(isFullscreen)
  fullscreenRef.current = isFullscreen

  const toggleFullscreen = () => {
    const next = !fullscreenRef.current
    fullscreenRef.current = next
    setIsFullscreen(next)
    invoke('set_fullscreen', { fullscreen: next }).catch(() => {})
  }

  useEffect(() => {
    // 창 크기가 바뀔 때(전체화면 진입/해제, 초록 버튼 등) 실제 전체화면 여부와 뷰포트를 동기화
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      invoke<boolean>('is_fullscreen').then(value => {
        fullscreenRef.current = value
        setIsFullscreen(value)
      }).catch(() => {})
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    // F11 또는 Cmd+Ctrl+F로 전체화면 토글
    const onKeyDown = (event: KeyboardEvent) => {
      const macCombo = event.metaKey && event.ctrlKey && event.key.toLowerCase() === 'f'
      if (event.key !== 'F11' && !macCombo) return
      event.preventDefault()
      toggleFullscreen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('is-fullscreen', isFullscreen)
  }, [isFullscreen])

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (!event.metaKey && !event.ctrlKey) return
      event.preventDefault()
      if (fullscreenRef.current) return
      const delta = event.deltaY > 0 ? -0.05 : 0.05
      const next = Math.max(0.5, Math.min(1.5, Math.round((zoomRef.current + delta) * 20) / 20))
      zoomRef.current = next
      setAppZoom(next)
      resizeWindow(next)
      api.settings.set('appZoom', String(next)).catch(() => {})
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    async function loadSettings() {
      const settings = await invoke<Record<string, string>>('get_settings_batch', {
        keys: ['active_theme', 'globalFont', 'pandecki_boards', 'pandecki_categories', 'pandecki_student_lists', 'appZoom', 'fontScale', 'fontOffsetY'],
      }).catch(() => ({} as Record<string, string>))

      const themeId = settings.active_theme ?? 'sky'
      setActiveThemeId(themeId)
      const preset = PRESET_THEMES.find(theme => theme.id === themeId)
      if (preset) applyTheme(preset)
      else {
        const raw = await api.settings.get(`theme_${themeId}`).catch(() => null)
        if (raw) {
          try { applyTheme(JSON.parse(raw)) } catch { applyTheme(PRESET_THEMES[0]) }
        }
      }

      const font = settings.globalFont ?? ''
      setGlobalFont(font)
      applyGlobalFont(font)

      const zoom = Number(settings.appZoom)
      if (Number.isFinite(zoom) && zoom > 0) {
        setAppZoom(zoom)
        zoomRef.current = zoom
        resizeWindow(zoom)
      } else {
        resizeWindow(1)
      }
      const scale = Number(settings.fontScale)
      if (Number.isFinite(scale) && scale > 0) setFontScale(scale)
      const offset = Number(settings.fontOffsetY)
      if (Number.isFinite(offset)) setFontOffsetY(offset)

      if (settings.pandecki_categories) {
        try {
          const storedCategories = JSON.parse(settings.pandecki_categories) as string[]
          if (Array.isArray(storedCategories) && storedCategories.length > 0) setCategories(storedCategories)
        } catch {}
      }

      if (settings.pandecki_boards) {
        try {
          const stored = JSON.parse(settings.pandecki_boards) as BoardInfo[]
          if (Array.isArray(stored)) setBoards(stored)
        } catch {}
      }

      if (settings.pandecki_student_lists) {
        try {
          const storedLists = JSON.parse(settings.pandecki_student_lists) as StudentList[]
          if (Array.isArray(storedLists)) setStudentLists(storedLists)
        } catch {}
      }
    }

    loadSettings()
    api.fonts.list().then(setSystemFonts).catch(() => {})
  }, [])

  useEffect(() => { document.documentElement.style.setProperty('--font-scale', String(fontScale)) }, [fontScale])
  useEffect(() => { document.documentElement.style.setProperty('--font-offset-y', `px`) }, [fontOffsetY])

  const saveSetting = (key: string, value: string) => { api.settings.set(key, value).catch(() => {}) }

  const saveBoards = (next: BoardInfo[]) => {
    setBoards(next)
    api.settings.set('pandecki_boards', JSON.stringify(next)).catch(() => {})
  }

  const saveCategories = (next: string[]) => {
    setCategories(next)
    api.settings.set('pandecki_categories', JSON.stringify(next)).catch(() => {})
  }

  const addCategory = (name: string) => {
    if (categories.includes(name)) return
    saveCategories([...categories, name])
  }

  const renameCategory = (oldName: string, newName: string) => {
    if (!newName || categories.includes(newName)) return
    saveCategories(categories.map(item => item === oldName ? newName : item))
    saveBoards(boards.map(board => board.category === oldName ? { ...board, category: newName } : board))
    if (dashboardCategory === oldName) setDashboardCategory(newName)
  }

  const moveCategory = (name: string, direction: -1 | 1) => {
    const index = categories.indexOf(name)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= categories.length) return
    const next = [...categories]
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    saveCategories(next)
  }

  const deleteCategory = (name: string) => {
    if (categories.length <= 1) return
    const fallback = categories.find(item => item !== name) ?? DEFAULT_CATEGORIES[0]
    const boardCount = boards.filter(board => board.category === name).length
    const message = boardCount > 0
      ? '"' + name + '" 카테고리를 삭제하고 판 ' + boardCount + '개를 "' + fallback + '" 카테고리로 옮길까요?'
      : '"' + name + '" 카테고리를 삭제할까요?'
    if (!window.confirm(message)) return
    saveCategories(categories.filter(item => item !== name))
    if (dashboardCategory === name) setDashboardCategory(fallback)
    if (boardCount > 0) saveBoards(boards.map(board => board.category === name ? { ...board, category: fallback } : board))
  }

  const createBoard = (title: string, category: string, accent: string) => {
    const now = new Date().toISOString()
    const board: BoardInfo = {
      id: crypto.randomUUID(),
      title,
      category,
      accent,
      createdAt: now,
      updatedAt: now,
    }
    saveBoards([board, ...boards])
  }

  const openBoard = (board: BoardInfo) => {
    const updated = { ...board, updatedAt: new Date().toISOString() }
    saveBoards(boards.map(item => item.id === board.id ? updated : item))
    setActiveBoard(updated)
  }

  const deleteBoard = (board: BoardInfo) => {
    if (!window.confirm(`"${board.title}" 판을 목록에서 삭제할까요?`)) return
    saveBoards(boards.filter(item => item.id !== board.id))
    api.entry.delete(`board_${board.id}`).catch(() => {})
  }

  const saveStudentList = (list: StudentList) => {
    const next = studentLists.some(item => item.id === list.id)
      ? studentLists.map(item => item.id === list.id ? list : item)
      : [...studentLists, list]
    setStudentLists(next)
    api.settings.set('pandecki_student_lists', JSON.stringify(next)).catch(() => {})
  }

  const deleteStudentList = (list: StudentList) => {
    if (!window.confirm(`"${list.title}" 학생 목록을 삭제할까요?`)) return
    const next = studentLists.filter(item => item.id !== list.id)
    setStudentLists(next)
    api.settings.set('pandecki_student_lists', JSON.stringify(next)).catch(() => {})
  }

  const selectCategory = (category: string) => {
    setAppView('dashboard')
    setDashboardCategory(category)
    setActiveBoard(null)
  }

  const changeZoom = (zoom: number) => {
    setAppZoom(zoom)
    zoomRef.current = zoom
  }

  const commitZoom = (zoom: number) => {
    if (!fullscreenRef.current) resizeWindow(zoom)
    saveSetting('appZoom', String(zoom))
  }

  // 전체화면: 사이드바를 숨기고, 남은 콘텐츠 영역을 디스플레이에 맞춰 비율 유지로 확대하고 가운데 정렬
  const shellWidth = isFullscreen ? APP_WIDTH - SIDEBAR_WIDTH : APP_WIDTH
  const fitScale = Math.min(viewport.width / shellWidth, viewport.height / APP_HEIGHT)
  const shellStyle: React.CSSProperties = isFullscreen
    ? { width: shellWidth, transform: `translate(${(viewport.width - shellWidth * fitScale) / 2}px, ${(viewport.height - APP_HEIGHT * fitScale) / 2}px) scale(${fitScale})` }
    : { transform: `scale(${appZoom})` }

  return (
    <>
    {isFullscreen && (
      <div className="fullscreen-exit-zone">
        <button className="fullscreen-exit-button" title="전체화면 끝내기 (F11)" onClick={toggleFullscreen}>
          <svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>
        </button>
      </div>
    )}
    <div className={`app-shell ${isFullscreen ? 'app-shell-fullscreen' : ''}`} style={shellStyle}>
      <AppSidebar dashboardActive={appView === 'dashboard' && !activeBoard} studentsActive={appView === 'students'} settingsOpen={settingsOpen} fullscreen={isFullscreen} onFullscreen={toggleFullscreen} onDashboard={() => selectCategory('전체')} onStudents={() => { setAppView('students'); setActiveBoard(null); setSettingsOpen(false) }} onSettings={() => setSettingsOpen(value => !value)} />
      <section className="app-content">
        {appView === 'students' ? (
          <StudentLists lists={studentLists} onSave={saveStudentList} onDelete={deleteStudentList} />
        ) : !activeBoard ? (
          <Dashboard boards={boards} categories={categories} category={dashboardCategory} createRequest={createRequest} onCreateRequestHandled={() => setCreateRequest(0)} onSelectCategory={setDashboardCategory} onAddCategory={addCategory} onRenameCategory={renameCategory} onMoveCategory={moveCategory} onDeleteCategory={deleteCategory} onCreate={createBoard} onOpen={openBoard} onDelete={deleteBoard} />
        ) : (
          <main className="pandecki-daily-shell">
      <DailyView
        boardKey={`board_${activeBoard.id}`}
        boardTitle={activeBoard.title}
        systemFonts={systemFonts}
        studentLists={studentLists}
      />
          </main>
        )}
      </section>
      {settingsOpen && <SettingsPanel activeThemeId={activeThemeId} onThemeChange={id => { setActiveThemeId(id); saveSetting('active_theme', id) }} appZoom={appZoom} onZoomChange={changeZoom} onZoomCommit={commitZoom} globalFont={globalFont} onGlobalFontChange={value => { setGlobalFont(value); applyGlobalFont(value); saveSetting('globalFont', value) }} systemFonts={systemFonts} fontScale={fontScale} onFontScaleChange={value => { setFontScale(value); saveSetting('fontScale', String(value)) }} fontOffsetY={fontOffsetY} onFontOffsetYChange={value => { setFontOffsetY(value); saveSetting('fontOffsetY', String(value)) }} onClose={() => setSettingsOpen(false)} />}
      <UpdateNotice />
    </div>
    </>
  )
}
