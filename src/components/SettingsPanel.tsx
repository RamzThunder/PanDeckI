import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { check } from '@tauri-apps/plugin-updater'
import { ask } from '@tauri-apps/plugin-dialog'
import { relaunch } from '@tauri-apps/plugin-process'
import { Theme, PRESET_THEMES, applyTheme, applyGlobalFont } from '../store/theme'
import { api } from '../api'

interface Props {
  activeThemeId: string
  onThemeChange: (id: string) => void
  appZoom: number
  onZoomChange: (z: number) => void
  onZoomCommit: (z: number) => void
  globalFont: string
  onGlobalFontChange: (f: string) => void
  systemFonts: string[]
  fontScale: number
  onFontScaleChange: (v: number) => void
  fontOffsetY: number
  onFontOffsetYChange: (v: number) => void
  onClose: () => void
}

const EMPTY_CUSTOM: Theme = {
  id: '', name: '',
  primary: '#F8B4C8', primaryLight: '#FDE8F0', primaryDark: '#D4688A',
  secondary: '#B8D4B8', bg: '#FFF8F0', sidebar: '#FDE8F0',
  text: '#4A3F3F', textMuted: '#9A8A8A', border: '#F0D0DC',
}

const CUSTOM_SLOTS = ['custom_1', 'custom_2', 'custom_3', 'custom_4', 'custom_5']
const CUSTOM_LABELS = ['커스텀 1', '커스텀 2', '커스텀 3', '커스텀 4', '커스텀 5']

const COLOR_FIELDS: { key: keyof Theme; label: string }[] = [
  { key: 'primary', label: '메인' },
  { key: 'primaryLight', label: '메인(밝게)' },
  { key: 'primaryDark', label: '메인(어둡게)' },
  { key: 'secondary', label: '보조' },
  { key: 'bg', label: '배경' },
  { key: 'sidebar', label: '사이드바' },
  { key: 'text', label: '글자' },
  { key: 'textMuted', label: '글자(흐리게)' },
  { key: 'border', label: '테두리' },
]

type Tab = 'info' | 'display'

