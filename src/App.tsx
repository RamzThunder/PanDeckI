import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import DailyView from './pages/DailyView'
import Dashboard, { BoardInfo } from './pages/Dashboard'
import { api } from './api'
import { PRESET_THEMES, applyGlobalFont, applyTheme } from './store/theme'

function shiftDate(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export default function App(): JSX.Element {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [globalFont, setGlobalFont] = useState('')
  const [mosaicIntensity, setMosaicIntensity] = useState(14)
  const [blurIntensity, setBlurIntensity] = useState(12)
  const [gridSpacing, setGridSpacing] = useState(40)
  const [boards, setBoards] = useState<BoardInfo[]>([])
  const [activeBoard, setActiveBoard] = useState<BoardInfo | null>(null)

  useEffect(() => {
    async function loadSettings() {
      const settings = await invoke<Record<string, string>>('get_settings_batch', {
        keys: ['active_theme', 'globalFont', 'ghostMosaicIntensity', 'ghostBlurIntensity', 'gridSpacing', 'pandecki_boards'],
      }).catch(() => ({} as Record<string, string>))

      const themeId = settings.active_theme ?? 'sky'
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

      const spacing = Number(settings.gridSpacing)
      if (Number.isFinite(spacing) && spacing > 0) setGridSpacing(spacing)

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

  const saveBoards = (next: BoardInfo[]) => {
    setBoards(next)
    api.settings.set('pandecki_boards', JSON.stringify(next)).catch(() => {})
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

  if (!activeBoard) {
    return <Dashboard boards={boards} onCreate={createBoard} onOpen={openBoard} onDelete={deleteBoard} />
  }

  return (
    <main className="pandecki-daily-shell">
      <DailyView
        currentDate={currentDate}
        onPrev={() => setCurrentDate(date => shiftDate(date, -1))}
        onNext={() => setCurrentDate(date => shiftDate(date, 1))}
        onToday={() => setCurrentDate(new Date())}
        boardKey={`board_${activeBoard.id}`}
        boardTitle={activeBoard.title}
        onBackToDashboard={() => setActiveBoard(null)}
        systemFonts={systemFonts}
        globalFont={globalFont}
        mosaicIntensity={mosaicIntensity}
        blurIntensity={blurIntensity}
        diaryName="PanDeckI"
        gridSpacing={gridSpacing}
      />
    </main>
  )
}
