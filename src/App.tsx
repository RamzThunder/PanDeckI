import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import DailyView from './pages/DailyView'
import AppSidebar from './components/AppSidebar'
import SettingsPanel from './components/SettingsPanel'
import Dashboard, { BoardInfo } from './pages/Dashboard'
import { api } from './api'
import { PRESET_THEMES, applyGlobalFont, applyTheme } from './store/theme'

const DEFAULT_CATEGORIES = ['수업', '학급 운영', '행사', '개인', '기타']

function shiftDate(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export default function App(): JSX.Element {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeThemeId, setActiveThemeId] = useState('sky')
  const [appZoom, setAppZoom] = useState(1)
  const [fontScale, setFontScale] = useState(1)
  const [fontOffsetY, setFontOffsetY] = useState(0)
  const [diaryName, setDiaryName] = useState('PanDeckI')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [globalFont, setGlobalFont] = useState('')
  const [mosaicIntensity, setMosaicIntensity] = useState(14)
  const [blurIntensity, setBlurIntensity] = useState(12)
  const [gridSpacing, setGridSpacing] = useState(40)
  const [boards, setBoards] = useState<BoardInfo[]>([])
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [activeBoard, setActiveBoard] = useState<BoardInfo | null>(null)
  const [dashboardCategory, setDashboardCategory] = useState('전체')
  const [createRequest, setCreateRequest] = useState(0)

  useEffect(() => {
    async function loadSettings() {
      const settings = await invoke<Record<string, string>>('get_settings_batch', {
        keys: ['active_theme', 'globalFont', 'ghostMosaicIntensity', 'ghostBlurIntensity', 'gridSpacing', 'pandecki_boards', 'pandecki_categories', 'appZoom', 'fontScale', 'fontOffsetY', 'diaryName'],
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

      const mosaic = Number(settings.ghostMosaicIntensity)
      if (Number.isFinite(mosaic) && mosaic > 0) setMosaicIntensity(mosaic)

      const blur = Number(settings.ghostBlurIntensity)
      if (Number.isFinite(blur) && blur > 0) setBlurIntensity(blur)

      const zoom = Number(settings.appZoom)
      if (Number.isFinite(zoom) && zoom > 0) setAppZoom(zoom)
      const scale = Number(settings.fontScale)
      if (Number.isFinite(scale) && scale > 0) setFontScale(scale)
      const offset = Number(settings.fontOffsetY)
      if (Number.isFinite(offset)) setFontOffsetY(offset)
      if (settings.diaryName) setDiaryName(settings.diaryName)

      const spacing = Number(settings.gridSpacing)
      if (Number.isFinite(spacing) && spacing > 0) setGridSpacing(spacing)

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

  const deleteCategory = (name: string) => {
    if (categories.length <= 1) return
    const fallback = categories.find(item => item !== name) ?? DEFAULT_CATEGORIES[0]
    const boardCount = boards.filter(board => board.category === name).length
    const message = boardCount > 0
      ? '"' + name + '" 카테고리를 삭제하고 판떼기 ' + boardCount + '개를 "' + fallback + '" 카테고리로 옮길까요?'
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
    setActiveBoard(board)
  }

  const openBoard = (board: BoardInfo) => {
    const updated = { ...board, updatedAt: new Date().toISOString() }
    saveBoards(boards.map(item => item.id === board.id ? updated : item))
    setActiveBoard(updated)
  }

  const deleteBoard = (board: BoardInfo) => {
    if (!window.confirm(`"${board.title}" 판떼기를 목록에서 삭제할까요?`)) return
    saveBoards(boards.filter(item => item.id !== board.id))
    api.entry.delete(`board_${board.id}`).catch(() => {})
  }

  const selectCategory = (category: string) => {
    setDashboardCategory(category)
    setActiveBoard(null)
  }

  const requestNewBoard = () => {
    setActiveBoard(null)
    setCreateRequest(value => value + 1)
  }

  return (
    <div className="app-shell">
      <AppSidebar dashboardActive={!activeBoard} settingsOpen={settingsOpen} onDashboard={() => selectCategory('전체')} onSettings={() => setSettingsOpen(value => !value)} />
      <section className="app-content" style={{ transform: `scale(${appZoom})`, transformOrigin: 'top left', width: `${100 / appZoom}%`, height: `${100 / appZoom}%` }}>
        {!activeBoard ? (
          <Dashboard boards={boards} categories={categories} category={dashboardCategory} createRequest={createRequest} onCreateRequestHandled={() => setCreateRequest(0)} onSelectCategory={setDashboardCategory} onAddCategory={addCategory} onRenameCategory={renameCategory} onDeleteCategory={deleteCategory} onCreate={createBoard} onOpen={openBoard} onDelete={deleteBoard} />
        ) : (
          <main className="pandecki-daily-shell">
      <DailyView
        currentDate={currentDate}
        onPrev={() => setCurrentDate(date => shiftDate(date, -1))}
        onNext={() => setCurrentDate(date => shiftDate(date, 1))}
        onToday={() => setCurrentDate(new Date())}
        boardKey={`board_${activeBoard.id}`}
        boardTitle={activeBoard.title}
        systemFonts={systemFonts}
        globalFont={globalFont}
        mosaicIntensity={mosaicIntensity}
        blurIntensity={blurIntensity}
        diaryName={diaryName}
        gridSpacing={gridSpacing}
      />
          </main>
        )}
      </section>
      {settingsOpen && <SettingsPanel activeThemeId={activeThemeId} onThemeChange={id => { setActiveThemeId(id); saveSetting('active_theme', id) }} appZoom={appZoom} onZoomChange={setAppZoom} onZoomCommit={value => saveSetting('appZoom', String(value))} globalFont={globalFont} onGlobalFontChange={value => { setGlobalFont(value); applyGlobalFont(value); saveSetting('globalFont', value) }} systemFonts={systemFonts} fontScale={fontScale} onFontScaleChange={value => { setFontScale(value); saveSetting('fontScale', String(value)) }} fontOffsetY={fontOffsetY} onFontOffsetYChange={value => { setFontOffsetY(value); saveSetting('fontOffsetY', String(value)) }} mosaicIntensity={mosaicIntensity} onMosaicIntensityChange={value => { setMosaicIntensity(value); saveSetting('ghostMosaicIntensity', String(value)) }} blurIntensity={blurIntensity} onBlurIntensityChange={value => { setBlurIntensity(value); saveSetting('ghostBlurIntensity', String(value)) }} diaryName={diaryName} onDiaryNameChange={value => { setDiaryName(value); saveSetting('diaryName', value) }} gridSpacing={gridSpacing} onGridSpacingChange={value => { setGridSpacing(value); saveSetting('gridSpacing', String(value)) }} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