export default function SettingsPanel({
  activeThemeId, onThemeChange,
  appZoom, onZoomChange, onZoomCommit,
  globalFont, onGlobalFontChange,
  systemFonts,
  fontScale, onFontScaleChange,
  fontOffsetY, onFontOffsetYChange,
  onClose,
}: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('info')
  const [localZoom, setLocalZoom] = useState(appZoom)
  useEffect(() => { setLocalZoom(appZoom) }, [appZoom])
  const [customs, setCustoms] = useState<(Theme | null)[]>(Array(5).fill(null))
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [draft, setDraft] = useState<Theme>(EMPTY_CUSTOM)
  const [fontSearch, setFontSearch] = useState('')
  const [showFontList, setShowFontList] = useState(false)
  const [recentColors, setRecentColors] = useState<Record<string, string[]>>({})
  const [dbPath, setDbPath] = useState('')
  const [dbPending, setDbPending] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const [recentFonts, setRecentFonts] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const loaded = await Promise.all(CUSTOM_SLOTS.map(async (slot) => {
        const raw = await api.settings.get(`theme_${slot}`).catch(() => null)
        if (!raw) return null
        try { const t = JSON.parse(raw) as Theme; return { ...t, id: slot } } catch { return null }
      }))
      setCustoms(loaded)

      const rawRecent = await api.settings.get('themeRecentColors').catch(() => null)
      if (rawRecent) try { setRecentColors(JSON.parse(rawRecent)) } catch {}

      const rawRecentFonts = await api.settings.get('recentFonts').catch(() => null)
      if (rawRecentFonts) try { setRecentFonts(JSON.parse(rawRecentFonts)) } catch {}

      const path = await api.db.getPath().catch(() => '')
      setDbPath(path)

      const v = await getVersion().catch(() => '')
      setAppVersion(v)
    }
    load()
  }, [])

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateMsg('')
    try {
      const update = await check()
      if (!update) {
        setUpdateMsg('최신 버전입니다.')
      } else {
        const yes = await ask(`새 버전 ${update.version}이 있습니다.\n지금 업데이트 하시겠습니까?`, { title: 'PanDeckI 업데이트', kind: 'info' })
        if (yes) { await update.downloadAndInstall(); await relaunch() }
        else { setUpdateMsg('업데이트를 취소했습니다.') }
      }
    } catch {
      setUpdateMsg('업데이트 확인 중 오류가 발생했습니다.')
    }
    setCheckingUpdate(false)
  }

  const saveCustom = async (idx: number, theme: Theme) => {
    const slot = CUSTOM_SLOTS[idx]
    const t = { ...theme, id: slot }
    await api.settings.set(`theme_${slot}`, JSON.stringify(t)).catch(() => {})
    setCustoms(prev => { const next = [...prev]; next[idx] = t; return next })
    return t
  }

  const deleteCustom = async (idx: number) => {
    const slot = CUSTOM_SLOTS[idx]
    await api.settings.set(`theme_${slot}`, '').catch(() => {})
    setCustoms(prev => { const next = [...prev]; next[idx] = null; return next })
    if (activeThemeId === slot) selectTheme(PRESET_THEMES[0])
  }

  const selectTheme = (t: Theme) => { applyTheme(t); onThemeChange(t.id) }

  const getActiveThemeData = () => {
    const preset = PRESET_THEMES.find(t => t.id === activeThemeId)
    if (preset) return preset
    const customTheme = customs.find(t => t && t.id === activeThemeId)
    if (customTheme) return customTheme
    return EMPTY_CUSTOM
  }

  const startEdit = (idx: number) => {
    const baseTheme = customs[idx] ?? getActiveThemeData()
    setDraft({ ...baseTheme, id: CUSTOM_SLOTS[idx], name: customs[idx]?.name || CUSTOM_LABELS[idx] })
    setEditIdx(idx)
  }

  const applyDraft = async () => {
    if (editIdx === null) return
    // 각 색상 필드의 최근 색상 업데이트
    const updated = { ...recentColors }
    COLOR_FIELDS.forEach(({ key }) => {
      const color = draft[key] as string
      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return
      const prev = updated[key] ?? []
      updated[key] = [color, ...prev.filter(c => c !== color)].slice(0, 3)
    })
    setRecentColors(updated)
    api.settings.set('themeRecentColors', JSON.stringify(updated)).catch(() => {})
    selectTheme(await saveCustom(editIdx, draft))
    setEditIdx(null)
  }

  const filteredFonts = fontSearch
    ? systemFonts.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
    : systemFonts

  return (
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 999999, pointerEvents: 'none' }}>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 64,
          right: 288,
          pointerEvents: 'auto',
        }}
      />
      <div className="w-72 h-full overflow-y-auto shadow-2xl flex flex-col"
        style={{ background: 'var(--color-bg)', borderLeft: '1px solid var(--color-border)', pointerEvents: 'auto' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>설정</h3>
          <button onClick={onClose} className="text-lg hover:opacity-60" style={{ color: 'var(--color-text-muted)' }}>×</button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          {([['info', '정보'], ['display', '화면']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 text-xs py-2 font-medium"
              style={{
                color: tab === id ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                borderBottom: tab === id ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab: 정보 */}
        {tab === 'info' && (
          <div className="flex-1 p-4 flex flex-col gap-5 overflow-y-auto">
            <section>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>소프트웨어 정보</p>
              <div className="rounded-xl px-3 py-2 mb-2 flex items-center justify-between"
                style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-border)' }}>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>버전</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{appVersion || '…'}</span>
              </div>
              <button
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                className="w-full text-xs py-2 rounded-xl font-medium"
                style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)', opacity: checkingUpdate ? 0.6 : 1, cursor: checkingUpdate ? 'not-allowed' : 'pointer' }}>
                {checkingUpdate ? '확인 중…' : '업데이트 확인'}
              </button>
              {updateMsg && <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{updateMsg}</p>}
            </section>
            <section>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-muted)' }}>데이터 관리</p>
              <div className="flex flex-col gap-2">
                <button onClick={() => api.backup.export().catch(() => {})}
                  className="w-full text-xs py-2 rounded-xl hover:opacity-80 font-medium"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
                  백업 내보내기
                </button>
                <button onClick={() => api.backup.import().catch(() => {})}
                  className="w-full text-xs py-2 rounded-xl hover:opacity-80 font-medium"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
                  백업 불러오기
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                모든 일기·설정을 JSON 파일로 내보내거나 복원해요.
              </p>
            </section>

            <section>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-muted)' }}>데이터 저장 위치</p>
              <div className="rounded-xl px-3 py-2 mb-2 text-xs break-all" style={{ background: 'var(--color-primary-light)', color: 'var(--color-text)' }}>
                {dbPath || '불러오는 중…'}
              </div>
              <div className="flex gap-2 mb-2">
                <button
                  className="flex-1 text-xs py-2 rounded-xl hover:opacity-80 font-medium"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}
                  onClick={() => {
                    api.db.openFolder().catch(() => {})
                  }}>
                  저장 폴더 열기
                </button>
                <button
                  className="flex-1 text-xs py-2 rounded-xl hover:opacity-80 font-medium"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}
                  onClick={async () => {
                    try {
                      const newPath = await api.db.pickDir()
                      setDbPath(newPath)
                      setDbPending(true)
                    } catch {}
                  }}>
                  위치 변경
                </button>
                <button
                  className="flex-1 text-xs py-2 rounded-xl hover:opacity-80 font-medium"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}
                  onClick={async () => {
                    await api.db.resetPath().catch(() => {})
                    const path = await api.db.getPath().catch(() => '')
                    setDbPath(path)
                    setDbPending(true)
                  }}>
                  기본값으로
                </button>
              </div>
              {dbPending && (
                <div className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}>
                  <span className="text-xs">재시작 후 적용돼요.</span>
                  <button className="text-xs font-semibold underline hover:opacity-80"
                    onClick={() => { invoke('window_close') }}>
                    지금 종료
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Tab: 화면 */}
        {tab === 'display' && (
          <div className="flex-1 p-4 flex flex-col gap-5 overflow-y-auto">
            <section>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-muted)' }}>화면 배율</p>
              <div className="flex items-center gap-3">
                <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>50%</span>
                <input type="range" min={50} max={150} step={5} value={Math.round(localZoom * 100)}
                  onChange={e => setLocalZoom(Number(e.target.value) / 100)}
                  onPointerUp={e => { const z = Number((e.target as HTMLInputElement).value) / 100; onZoomChange(z); onZoomCommit(z) }}
                  className="flex-1 cursor-pointer" />
                <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>150%</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold" style={{ color: 'var(--color-primary-dark)' }}>{Math.round(localZoom * 100)}%</span>
                <button onClick={() => { setLocalZoom(1.0); onZoomChange(1.0); onZoomCommit(1.0) }}
                  className="text-xs px-3 py-1 rounded-full hover:opacity-80"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
                  초기화 (100%)
                </button>
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
                Cmd / Ctrl + 스크롤로도 조절할 수 있어요.
              </p>
            </section>

            {/* Global font */}
            <section>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>전체 폰트</p>
              <div className="relative">
                <button
                  onClick={() => setShowFontList(v => !v)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg hover:opacity-80"
                  style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)', fontFamily: globalFont ? `'${globalFont}'` : undefined }}>
                  {globalFont || '시스템 기본 폰트'} ▾
                </button>
                {showFontList && (
                  <div className="absolute top-full left-0 right-0 z-50 rounded-xl shadow-xl overflow-hidden mt-1"
                    style={{ background: '#fff', border: '1px solid var(--color-border)', maxHeight: 220 }}>
                    <input autoFocus type="text" placeholder="폰트 검색..." value={fontSearch}
                      onChange={e => setFontSearch(e.target.value)}
                      className="w-full text-xs px-3 py-2 outline-none"
                      style={{ borderBottom: '1px solid var(--color-border)' }} />
                    <div className="overflow-y-auto" style={{ maxHeight: 170 }}>
                      <button
                        onClick={() => { onGlobalFontChange(''); setShowFontList(false); setFontSearch(''); applyGlobalFont('') }}
                        className="w-full text-left text-xs px-3 py-1.5 hover:bg-pink-50"
                        style={{ color: 'var(--color-text-muted)' }}>
                        시스템 기본 폰트 (초기화)
                      </button>
                      {!fontSearch && recentFonts.length > 0 && (<>
                        <div className="px-3 py-1 text-xs" style={{ color: 'var(--color-text-muted)', background: 'var(--color-primary-light)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>최근 사용</div>
                        {recentFonts.map(f => (
                          <button key={`recent-${f}`}
                            onClick={() => { onGlobalFontChange(f); setShowFontList(false); setFontSearch(''); applyGlobalFont(f) }}
                            className="w-full text-left text-xs px-3 py-1.5 hover:bg-pink-50 truncate"
                            style={{ fontFamily: `'${f}'`, background: globalFont === f ? 'var(--color-primary-light)' : undefined, color: 'var(--color-text)' }}>
                            {f}
                          </button>
                        ))}
                        <div style={{ borderTop: '1px solid var(--color-border)' }} />
                      </>)}
                      {filteredFonts.map(f => (
                        <button key={f}
                          onClick={() => {
                            onGlobalFontChange(f); setShowFontList(false); setFontSearch(''); applyGlobalFont(f)
                            setRecentFonts(prev => {
                              const next = [f, ...prev.filter(x => x !== f)].slice(0, 5)
                              api.settings.set('recentFonts', JSON.stringify(next)).catch(() => {})
                              return next
                            })
                          }}
                          className="w-full text-left text-xs px-3 py-1.5 hover:bg-pink-50 truncate"
                          style={{ fontFamily: `'${f}'`, background: globalFont === f ? 'var(--color-primary-light)' : undefined, color: 'var(--color-text)' }}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>글자 기본 크기</p>
              <div className="flex items-center justify-between text-sm mb-1" style={{ color: 'var(--color-text)' }}>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{fontScale.toFixed(1)}x</span>
                <button onClick={() => onFontScaleChange(1)} className="text-xs hover:opacity-70"
                  style={{ color: 'var(--color-text-muted)' }}>초기화</button>
              </div>
              <input type="range" min="0.5" max="3" step="0.1"
                value={fontScale}
                onChange={e => onFontScaleChange(Number(e.target.value))}
                className="w-full cursor-pointer" />
            </section>

            <section>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>폰트 세로 위치 미세 조정</p>
              <div className="flex items-center justify-between text-sm mb-1" style={{ color: 'var(--color-text)' }}>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{fontOffsetY}px</span>
                <button onClick={() => onFontOffsetYChange(0)} className="text-xs hover:opacity-70"
                  style={{ color: 'var(--color-text-muted)' }}>초기화</button>
              </div>
              <input type="range" min="-20" max="20" step="1"
                value={fontOffsetY}
                onChange={e => onFontOffsetYChange(Number(e.target.value))}
                className="w-full cursor-pointer" />
            </section>

            {/* Preset themes */}
            <section>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>기본 테마</p>
              <div className="flex flex-col gap-2">
                {PRESET_THEMES.map(t => (
                  <button key={t.id} onClick={() => selectTheme(t)}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl hover:opacity-90"
                    style={{ background: t.sidebar, border: `2px solid ${activeThemeId === t.id ? t.primaryDark : t.border}` }}>
                    <div className="flex gap-1 shrink-0">
                      {[t.primary, t.secondary, t.bg].map((c, i) => (
                        <div key={i} className="w-5 h-5 rounded-full" style={{ background: c }} />
                      ))}
                    </div>
                    <span className="text-sm font-medium" style={{ color: t.text }}>{t.name}</span>
                    {activeThemeId === t.id && <span className="ml-auto text-xs" style={{ color: t.primaryDark }}>✓</span>}
                  </button>
                ))}
              </div>
            </section>

            {/* Custom theme slots */}
            <section>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>나만의 테마</p>
              <div className="flex flex-col gap-2">
                {CUSTOM_SLOTS.map((slot, idx) => {
                  const t = customs[idx]
                  return (
                    <div key={slot} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style={{ background: t ? t.sidebar : 'var(--color-primary-light)', border: `2px solid ${activeThemeId === slot ? 'var(--color-primary-dark)' : 'var(--color-border)'}` }}>
                      {t ? (
                        <>
                          <div className="flex gap-1 shrink-0">
                            {[t.primary, t.secondary, t.bg].map((c, i) => (
                              <div key={i} className="w-5 h-5 rounded-full" style={{ background: c }} />
                            ))}
                          </div>
                          <button onClick={() => selectTheme(t)} className="text-sm font-medium flex-1 text-left hover:opacity-70" style={{ color: t.text }}>
                            {t.name || CUSTOM_LABELS[idx]}
                          </button>
                          {activeThemeId === slot && <span className="text-xs" style={{ color: t.primaryDark }}>✓</span>}
                          <button onClick={() => startEdit(idx)} className="text-xs px-1.5 py-0.5 rounded hover:opacity-70"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>편집</button>
                          <button onClick={() => deleteCustom(idx)} className="text-xs px-1.5 py-0.5 rounded hover:opacity-70"
                            style={{ color: '#e05555', border: '1px solid #e05555' }}>삭제</button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs flex-1" style={{ color: 'var(--color-text-muted)' }}>{CUSTOM_LABELS[idx]}</span>
                          <button onClick={() => startEdit(idx)} className="text-xs px-2 py-0.5 rounded-full hover:opacity-80"
                            style={{ background: 'var(--color-primary)', color: '#fff' }}>+ 만들기</button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        )}

        {/* Custom theme editor */}
        {editIdx !== null && tab === 'display' && (
          <div className="shrink-0 border-t p-4 flex flex-col gap-3"
            style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.6)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{CUSTOM_LABELS[editIdx]} 편집</p>
            <div className="flex flex-col gap-1.5">
              <div>
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>테마 이름</label>
                <input type="text" value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  className="w-full text-xs px-2 py-1 rounded outline-none mt-0.5"
                  style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }}
                  placeholder={CUSTOM_LABELS[editIdx]} />
              </div>
              <div className="flex flex-col gap-1.5 mt-1">
                {COLOR_FIELDS.map(({ key, label }) => {
                  const hexVal = draft[key] as string
                  const isValid = /^#[0-9A-Fa-f]{6}$/.test(hexVal)
                  return (
                    <div key={key} className="flex items-center gap-1.5">
                      <div style={{
                        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                        background: isValid ? hexVal : '#eee',
                        border: '1px solid var(--color-border)',
                      }} />
                      <label className="text-xs shrink-0" style={{ width: 62, color: 'var(--color-text-muted)' }}>{label}</label>
                      <input
                        type="text"
                        value={hexVal}
                        maxLength={7}
                        placeholder="#000000"
                        onChange={e => {
                          let v = e.target.value
                          if (!v.startsWith('#')) v = '#' + v
                          setDraft(d => ({ ...d, [key]: v }))
                        }}
                        className="text-xs px-1.5 py-0.5 rounded outline-none font-mono"
                        style={{
                          width: 72,
                          border: `1px solid ${isValid ? 'var(--color-border)' : '#f87171'}`,
                          background: 'white', color: 'var(--color-text)',
                        }}
                      />
                      {/* 최근 사용 색상 3칸 */}
                      <div className="flex gap-1 ml-1">
                        {[0, 1, 2].map(ri => {
                          const rc = (recentColors[key] ?? [])[ri]
                          return rc ? (
                            <div key={ri}
                              title={rc}
                              onClick={() => setDraft(d => ({ ...d, [key]: rc }))}
                              style={{
                                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                                background: rc, border: '1px solid var(--color-border)',
                                cursor: 'pointer',
                              }} />
                          ) : (
                            <div key={ri} style={{
                              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                              border: '1px dashed var(--color-border)',
                            }} />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setEditIdx(null)}
                className="flex-1 text-xs py-1.5 rounded-full hover:opacity-70"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>취소</button>
              <button onClick={applyDraft}
                className="flex-1 text-xs py-1.5 rounded-full hover:opacity-80 font-medium"
                style={{ background: 'var(--color-primary)', color: '#fff' }}>저장 & 적용</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
