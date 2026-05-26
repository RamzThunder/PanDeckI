import React, { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { check } from '@tauri-apps/plugin-updater'
import { ask } from '@tauri-apps/plugin-dialog'
import { relaunch } from '@tauri-apps/plugin-process'
import { useDiaryNav } from './store/diary'
import { PRESET_THEMES, applyTheme, applyGlobalFont } from './store/theme'
import { api } from './api'
import Sidebar from './components/Sidebar'
import SettingsPanel from './components/SettingsPanel'
import MonthlyView from './pages/MonthlyView'
import DailyView from './pages/DailyView'

const CANVAS_W = 1800
const CANVAS_H = 1012

function resizeWindow(zoom: number) {
  invoke('resize_window', { width: Math.round(CANVAS_W * zoom), height: Math.round(CANVAS_H * zoom) }).catch(() => {})
}

export default function App(): JSX.Element {
  const nav = useDiaryNav()
  const [showSettings, setShowSettings] = useState(false)
  const [activeThemeId, setActiveThemeId] = useState('sky')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [appZoom, setAppZoom] = useState(1.0)
  const [globalFont, setGlobalFont] = useState('')
  const [fontScale, setFontScale] = useState(1.0)
  const [fontOffsetY, setFontOffsetY] = useState(0)
  const [mosaicIntensity, setMosaicIntensity] = useState(14)
  const [blurIntensity, setBlurIntensity] = useState(12)
  const [diaryName, setDiaryName] = useState('dida')

  const zoomRef = useRef(appZoom)
  zoomRef.current = appZoom

  useEffect(() => {
    check().then(async update => {
      if (!update) return
      const yes = await ask(`새 버전 ${update.version}이 있습니다.\n지금 업데이트 하시겠습니까?`, { title: 'dida 업데이트', kind: 'info' })
      if (yes) { await update.downloadAndInstall(); await relaunch() }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    async function loadSettings() {
      const savedTheme = await api.settings.get('active_theme').catch(() => null)
      const id = savedTheme ?? 'sky'
      setActiveThemeId(id)
      const preset = PRESET_THEMES.find(t => t.id === id)
      if (preset) {
        applyTheme(preset)
      } else {
        const raw = await api.settings.get(`theme_${id}`).catch(() => null)
        if (raw) { try { applyTheme(JSON.parse(raw)) } catch {} }
        else { applyTheme(PRESET_THEMES[0]) }
      }

      const savedZoom = await api.settings.get('appZoom').catch(() => null)
      if (savedZoom) {
        const z = parseFloat(savedZoom)
        if (!isNaN(z)) { setAppZoom(z); resizeWindow(z) }
      } else {
        resizeWindow(1.0)
      }

      const savedFont = await api.settings.get('globalFont').catch(() => null)
      if (savedFont) setGlobalFont(savedFont)
      applyGlobalFont(savedFont ?? '')

      const savedFontScale = await api.settings.get('fontScale').catch(() => null)
      if (savedFontScale) {
        const v = parseFloat(savedFontScale)
        if (!isNaN(v)) { setFontScale(v); document.documentElement.style.setProperty('--font-scale', v.toString()) }
      }

      const savedFontOffsetY = await api.settings.get('fontOffsetY').catch(() => null)
      if (savedFontOffsetY) {
        const v = parseFloat(savedFontOffsetY)
        if (!isNaN(v)) { setFontOffsetY(v); document.documentElement.style.setProperty('--font-offset-y', v + 'px') }
      }

      const savedMosaic = await api.settings.get('ghostMosaicIntensity').catch(() => null)
      if (savedMosaic) { const v = parseInt(savedMosaic); if (!isNaN(v)) setMosaicIntensity(v) }

      const savedBlur = await api.settings.get('ghostBlurIntensity').catch(() => null)
      if (savedBlur) { const v = parseInt(savedBlur); if (!isNaN(v)) setBlurIntensity(v) }

      const savedDiaryName = await api.settings.get('diaryName').catch(() => null)
      if (savedDiaryName) setDiaryName(savedDiaryName)
    }
    loadSettings()
    api.fonts.list().then(fonts => setSystemFonts(fonts)).catch(() => {})
  }, [])

  // Scroll wheel on any range slider adjusts it
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) return
      const target = e.target as HTMLElement
      if (!(target instanceof HTMLInputElement) || target.type !== 'range') return
      e.preventDefault()
      const step = parseFloat(target.step) || 1
      const min = parseFloat(target.min)
      const max = parseFloat(target.max)
      const current = parseFloat(target.value)
      const delta = e.deltaY < 0 ? step : -step
      const decimals = step.toString().includes('.') ? step.toString().split('.')[1].length : 0
      const next = parseFloat(Math.min(max, Math.max(min, Math.round((current + delta) / step) * step)).toFixed(decimals))
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeSetter?.call(target, next.toString())
      target.dispatchEvent(new Event('input', { bubbles: true }))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // Cmd+scroll zoom
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.05 : 0.05
      setAppZoom(prev => {
        const next = Math.max(0.5, Math.min(2.0, Math.round((prev + delta) * 20) / 20))
        api.settings.set('appZoom', next.toString()).catch(() => {})
        resizeWindow(next)
        return next
      })
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  const handleThemeChange = async (id: string) => {
    setActiveThemeId(id)
    await api.settings.set('active_theme', id).catch(() => {})
  }

  const handleZoomChange = (z: number) => {
    setAppZoom(z)
    api.settings.set('appZoom', z.toString()).catch(() => {})
    resizeWindow(z)
  }

  const handleGlobalFontChange = (f: string) => {
    setGlobalFont(f)
    applyGlobalFont(f)
    api.settings.set('globalFont', f).catch(() => {})
  }

  const handleFontScaleChange = (v: number) => {
    setFontScale(v)
    document.documentElement.style.setProperty('--font-scale', v.toString())
    api.settings.set('fontScale', v.toString()).catch(() => {})
  }

  const handleFontOffsetYChange = (v: number) => {
    setFontOffsetY(v)
    document.documentElement.style.setProperty('--font-offset-y', v + 'px')
    api.settings.set('fontOffsetY', v.toString()).catch(() => {})
  }

  const handleMosaicIntensityChange = (v: number) => {
    setMosaicIntensity(v)
    api.settings.set('ghostMosaicIntensity', v.toString()).catch(() => {})
  }

  const handleBlurIntensityChange = (v: number) => {
    setBlurIntensity(v)
    api.settings.set('ghostBlurIntensity', v.toString()).catch(() => {})
  }

  const handleDiaryNameChange = (name: string) => {
    setDiaryName(name)
    api.settings.set('diaryName', name).catch(() => {})
  }

  return (
    <div style={{
      width: CANVAS_W, height: CANVAS_H,
      transform: `scale(${appZoom})`,
      transformOrigin: 'top left',
      display: 'flex',
      position: 'absolute', top: 0, left: 0,
      background: 'transparent',
      overflow: 'hidden',
      borderRadius: 12,
    }}>
      <Sidebar
        viewMode={nav.viewMode}
        currentDate={nav.currentDate}
        onViewChange={nav.setViewMode}
        onDateSelect={nav.goToDate}
        onThemeToggle={() => setShowSettings(v => !v)}
        themeOpen={showSettings}
        onSave={() => window.dispatchEvent(new CustomEvent('diary-manual-save'))}
        onExport={() => window.dispatchEvent(new CustomEvent('diary-export-png'))}
      />
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {nav.viewMode === 'monthly' && (
          <MonthlyView
            currentDate={nav.currentDate}
            onPrev={nav.goToPrev}
            onNext={nav.goToNext}
            onDayClick={(date) => { nav.goToDate(date); nav.setViewMode('daily') }}
            onNavigate={nav.goToDate}
            diaryName={diaryName}
          />
        )}
        {nav.viewMode === 'daily' && (
          <div style={{ height: '100%', background: 'var(--color-bg)' }}>
            <DailyView
              currentDate={nav.currentDate}
              onPrev={nav.goToPrev}
              onNext={nav.goToNext}
              onToday={() => nav.goToDate(new Date())}
              systemFonts={systemFonts}
              globalFont={globalFont}
              mosaicIntensity={mosaicIntensity}
              blurIntensity={blurIntensity}
              diaryName={diaryName}
            />
          </div>
        )}
      </main>
      {showSettings && (
        <SettingsPanel
          activeThemeId={activeThemeId}
          onThemeChange={handleThemeChange}
          appZoom={appZoom}
          onZoomChange={handleZoomChange}
          globalFont={globalFont}
          onGlobalFontChange={handleGlobalFontChange}
          fontScale={fontScale}
          onFontScaleChange={handleFontScaleChange}
          fontOffsetY={fontOffsetY}
          onFontOffsetYChange={handleFontOffsetYChange}
          mosaicIntensity={mosaicIntensity}
          onMosaicIntensityChange={handleMosaicIntensityChange}
          blurIntensity={blurIntensity}
          onBlurIntensityChange={handleBlurIntensityChange}
          diaryName={diaryName}
          onDiaryNameChange={handleDiaryNameChange}
          systemFonts={systemFonts}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
