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
  diaryName: string
  onDiaryNameChange: (name: string) => void
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

type Tab = 'info' | 'display' | 'detail'

const CURRENCIES = [
  { code: 'KRW', symbol: '₩',   label: '원 (₩)' },
  { code: 'USD', symbol: '$',   label: '달러 ($)' },
  { code: 'JPY', symbol: '¥',   label: '엔 (¥)' },
  { code: 'CNY', symbol: '元',  label: '위안 (元)' },
  { code: 'GBP', symbol: '£',   label: '파운드 (£)' },
  { code: 'EUR', symbol: '€',   label: '유로 (€)' },
  { code: 'HKD', symbol: 'HK$', label: '홍콩달러 (HK$)' },
  { code: 'THB', symbol: '฿',   label: '바트 (฿)' },
  { code: 'TWD', symbol: 'NT$', label: '대만달러 (NT$)' },
  { code: 'SGD', symbol: 'S$',  label: '싱가포르달러 (S$)' },
]

type ScrapFieldType = 'text' | 'select' | 'boolean' | 'color' | 'number' | 'geocode'
interface ScrapField { key: string; label: string; type?: ScrapFieldType; options?: string[] }

const SCRAP_TPL_FIELDS: Record<string, ScrapField[]> = {
  baseball: [
    { key: 'homeTeam', label: '내 팀', type: 'select', options: ['삼성 라이온즈', 'KIA 타이거즈', 'LG 트윈스', '두산 베어스', 'NC 다이노스', '롯데 자이언츠', 'SSG 랜더스', 'KT 위즈', '한화 이글스', '키움 히어로즈', '울산 웨일즈', '상무 피닉스'] },
    { key: 'away',    label: '원정팀' },
    { key: 'venue',   label: '경기장' },
    { key: 'seat',    label: '좌석' },
    { key: 'memo',    label: '메모' },
    { key: 'isAway',  label: '원정 경기', type: 'boolean' },
  ],
  ticket: [
    { key: 'category', label: '카테고리', type: 'select', options: ['영화', '공연', '전시', '스포츠', '기타'] },
    { key: 'venue',    label: '장소' },
    { key: 'seat',     label: '좌석' },
    { key: 'price',    label: '가격' },
  ],
  game: [
    { key: 'title',      label: '게임 이름' },
    { key: 'oneiner',    label: '한줄평' },
    { key: 'frameColor', label: '프레임 색상', type: 'color' },
  ],
  receipt: [
    { key: 'store',  label: '가게 이름' },
    { key: 'footer', label: '하단 문구' },
  ],
  wishlist: [
    { key: 'item',      label: '아이템 이름' },
    { key: 'price',     label: '가격' },
    { key: 'oneiner',   label: '한줄평' },
    { key: 'link',      label: '링크 URL' },
    { key: 'wishScore', label: '원하는 정도 (1~5)', type: 'number' },
  ],
  transport: [
    { key: 'type',          label: '교통 수단', type: 'select', options: ['KTX', '비행기', '버스', '지하철', '배', '기타'] },
    { key: 'typeLabel',     label: '호선 / 노선명' },
    { key: 'from',          label: '출발지' },
    { key: 'to',            label: '도착지' },
    { key: 'seat',          label: '좌석' },
    { key: 'price',         label: '가격' },
    { key: 'vehicleNumber', label: '차량 번호' },
  ],
  checkin: [
    { key: 'place',      label: '장소 이름' },
    { key: 'category',   label: '카테고리' },
    { key: 'address',    label: '주소' },
    { key: 'purpose',    label: '방문 목적' },
    { key: 'companions', label: '동행인' },
    { key: 'memo',       label: '메모' },
    { key: 'rating',     label: '별점 (0~5)', type: 'number' },
    { key: 'link',       label: '링크 URL' },
  ],
  coffee: [
    { key: 'roastery',  label: '로스터리' },
    { key: 'bean',      label: '원두' },
    { key: 'equipment', label: '추출 도구' },
    { key: 'beanGrams', label: '원두 (g)',    type: 'number' },
    { key: 'waterMl',   label: '물 (ml)',     type: 'number' },
    { key: 'brewTime',  label: '추출 시간(초)', type: 'number' },
    { key: 'note',      label: '노트' },
    { key: 'isIced',    label: '아이스', type: 'boolean' },
  ],
  food_note: [
    { key: 'dish',       label: '음식 이름' },
    { key: 'restaurant', label: '식당 이름' },
    { key: 'comment',    label: '한줄평' },
    { key: 'matColor',   label: '매트 색상', type: 'color' },
  ],
  youtube: [
    { key: 'impression', label: '감상평' },
  ],
  quote: [
    { key: 'source', label: '출처' },
    { key: 'author', label: '작가/저자' },
    { key: 'memo',   label: '메모' },
    { key: 'layout', label: '레이아웃', type: 'select', options: ['quote', 'manuscript'] },
  ],
  music: [
    { key: 'artist', label: '아티스트' },
    { key: 'lyric',  label: '가사' },
  ],
  makeup: [
    { key: 'sun',               label: '선크림' },
    { key: 'base',              label: '베이스' },
    { key: 'shading',           label: '쉐이딩' },
    { key: 'eyeShadow',         label: '아이섀도우' },
    { key: 'eyeLiner',          label: '아이라이너' },
    { key: 'eyeMascara',        label: '마스카라' },
    { key: 'underShadow',       label: '언더 섀도우' },
    { key: 'underMascara',      label: '언더 마스카라' },
    { key: 'underHighlighter',  label: '언더 하이라이터' },
    { key: 'highlighter',       label: '하이라이터' },
    { key: 'blush',             label: '블러셔' },
    { key: 'lip',               label: '립' },
    { key: 'mood',              label: '무드' },
    { key: 'comment',           label: '코멘트' },
    { key: 'rating',            label: '만족도 (1~5)', type: 'number' },
  ],
  skincare: [
    { key: 'weatherRegion', label: '날씨 지역', type: 'geocode' },
    { key: 'time',      label: 'AM / PM', type: 'select', options: ['AM', 'PM'] },
    { key: 'condition', label: '피부 컨디션' },
    { key: 'weather',   label: '날씨' },
    { key: 'toner',     label: '토너' },
    { key: 'serum',     label: '세럼' },
    { key: 'cream',     label: '크림' },
    { key: 'special',   label: '스페셜 케어' },
    { key: 'memo',      label: '메모' },
  ],
}

