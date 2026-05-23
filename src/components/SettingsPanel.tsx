import React, { useEffect, useState } from 'react'
import { Theme, PRESET_THEMES, applyTheme, applyGlobalFont } from '../store/theme'
import { api } from '../api'

interface Props {
  activeThemeId: string
  onThemeChange: (id: string) => void
  appZoom: number
  onZoomChange: (z: number) => void
  globalFont: string
  onGlobalFontChange: (f: string) => void
  systemFonts: string[]
  fontScale: number
  onFontScaleChange: (v: number) => void
  fontOffsetY: number
  onFontOffsetYChange: (v: number) => void
  mosaicIntensity: number
  onMosaicIntensityChange: (v: number) => void
  blurIntensity: number
  onBlurIntensityChange: (v: number) => void
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

type Tab = 'theme' | 'display' | 'scrap'

const SCRAP_TPL_FIELDS: Record<string, { key: string; label: string }[]> = {
  baseball:  [{ key:'away', label:'원정팀' }, { key:'venue', label:'경기장' }, { key:'seat', label:'좌석' }],
  ticket:    [{ key:'venue', label:'장소' }, { key:'seat', label:'좌석' }, { key:'price', label:'가격' }],
  game:      [{ key:'title', label:'게임 이름' }],
  receipt:   [{ key:'store', label:'가게 이름' }, { key:'footer', label:'하단 문구' }],
  wishlist:  [{ key:'item', label:'아이템 이름' }, { key:'price', label:'가격' }],
  transport: [{ key:'from', label:'출발지' }, { key:'to', label:'도착지' }, { key:'seat', label:'좌석' }],
  checkin:   [{ key:'place', label:'장소 이름' }, { key:'category', label:'카테고리' }],
  coffee:    [{ key:'roastery', label:'로스터리' }, { key:'equipment', label:'추출 도구' }],
  food_note: [{ key:'restaurant', label:'식당 이름' }, { key:'comment', label:'기본 한줄평' }],
  youtube:   [],
  quote:     [{ key:'source', label:'출처' }, { key:'author', label:'작가/저자' }],
  music:     [{ key:'artist', label:'아티스트' }],
}

const SCRAP_TPL_LIST = [
  { id: 'baseball',  emoji: '⚾', label: '야구 직관' },
  { id: 'ticket',    emoji: '🎬', label: '티켓' },
  { id: 'game',      emoji: '🎮', label: '게임' },
  { id: 'receipt',   emoji: '🧾', label: '영수증' },
  { id: 'wishlist',  emoji: '✦',  label: '위시리스트' },
  { id: 'transport', emoji: '🚀', label: '교통수단' },
  { id: 'checkin',   emoji: '📍', label: '체크인' },
  { id: 'coffee',    emoji: '☕', label: '커피' },
  { id: 'food_note', emoji: '🍴', label: '먹은 것' },
  { id: 'quote',     emoji: '"', label: '문장 수집' },
  { id: 'music',     emoji: '♪',  label: '음악' },
]

export default function SettingsPanel({
  activeThemeId, onThemeChange,
  appZoom, onZoomChange,
  globalFont, onGlobalFontChange,
  systemFonts,
  fontScale, onFontScaleChange,
  fontOffsetY, onFontOffsetYChange,
  mosaicIntensity, onMosaicIntensityChange,
  blurIntensity, onBlurIntensityChange,
  onClose,
}: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('theme')
  const [customs, setCustoms] = useState<(Theme | null)[]>(Array(5).fill(null))
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [draft, setDraft] = useState<Theme>(EMPTY_CUSTOM)
  const [fontSearch, setFontSearch] = useState('')
  const [showFontList, setShowFontList] = useState(false)
  const [recentColors, setRecentColors] = useState<Record<string, string[]>>({})
  const [allDefaults, setAllDefaults] = useState<Record<string, Record<string, string>>>({})
  const [selectedScrapTpl, setSelectedScrapTpl] = useState<string | null>(null)

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

      const rawScrap = await api.settings.get('scrap_defaults').catch(() => null)
      if (rawScrap) try { setAllDefaults(JSON.parse(rawScrap)) } catch {}
    }
    load()
  }, [])

  const saveCustom = async (idx: number, theme: Theme) => {
    const slot = CUSTOM_SLOTS[idx]
    const t = { ...theme, id: slot }
    await api.settings.set(`theme_${slot}`, JSON.stringify(t)).catch(() => {})
    setCustoms(prev => { const next = [...prev]; next[idx] = t; return next })
    return t
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
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="w-72 h-full overflow-y-auto shadow-2xl flex flex-col"
        style={{ background: 'var(--color-bg)', borderLeft: '1px solid var(--color-border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>설정</h3>
          <button onClick={onClose} className="text-lg hover:opacity-60" style={{ color: 'var(--color-text-muted)' }}>×</button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
          {([['theme', '테마'], ['display', '화면'], ['scrap', '스크랩']] as const).map(([id, label]) => (
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

        {/* Tab: 테마 */}
        {tab === 'theme' && (
          <div className="flex-1 p-4 flex flex-col gap-5 overflow-y-auto">

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
                      {filteredFonts.map(f => (
                        <button key={f}
                          onClick={() => { onGlobalFontChange(f); setShowFontList(false); setFontSearch(''); applyGlobalFont(f) }}
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
          </div>
        )}

        {/* Tab: 화면 */}
        {tab === 'display' && (
          <div className="flex-1 p-4 flex flex-col gap-5">
            <section>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-muted)' }}>화면 배율</p>
              <div className="flex items-center gap-3">
                <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>50%</span>
                <input type="range" min={50} max={150} step={5} value={Math.round(appZoom * 100)}
                  onChange={e => onZoomChange(Number(e.target.value) / 100)}
                  className="flex-1 cursor-pointer" />
                <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>150%</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold" style={{ color: 'var(--color-primary-dark)' }}>{Math.round(appZoom * 100)}%</span>
                <button onClick={() => onZoomChange(1.0)}
                  className="text-xs px-3 py-1 rounded-full hover:opacity-80"
                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
                  초기화 (100%)
                </button>
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
                Cmd + 스크롤로도 조절할 수 있어요.
              </p>
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

            <section>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-muted)' }}>유령 모드 효과</p>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--color-text)' }}>모자이크 강도</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: '#9c59d1' }}>{mosaicIntensity}</span>
                      <button onClick={() => onMosaicIntensityChange(14)} className="text-xs hover:opacity-70"
                        style={{ color: 'var(--color-text-muted)' }}>초기화</button>
                    </div>
                  </div>
                  <input type="range" min={4} max={40} step={2} value={mosaicIntensity}
                    onChange={e => onMosaicIntensityChange(Number(e.target.value))}
                    className="w-full cursor-pointer" />
                  <div className="flex justify-between mt-0.5">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>세밀하게</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>굵게</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'var(--color-text)' }}>블러 강도</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: '#9c59d1' }}>{blurIntensity}px</span>
                      <button onClick={() => onBlurIntensityChange(12)} className="text-xs hover:opacity-70"
                        style={{ color: 'var(--color-text-muted)' }}>초기화</button>
                    </div>
                  </div>
                  <input type="range" min={2} max={40} step={1} value={blurIntensity}
                    onChange={e => onBlurIntensityChange(Number(e.target.value))}
                    className="w-full cursor-pointer" />
                  <div className="flex justify-between mt-0.5">
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>약하게</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>강하게</span>
                  </div>
                </div>
              </div>
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
          </div>
        )}

        {/* Tab: 스크랩 */}
        {tab === 'scrap' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Template picker */}
            <div className="p-3 flex flex-wrap gap-1.5 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
              {SCRAP_TPL_LIST.map(t => (
                <button key={t.id} onClick={() => setSelectedScrapTpl(t.id)}
                  className="text-xs px-2 py-1 rounded-full"
                  style={{
                    background: selectedScrapTpl === t.id ? 'var(--color-primary)' : 'var(--color-primary-light)',
                    color: selectedScrapTpl === t.id ? '#fff' : 'var(--color-primary-dark)',
                    border: 'none', cursor: 'pointer',
                  }}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>

            {/* Fields for selected template */}
            <div className="flex-1 p-4 overflow-y-auto">
              {!selectedScrapTpl ? (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  위에서 카드를 선택하면 기본값을 설정할 수 있어요.
                </p>
              ) : (SCRAP_TPL_FIELDS[selectedScrapTpl]?.length ?? 0) === 0 ? (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  이 카드는 설정할 기본값이 없어요.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {SCRAP_TPL_FIELDS[selectedScrapTpl].map(({ key, label }) => (
                    <div key={key}>
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                      <input
                        type="text"
                        value={allDefaults[selectedScrapTpl]?.[key] ?? ''}
                        onChange={e => {
                          const next: Record<string, Record<string, string>> = {
                            ...allDefaults,
                            [selectedScrapTpl]: { ...allDefaults[selectedScrapTpl], [key]: e.target.value },
                          }
                          setAllDefaults(next)
                          api.settings.set('scrap_defaults', JSON.stringify(next)).catch(() => {})
                        }}
                        className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
                        style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Custom theme editor */}
        {editIdx !== null && tab === 'theme' && (
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
