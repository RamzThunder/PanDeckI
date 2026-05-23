import React, { useEffect, useState } from 'react'
import { Theme, PRESET_THEMES, applyTheme } from '../store/theme'
import { api } from '../api'

interface Props {
  activeThemeId: string
  onThemeChange: (id: string) => void
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

export default function ThemePanel({ activeThemeId, onThemeChange, onClose }: Props): JSX.Element {
  const [customs, setCustoms] = useState<(Theme | null)[]>(Array(5).fill(null))
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [draft, setDraft] = useState<Theme>(EMPTY_CUSTOM)

  useEffect(() => {
    async function load() {
      const loaded = await Promise.all(CUSTOM_SLOTS.map(async (slot, i) => {
        const raw = await api.settings.get(`theme_${slot}`).catch(() => null)
        if (!raw) return null
        try {
          const t = JSON.parse(raw) as Theme
          return { ...t, id: slot }
        } catch { return null }
      }))
      setCustoms(loaded)
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

  const selectTheme = (t: Theme) => {
    applyTheme(t)
    onThemeChange(t.id)
  }

  const startEdit = (idx: number) => {
    const existing = customs[idx]
    setDraft(existing ?? { ...EMPTY_CUSTOM, id: CUSTOM_SLOTS[idx], name: CUSTOM_LABELS[idx] })
    setEditIdx(idx)
  }

  const applyDraft = async () => {
    if (editIdx === null) return
    const saved = await saveCustom(editIdx, draft)
    selectTheme(saved)
    setEditIdx(null)
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="w-72 h-full overflow-y-auto shadow-2xl flex flex-col"
        style={{ background: 'var(--color-bg)', borderLeft: '1px solid var(--color-border)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>테마</h3>
          <button onClick={onClose} className="text-lg hover:opacity-60 transition-opacity"
            style={{ color: 'var(--color-text-muted)' }}>×</button>
        </div>

        <div className="flex-1 p-4 flex flex-col gap-5">
          {/* Preset themes */}
          <section>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>기본 테마</p>
            <div className="flex flex-col gap-2">
              {PRESET_THEMES.map(t => (
                <button key={t.id} onClick={() => selectTheme(t)}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all hover:opacity-90"
                  style={{
                    background: t.sidebar,
                    border: `2px solid ${activeThemeId === t.id ? t.primaryDark : t.border}`,
                  }}>
                  {/* Color dots */}
                  <div className="flex gap-1 shrink-0">
                    <div className="w-5 h-5 rounded-full" style={{ background: t.primary }} />
                    <div className="w-5 h-5 rounded-full" style={{ background: t.secondary }} />
                    <div className="w-5 h-5 rounded-full" style={{ background: t.bg }} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: t.text }}>{t.name}</span>
                  {activeThemeId === t.id && (
                    <span className="ml-auto text-xs" style={{ color: t.primaryDark }}>✓</span>
                  )}
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
                    style={{
                      background: t ? t.sidebar : 'var(--color-primary-light)',
                      border: `2px solid ${activeThemeId === slot ? 'var(--color-primary-dark)' : 'var(--color-border)'}`,
                    }}>
                    {t ? (
                      <>
                        <div className="flex gap-1 shrink-0">
                          <div className="w-5 h-5 rounded-full" style={{ background: t.primary }} />
                          <div className="w-5 h-5 rounded-full" style={{ background: t.secondary }} />
                          <div className="w-5 h-5 rounded-full" style={{ background: t.bg }} />
                        </div>
                        <button onClick={() => selectTheme(t)}
                          className="text-sm font-medium flex-1 text-left hover:opacity-70 transition-opacity"
                          style={{ color: t.text }}>{t.name || CUSTOM_LABELS[idx]}</button>
                        {activeThemeId === slot && <span className="text-xs" style={{ color: t.primaryDark }}>✓</span>}
                        <button onClick={() => startEdit(idx)}
                          className="text-xs px-1.5 py-0.5 rounded hover:opacity-70 transition-opacity"
                          style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>편집</button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs flex-1" style={{ color: 'var(--color-text-muted)' }}>{CUSTOM_LABELS[idx]}</span>
                        <button onClick={() => startEdit(idx)}
                          className="text-xs px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
                          style={{ background: 'var(--color-primary)', color: '#fff' }}>+ 만들기</button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* Custom theme editor (inline) */}
        {editIdx !== null && (
          <div className="shrink-0 border-t p-4 flex flex-col gap-3"
            style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.6)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
              {CUSTOM_LABELS[editIdx]} 편집
            </p>
            <div className="flex flex-col gap-1.5">
              <div>
                <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>테마 이름</label>
                <input type="text" value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  className="w-full text-xs px-2 py-1 rounded outline-none mt-0.5"
                  style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }}
                  placeholder={CUSTOM_LABELS[editIdx]} />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1">
                {COLOR_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-1">
                    <label className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{label}</label>
                    <input type="color" value={draft[key] as string}
                      onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                      className="w-7 h-7 rounded cursor-pointer shrink-0"
                      style={{ border: '1px solid var(--color-border)', padding: 1 }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={() => setEditIdx(null)}
                className="flex-1 text-xs py-1.5 rounded-full hover:opacity-70 transition-opacity"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                취소
              </button>
              <button onClick={applyDraft}
                className="flex-1 text-xs py-1.5 rounded-full hover:opacity-80 transition-opacity font-medium"
                style={{ background: 'var(--color-primary)', color: '#fff' }}>
                저장 & 적용
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
