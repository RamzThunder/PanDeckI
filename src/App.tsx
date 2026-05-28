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
  const [gridSpacing, setGridSpacing] = useState(40)
  const [monthlyExportPreview, setMonthlyExportPreview] = useState<{ dataUrl: string; filename: string } | null>(null)

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
      const s = await invoke<Record<string, string>>('get_settings_batch', {
        keys: ['active_theme', 'appZoom', 'globalFont', 'fontScale', 'fontOffsetY',
               'ghostMosaicIntensity', 'ghostBlurIntensity', 'diaryName', 'gridSpacing']
      }).catch(() => ({} as Record<string, string>))

      const id = s['active_theme'] ?? 'sky'
      setActiveThemeId(id)
      const preset = PRESET_THEMES.find(t => t.id === id)
      if (preset) {
        applyTheme(preset)
      } else {
        const raw = await api.settings.get(`theme_${id}`).catch(() => null)
        if (raw) { try { applyTheme(JSON.parse(raw)) } catch {} }
        else { applyTheme(PRESET_THEMES[0]) }
      }

      const savedZoom = s['appZoom']
      if (savedZoom) {
        const z = parseFloat(savedZoom)
        if (!isNaN(z)) { setAppZoom(z); resizeWindow(z) }
      } else {
        resizeWindow(1.0)
      }

      const savedFont = s['globalFont'] ?? ''
      if (savedFont) setGlobalFont(savedFont)
      applyGlobalFont(savedFont)

      const savedFontScale = s['fontScale']
      if (savedFontScale) {
        const v = parseFloat(savedFontScale)
        if (!isNaN(v)) { setFontScale(v); document.documentElement.style.setProperty('--font-scale', v.toString()) }
      }

      const savedFontOffsetY = s['fontOffsetY']
      if (savedFontOffsetY) {
        const v = parseFloat(savedFontOffsetY)
        if (!isNaN(v)) { setFontOffsetY(v); document.documentElement.style.setProperty('--font-offset-y', v + 'px') }
      }

      const savedMosaic = s['ghostMosaicIntensity']
      if (savedMosaic) { const v = parseInt(savedMosaic); if (!isNaN(v)) setMosaicIntensity(v) }

      const savedBlur = s['ghostBlurIntensity']
      if (savedBlur) { const v = parseInt(savedBlur); if (!isNaN(v)) setBlurIntensity(v) }

      const savedDiaryName = s['diaryName']
      if (savedDiaryName) setDiaryName(savedDiaryName)

      const savedGridSpacing = s['gridSpacing']
      if (savedGridSpacing) { const v = parseInt(savedGridSpacing); if (!isNaN(v)) setGridSpacing(v) }
    }
    loadSettings()
    // 폰트 목록은 시작 직후 로딩하면 Windows에서 PowerShell 초기화로 느려짐 — 1초 지연
    const fontTimer = setTimeout(() => {
      api.fonts.list().then(fonts => setSystemFonts(fonts)).catch(() => {})
    }, 1000)
    return () => clearTimeout(fontTimer)
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
  }

  const handleZoomCommit = (z: number) => {
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

  const handleGridSpacingChange = (v: number) => {
    setGridSpacing(v)
    api.settings.set('gridSpacing', v.toString()).catch(() => {})
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
        onExport={() => {
          if (nav.viewMode === 'daily') {
            window.dispatchEvent(new CustomEvent('diary-export-png'))
          } else {
            api.export.captureToB64().then(b64 => {
              const now = new Date()
              const yy  = String(now.getFullYear()).slice(2)
              const mm  = String(now.getMonth() + 1).padStart(2, '0')
              const dd  = String(now.getDate()).padStart(2, '0')
              const hh  = String(now.getHours()).padStart(2, '0')
              const min = String(now.getMinutes()).padStart(2, '0')
              const safeName = (diaryName || 'dida').replace(/\s+/g, '_')
              setMonthlyExportPreview({ dataUrl: `data:image/png;base64,${b64}`, filename: `${safeName}_${yy}${mm}${dd}_${hh}${min}.png` })
            }).catch((e: unknown) => console.error('export failed', e))
          }
        }}
      />
      <main style={{ flex: 1, overflow: 'hidden' }}
        onPointerDown={e => { if (e.altKey) { e.preventDefault(); invoke('window_start_dragging') } }}>
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
              gridSpacing={gridSpacing}
            />
          </div>
        )}
      </main>
      {monthlyExportPreview && (
        <div onClick={() => setMonthlyExportPreview(null)} style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--color-bg)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: '90%', maxHeight: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>내보내기 미리보기</p>
              <button onClick={() => setMonthlyExportPreview(null)} style={{ fontSize: 18, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflow: 'auto', borderRadius: 8, border: '1px solid var(--color-border)', background: '#888' }}>
              <img src={monthlyExportPreview.dataUrl} alt="미리보기" draggable={false} style={{ display: 'block', maxWidth: '70vw', maxHeight: '60vh', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, flex: 1, background: 'var(--color-primary-light)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>파일명</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{monthlyExportPreview.filename}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setMonthlyExportPreview(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>취소</button>
              <button onClick={async () => {
                const b64 = monthlyExportPreview.dataUrl.split(',')[1]
                setMonthlyExportPreview(null)
                await api.export.savePng(b64, monthlyExportPreview.filename)
              }} style={{ flex: 2, padding: '8px 0', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>저장</button>
            </div>
          </div>
        </div>
      )}
      {showSettings && (
        <SettingsPanel
          activeThemeId={activeThemeId}
          onThemeChange={handleThemeChange}
          appZoom={appZoom}
          onZoomChange={handleZoomChange}
          onZoomCommit={handleZoomCommit}
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
          gridSpacing={gridSpacing}
          onGridSpacingChange={handleGridSpacingChange}
          systemFonts={systemFonts}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