const SCRAP_TPL_LIST = [
  { id: 'baseball',  label: '야구 직관' },
  { id: 'ticket',    label: '티켓' },
  { id: 'game',      label: '게임' },
  { id: 'receipt',   label: '영수증' },
  { id: 'wishlist',  label: '위시리스트' },
  { id: 'transport', label: '교통수단' },
  { id: 'checkin',   label: '체크인' },
  { id: 'coffee',    label: '커피' },
  { id: 'food_note', label: '먹은 것' },
  { id: 'youtube',   label: '유튜브' },
  { id: 'quote',     label: '문장 수집' },
  { id: 'music',     label: '음악' },
  { id: 'makeup',    label: '메이크업' },
  { id: 'skincare',  label: '기초 케어' },
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
  diaryName, onDiaryNameChange,
  onClose,
}: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('info')
  const [customs, setCustoms] = useState<(Theme | null)[]>(Array(5).fill(null))
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [draft, setDraft] = useState<Theme>(EMPTY_CUSTOM)
  const [fontSearch, setFontSearch] = useState('')
  const [showFontList, setShowFontList] = useState(false)
  const [recentColors, setRecentColors] = useState<Record<string, string[]>>({})
  const [allDefaults, setAllDefaults] = useState<Record<string, Record<string, string>>>({})
  const [defaultCurrency, setDefaultCurrency] = useState('KRW')
  const [selectedScrapTpl, setSelectedScrapTpl] = useState<string | null>(null)
  const [dbPath, setDbPath] = useState('')
  const [dbPending, setDbPending] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const [recentFonts, setRecentFonts] = useState<string[]>([])
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState<Array<{ name: string; lat: number; lng: number; country: string; admin1?: string }>>([])
  const [geoSearching, setGeoSearching] = useState(false)

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

      const rawScrap = await api.settings.get('scrap_defaults').catch(() => null)
      if (rawScrap) try {
        const parsed = JSON.parse(rawScrap)
        const { _currency, ...rest } = parsed
        if (_currency) setDefaultCurrency(_currency)
        setAllDefaults(rest)
      } catch {}

      const rawCurrency = await api.settings.get('defaultCurrency').catch(() => null)
      if (rawCurrency) setDefaultCurrency(rawCurrency)

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
        const yes = await ask(`새 버전 ${update.version}이 있습니다.\n지금 업데이트 하시겠습니까?`, { title: 'dida 업데이트', kind: 'info' })
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

  const searchGeo = async (q: string) => {
    if (!q.trim()) { setGeoResults([]); return }
    setGeoSearching(true)
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=5&language=ko`
      const raw = await api.http.fetchText(url)
      const json = JSON.parse(raw) as { results?: Array<{ name: string; latitude: number; longitude: number; country: string; admin1?: string }> }
      setGeoResults((json.results ?? []).map(r => ({ name: r.name, lat: r.latitude, lng: r.longitude, country: r.country, admin1: r.admin1 })))
    } catch { setGeoResults([]) }
    setGeoSearching(false)
  }

  const filteredFonts = fontSearch
    ? systemFonts.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
    : systemFonts

  return (
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 999999 }} onClick={onClose}>
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
          {([['info', '정보'], ['display', '화면'], ['detail', '세부설정']] as const).map(([id, label]) => (
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
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>다이어리 이름</p>
              <input
                type="text"
                value={diaryName}
                onChange={e => onDiaryNameChange(e.target.value)}
                placeholder="dida"
                className="w-full text-xs px-3 py-2 rounded-lg outline-none"
                style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }}
              />
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                내보내기 파일명에 사용돼요.
                <p></p>(미리보기: {(diaryName || 'dida').replace(/\s+/g, '_')}_260524_2156.png)
              </p>
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

        {/* Tab: 세부설정 */}
        {tab === 'detail' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-4 flex flex-col gap-5 overflow-y-auto">
              <section>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--color-text-muted)' }}>유령 모드 효과</p>
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: 'var(--color-text)' }}>모자이크 강도</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>{mosaicIntensity}</span>
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
                        <span className="text-xs font-bold" style={{ color: 'var(--color-text-muted)' }}>{blurIntensity}px</span>
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
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>스크랩 옵션</p>
                <div className="mb-3">
                  <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>기본 통화</p>
                  <select
                    value={defaultCurrency}
                    onChange={e => {
                      setDefaultCurrency(e.target.value)
                      api.settings.set('defaultCurrency', e.target.value).catch(() => {})
                    }}
                    className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
                    style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
                {/* Template picker */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {SCRAP_TPL_LIST.map(t => (
                    <button key={t.id} onClick={() => setSelectedScrapTpl(t.id)}
                      className="text-xs px-2 py-1 rounded-full"
                      style={{
                        background: selectedScrapTpl === t.id ? 'var(--color-primary)' : 'var(--color-primary-light)',
                        color: selectedScrapTpl === t.id ? '#fff' : 'var(--color-primary-dark)',
                        border: 'none', cursor: 'pointer',
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {!selectedScrapTpl ? (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    카드를 선택하면 기본값을 설정할 수 있어요.
                  </p>
                ) : (SCRAP_TPL_FIELDS[selectedScrapTpl]?.length ?? 0) === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    이 카드는 설정할 기본값이 없어요.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {SCRAP_TPL_FIELDS[selectedScrapTpl].map((field) => {
                      const { key, label, type = 'text', options } = field
                      const val = allDefaults[selectedScrapTpl]?.[key] ?? ''
                      const setVal = (v: string) => {
                        const next = { ...allDefaults, [selectedScrapTpl]: { ...allDefaults[selectedScrapTpl], [key]: v } }
                        setAllDefaults(next)
                        api.settings.set('scrap_defaults', JSON.stringify(next)).catch(() => {})
                      }
                      return (
                        <div key={key}>
                          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                          {type === 'boolean' ? (
                            <button
                              onClick={() => setVal(val === 'true' ? 'false' : 'true')}
                              className="text-xs px-3 py-1 rounded-full font-medium"
                              style={{
                                background: val === 'true' ? 'var(--color-primary)' : 'var(--color-primary-light)',
                                color: val === 'true' ? '#fff' : 'var(--color-primary-dark)',
                                border: '1px solid var(--color-primary)',
                              }}>
                              {val === 'true' ? 'ON' : 'OFF'}
                            </button>
                          ) : type === 'select' ? (
                            <select
                              value={val}
                              onChange={e => setVal(e.target.value)}
                              className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
                              style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }}>
                              <option value="">— 기본값 없음 —</option>
                              {options?.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : type === 'color' ? (
                            <div className="flex items-center gap-2">
                              <input type="color" value={val || '#ffffff'}
                                onChange={e => setVal(e.target.value)}
                                className="w-8 h-7 rounded cursor-pointer border-0 p-0"
                                style={{ border: '1px solid var(--color-border)' }} />
                              <input type="text" value={val}
                                onChange={e => setVal(e.target.value)}
                                placeholder="#ffffff"
                                className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
                                style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }} />
                            </div>
                          ) : type === 'number' ? (
                            <input
                              type="number"
                              value={val}
                              onChange={e => setVal(e.target.value)}
                              className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
                              style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }} />
                          ) : type === 'geocode' ? (
                            <div>
                              {val && (() => {
                                try {
                                  const g = JSON.parse(val)
                                  return <p className="text-xs mb-1.5 font-medium" style={{ color: 'var(--color-text)' }}>{g.name}{g.admin1 ? `, ${g.admin1}` : ''} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({g.country})</span></p>
                                } catch { return <p className="text-xs mb-1.5" style={{ color: 'var(--color-text)' }}>{val}</p> }
                              })()}
                              <div className="flex gap-1 mb-1">
                                <input
                                  type="text"
                                  value={geoQuery}
                                  onChange={e => setGeoQuery(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') searchGeo(geoQuery) }}
                                  placeholder="도시 이름으로 검색"
                                  className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                                  style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }} />
                                <button
                                  onClick={() => searchGeo(geoQuery)}
                                  disabled={geoSearching}
                                  className="text-xs px-2 py-1.5 rounded-lg"
                                  style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)', cursor: geoSearching ? 'default' : 'pointer', opacity: geoSearching ? 0.6 : 1 }}>
                                  {geoSearching ? '…' : '검색'}
                                </button>
                              </div>
                              {geoResults.length > 0 && (
                                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                                  {geoResults.map((r, i) => (
                                    <button key={i}
                                      onClick={() => { setVal(JSON.stringify({ name: r.name, lat: r.lat, lng: r.lng, country: r.country, admin1: r.admin1 })); setGeoResults([]); setGeoQuery('') }}
                                      className="w-full text-left text-xs px-2 py-1.5 hover:bg-pink-50"
                                      style={{ borderBottom: i < geoResults.length - 1 ? '1px solid var(--color-border)' : 'none', color: 'var(--color-text)', background: 'white', display: 'block' }}>
                                      {r.name}{r.admin1 ? `, ${r.admin1}` : ''} <span style={{ color: 'var(--color-text-muted)' }}>{r.country}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={val}
                              onChange={e => setVal(e.target.value)}
                              className="w-full text-xs px-2 py-1.5 rounded-lg outline-none"
                              style={{ border: '1px solid var(--color-border)', background: 'white', color: 'var(--color-text)' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
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
