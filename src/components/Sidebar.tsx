import React from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import { ViewMode } from '../store/diary'

const startDrag = () => invoke('window_start_dragging')
const BGM_STORAGE_KEY = 'dida-sidebar-bgm'

type BgmTrack = {
  id: string
  url: string
  title: string
}

type BgmPlaybackMode = 'repeat-one' | 'recent-list'

type BgmStorage = {
  url?: string
  id?: string | null
  title?: string
  volume?: number
  playbackMode?: BgmPlaybackMode
  recents?: BgmTrack[]
}

type YoutubePlayer = {
  playVideo?: () => void
  pauseVideo?: () => void
  stopVideo?: () => void
  destroy?: () => void
  setVolume?: (volume: number) => void
  getCurrentTime?: () => number
  getDuration?: () => number
  loadVideoById?: (videoId: string | { videoId: string; startSeconds?: number }) => void
}

type YoutubeApi = {
  Player: new (
    element: HTMLElement | string,
    options: {
      height: string
      width: string
      videoId: string
      playerVars?: Record<string, number | string>
      events?: {
        onReady?: (event: { target: YoutubePlayer }) => void
        onStateChange?: (event: { data: number }) => void
      }
    }
  ) => YoutubePlayer
}

declare global {
  interface Window {
    YT?: YoutubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

let youtubeApiPromise: Promise<void> | null = null

const readBgmStorage = (): BgmStorage => {
  try {
    return JSON.parse(localStorage.getItem(BGM_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

const getYoutubeTitle = async (url: string, id: string) => {
  try {
    const targetUrl = url.trim() || `https://www.youtube.com/watch?v=${id}`
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(targetUrl)}`)
    if (!response.ok) throw new Error('title fetch failed')
    const data = await response.json() as { title?: string }
    return data.title?.trim() || `YouTube BGM (${id})`
  } catch {
    return `YouTube BGM (${id})`
  }
}

const pushRecentBgm = (recents: BgmTrack[], track: BgmTrack) => {
  return [track, ...recents.filter(item => item.id !== track.id)].slice(0, 5)
}

const loadPngB64 = (b64: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed'))
    img.src = `data:image/png;base64,${b64}`
  })
}

const toHex = (r: number, g: number, b: number) => {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

const loadYoutubeApi = () => {
  if (window.YT?.Player) return Promise.resolve()
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise<void>((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      resolve()
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag)
    }
  })

  return youtubeApiPromise
}

interface Props {
  viewMode: ViewMode
  currentDate: Date
  onViewChange: (v: ViewMode) => void
  onDateSelect: (d: Date) => void
  onThemeToggle: () => void
  themeOpen: boolean
  onSave: () => void
  onExport: () => void
}

const ICONS = {
  monthly:  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2.5" ry="2.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  daily:    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M 8 21 H 5 a 2 2 0 0 1 -2 -2 V 5 a 2 2 0 0 1 2 -2 h 10 a 2 2 0 0 1 2 2 v 2"/><line x1="7" y1="9" x2="12" y2="9"/><line x1="7" y1="13" x2="9" y2="13"/><path d="M19.5 8.5a1.5 1.5 0 0 0-2.12 0l-6.88 6.88v3h3l6.88-6.88a1.5 1.5 0 0 0 0-2.12z"/><line x1="16" y1="10" x2="18" y2="12"/></svg>,
  export:   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  music:   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  musicOff:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  colorPicker:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>,
  check:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  repeatAll:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>,
  repeatOne:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /><path d="M11 11l1-1v4" /></svg>,
  save:     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M 6 21 v -5 a 1 1 0 0 1 1 -1 h 10 a 1 1 0 0 1 1 1 v 5"/><path d="M 8 3 v 4 a 1 1 0 0 0 1 1 h 6 a 1 1 0 0 0 1 -1 v -4"/></svg>,
  settings: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
}

const views: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'monthly', label: '월간', icon: ICONS.monthly },
  { id: 'daily',   label: '일간', icon: ICONS.daily   },
]

const TrafficLight = ({ color, hoverColor, onClick }: { color: string; hoverColor: string; onClick: () => void }) => {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onClick={onClick}
      onMouseDown={e => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 12, height: 12, borderRadius: '50%', cursor: 'pointer',
        background: hovered ? hoverColor : color,
        transition: 'background 0.1s',
        flexShrink: 0,
      }}
    />
  )
}

export default function Sidebar({ viewMode, currentDate, onViewChange, onThemeToggle, themeOpen, onSave, onExport }: Props): JSX.Element {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const [pickedColor, setPickedColor] = React.useState('')
  const [isColorPicking, setIsColorPicking] = React.useState(false)
  const [colorPointer, setColorPointer] = React.useState<{ x: number; y: number } | null>(null)
  const [colorMagnifier, setColorMagnifier] = React.useState<{ x: number; y: number; b64: string; hex: string } | null>(null)
  const [bgmUrl, setBgmUrl] = React.useState(() => {
    return readBgmStorage().url || ''
  })
  const [bgmId, setBgmId] = React.useState<string | null>(() => {
    return readBgmStorage().id || null
  })
  const [bgmTitle, setBgmTitle] = React.useState(() => {
    return readBgmStorage().title || ''
  })
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [isBgmInputOpen, setIsBgmInputOpen] = React.useState(false)
  const [isTitleLoading, setIsTitleLoading] = React.useState(false)
  const [recentBgms, setRecentBgms] = React.useState<BgmTrack[]>(() => {
    const recents = readBgmStorage().recents
    return Array.isArray(recents) ? recents.filter(item => item?.id && item?.title).slice(0, 5) : []
  })
  const [playbackMode, setPlaybackMode] = React.useState<BgmPlaybackMode>(() => {
    return readBgmStorage().playbackMode === 'recent-list' ? 'recent-list' : 'repeat-one'
  })
  const [progress, setProgress] = React.useState(0)
  const [volume, setVolume] = React.useState(() => {
    const stored = Number(readBgmStorage().volume)
    return Number.isFinite(stored) ? Math.min(100, Math.max(0, stored)) : 15
  })

  const ytPlayerRef = React.useRef<YoutubePlayer | null>(null)
  const ytPlayerHostRef = React.useRef<HTMLDivElement | null>(null)
  const bgmShellRef = React.useRef<HTMLDivElement | null>(null)
  const isPlayingRef = React.useRef(isPlaying)
  const volumeRef = React.useRef(volume)
  const bgmIdRef = React.useRef(bgmId)
  const recentBgmsRef = React.useRef(recentBgms)
  const playbackModeRef = React.useRef(playbackMode)
  const bgmRequestRef = React.useRef(0)
  const clickTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const colorFeedbackTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressClickUntilRef = React.useRef(0)
  const colorSnapshotCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const colorSnapshotScaleRef = React.useRef({ x: 1, y: 1 })

  const extractYoutubeId = React.useCallback((url: string) => {
    const trimmed = url.trim()
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed

    try {
      const parsed = new URL(trimmed)
      if (parsed.hostname.includes('youtu.be')) {
        return parsed.pathname.split('/').filter(Boolean)[0] || null
      }
      if (parsed.hostname.includes('youtube.com')) {
        const fromQuery = parsed.searchParams.get('v')
        if (fromQuery) return fromQuery
        const parts = parsed.pathname.split('/').filter(Boolean)
        const markerIndex = parts.findIndex(part => ['embed', 'shorts', 'live'].includes(part))
        if (markerIndex >= 0) return parts[markerIndex + 1] || null
      }
    } catch {
      const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/))([a-zA-Z0-9_-]{11})/)
      return match?.[1] || null
    }

    return null
  }, [])

  const activateBgm = React.useCallback(async (track: { id: string; url: string; title?: string }) => {
    const requestId = bgmRequestRef.current + 1
    bgmRequestRef.current = requestId
    setProgress(0)
    setIsTitleLoading(!track.title)
    const title = track.title || await getYoutubeTitle(track.url, track.id)
    if (bgmRequestRef.current !== requestId) return

    const nextTrack = { id: track.id, url: track.url, title }

    setBgmUrl(track.url)
    setBgmId(track.id)
    setBgmTitle(title)
    setRecentBgms(prev => pushRecentBgm(prev, nextTrack))
    setIsPlaying(true)
    setIsTitleLoading(false)
  }, [])

  const clearBgm = React.useCallback(() => {
    bgmRequestRef.current += 1
    setBgmUrl('')
    setBgmId(null)
    setBgmTitle('')
    setProgress(0)
    setIsPlaying(false)
    setIsTitleLoading(false)
    ytPlayerRef.current?.stopVideo?.()
  }, [])

  const clearRecentBgms = React.useCallback(() => {
    setRecentBgms([])
  }, [])

  const removeRecentBgm = React.useCallback((id: string) => {
    setRecentBgms(prev => prev.filter(track => track.id !== id))
  }, [])

  const playNextRecentBgm = React.useCallback(() => {
    const currentId = bgmIdRef.current
    const recents = recentBgmsRef.current

    if (playbackModeRef.current !== 'recent-list' || recents.length < 2) {
      if (currentId) ytPlayerRef.current?.loadVideoById?.(currentId)
      return
    }

    const currentIndex = recents.findIndex(track => track.id === currentId)
    const nextTrack = recents[currentIndex >= 0 ? (currentIndex + 1) % recents.length : 0]
    if (nextTrack) {
      setProgress(0)
      setBgmUrl(nextTrack.url)
      setBgmId(nextTrack.id)
      setBgmTitle(nextTrack.title)
      setIsPlaying(true)
    } else if (currentId) {
      ytPlayerRef.current?.loadVideoById?.(currentId)
    }
  }, [])

  const handleBgmSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return

    if (!bgmUrl.trim()) {
      clearBgm()
      return
    }

    const id = extractYoutubeId(bgmUrl)
    if (!id) {
      window.alert('올바른 유튜브 링크를 넣어주세요!')
      return
    }

    activateBgm({ id, url: bgmUrl.trim() })
  }

  const handleRecentBgmClick = (track: BgmTrack) => {
    activateBgm(track)
  }

  const handleBgmClick = () => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
      setIsBgmInputOpen(prev => !prev)
      return
    }

    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null
      if (!bgmId) {
        setIsBgmInputOpen(true)
        return
      }
      setIsPlaying(prev => !prev)
    }, 250)
  }

  const copyPickedColor = React.useCallback(async (hex: string) => {
    const normalized = hex.toUpperCase()
    try {
      await navigator.clipboard.writeText(normalized)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = normalized
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }

    setPickedColor(normalized)
    if (colorFeedbackTimeoutRef.current) clearTimeout(colorFeedbackTimeoutRef.current)
    colorFeedbackTimeoutRef.current = setTimeout(() => setPickedColor(''), 1400)
  }, [])

  const handleColorPick = async () => {
    setIsColorPicking(true)
  }

  const stopPickerEvent = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }

  const sampleColorFromSnapshot = React.useCallback((x: number, y: number) => {
    const source = colorSnapshotCanvasRef.current
    if (!source) return null

    const scale = colorSnapshotScaleRef.current
    const sx = Math.max(0, Math.min(source.width - 1, Math.round(x * scale.x)))
    const sy = Math.max(0, Math.min(source.height - 1, Math.round(y * scale.y)))
    const sourceCtx = source.getContext('2d')
    if (!sourceCtx) return null

    const [r, g, b] = sourceCtx.getImageData(sx, sy, 1, 1).data
    const crop = document.createElement('canvas')
    crop.width = 15
    crop.height = 15
    const cropCtx = crop.getContext('2d')
    if (!cropCtx) return null
    cropCtx.imageSmoothingEnabled = false
    cropCtx.drawImage(source, sx - 7, sy - 7, 15, 15, 0, 0, 15, 15)

    return {
      b64: crop.toDataURL('image/png').split(',')[1],
      hex: toHex(r, g, b),
    }
  }, [])

  React.useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  React.useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  React.useEffect(() => {
    bgmIdRef.current = bgmId
  }, [bgmId])

  React.useEffect(() => {
    recentBgmsRef.current = recentBgms
  }, [recentBgms])

  React.useEffect(() => {
    playbackModeRef.current = playbackMode
  }, [playbackMode])

  React.useEffect(() => {
    localStorage.setItem(BGM_STORAGE_KEY, JSON.stringify({
      url: bgmUrl,
      id: bgmId,
      title: bgmTitle,
      volume,
      playbackMode,
      recents: recentBgms,
    }))
  }, [bgmId, bgmTitle, bgmUrl, playbackMode, recentBgms, volume])

  React.useEffect(() => {
    if (!isBgmInputOpen) return

    const onPointerDown = (event: PointerEvent) => {
      if (!bgmShellRef.current?.contains(event.target as Node)) {
        setIsBgmInputOpen(false)
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isBgmInputOpen])

  React.useEffect(() => {
    if (!bgmId || !ytPlayerHostRef.current) return

    let cancelled = false
    loadYoutubeApi().then(() => {
      if (cancelled || !window.YT?.Player || !ytPlayerHostRef.current) return

      if (!ytPlayerRef.current) {
        ytPlayerRef.current = new window.YT.Player(ytPlayerHostRef.current, {
          height: '1',
          width: '1',
          videoId: bgmId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: (event) => {
              event.target.setVolume?.(volumeRef.current)
              if (isPlayingRef.current) event.target.playVideo?.()
            },
            onStateChange: (event) => {
              if (event.data === 0 && isPlayingRef.current) {
                playNextRecentBgm()
              }
            },
          },
        })
        return
      }

      ytPlayerRef.current.loadVideoById?.(bgmId)
      ytPlayerRef.current.setVolume?.(volumeRef.current)
      if (isPlayingRef.current) ytPlayerRef.current.playVideo?.()
    })

    return () => {
      cancelled = true
    }
  }, [bgmId, playNextRecentBgm])

  React.useEffect(() => {
    if (!ytPlayerRef.current) return
    if (isPlaying) ytPlayerRef.current.playVideo?.()
    else ytPlayerRef.current.pauseVideo?.()
  }, [isPlaying])

  React.useEffect(() => {
    ytPlayerRef.current?.setVolume?.(volume)
  }, [volume])

  React.useEffect(() => {
    if (!isPlaying) return

    const updateProgress = () => {
      const duration = ytPlayerRef.current?.getDuration?.() || 0
      const currentTime = ytPlayerRef.current?.getCurrentTime?.() || 0
      setProgress(duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0)
    }

    updateProgress()
    const timer = window.setInterval(updateProgress, 500)
    return () => window.clearInterval(timer)
  }, [isPlaying, bgmId])

  React.useEffect(() => {
    if (!isColorPicking) return

    let cancelled = false
    colorSnapshotCanvasRef.current = null
    setColorMagnifier(null)
    const snapshotRect = {
      x: 0,
      y: 0,
      w: window.innerWidth,
      h: window.innerHeight,
    }
    invoke<string>('capture_region_b64', snapshotRect)
      .then(loadPngB64)
      .then(img => {
        if (cancelled) return
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0)
        colorSnapshotCanvasRef.current = canvas
        colorSnapshotScaleRef.current = {
          x: canvas.width / Math.max(1, snapshotRect.w),
          y: canvas.height / Math.max(1, snapshotRect.h),
        }
      })
      .catch(e => console.warn('app color snapshot failed', e))

    const onPointerDown = async (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-color-picker-button="true"]')) return

      stopPickerEvent(event)
      suppressClickUntilRef.current = Date.now() + 500
      setIsColorPicking(false)
      setColorMagnifier(null)
      setColorPointer(null)

      const sample = sampleColorFromSnapshot(event.clientX, event.clientY)
      if (sample) await copyPickedColor(sample.hex)
    }

    const onPointerMove = (event: PointerEvent) => {
      stopPickerEvent(event)
      const x = event.clientX
      const y = event.clientY
      setColorPointer({ x, y })

      const sample = sampleColorFromSnapshot(x, y)
      if (sample) setColorMagnifier({ x, y, ...sample })
    }

    const blockPointerEvent = (event: PointerEvent) => {
      stopPickerEvent(event)
    }

    const blockClickEvent = (event: MouseEvent) => {
      stopPickerEvent(event)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stopPickerEvent(event)
        setIsColorPicking(false)
        setColorMagnifier(null)
        setColorPointer(null)
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('pointerup', blockPointerEvent, true)
    document.addEventListener('click', blockClickEvent, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelled = true
      colorSnapshotCanvasRef.current = null
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('pointerup', blockPointerEvent, true)
      document.removeEventListener('click', blockClickEvent, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [copyPickedColor, isColorPicking, sampleColorFromSnapshot])

  React.useEffect(() => {
    const blockStrayClick = (event: MouseEvent) => {
      if (Date.now() < suppressClickUntilRef.current) stopPickerEvent(event)
    }

    document.addEventListener('click', blockStrayClick, true)
    return () => document.removeEventListener('click', blockStrayClick, true)
  }, [])

  React.useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current)
      if (colorFeedbackTimeoutRef.current) clearTimeout(colorFeedbackTimeoutRef.current)
      ytPlayerRef.current?.stopVideo?.()
      ytPlayerRef.current?.destroy?.()
    }
  }, [])

  const colorMagnifierOverlay = isColorPicking && (colorPointer || colorMagnifier)
    ? createPortal(
      <div
        style={{
          position: 'fixed',
          left: Math.min((colorPointer?.x ?? colorMagnifier?.x ?? 0) + 18, window.innerWidth - 140),
          top: Math.min((colorPointer?.y ?? colorMagnifier?.y ?? 0) + 18, window.innerHeight - 166),
          width: 122,
          padding: 6,
          borderRadius: 10,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          zIndex: 999999,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 108,
            height: 108,
            overflow: 'hidden',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: '#fff'
          }}
        >
          <img
            src={colorMagnifier ? `data:image/png;base64,${colorMagnifier.b64}` : undefined}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              imageRendering: 'pixelated',
              display: colorMagnifier ? 'block' : 'none'
            }}
          />
          <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: 'rgba(0,0,0,0.38)' }} />
          <div style={{ position: 'absolute', left: 0, top: '50%', width: '100%', height: 1, background: 'rgba(0,0,0,0.38)' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10, transform: 'translate(-50%, -50%)', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.65)', borderRadius: 2 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, border: '1px solid var(--color-border)', background: colorMagnifier?.hex ?? 'transparent', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary-dark)', whiteSpace: 'nowrap' }}>{colorMagnifier?.hex ?? '읽는 중...'}</span>
        </div>
      </div>,
      document.body
    )
    : null

  return (
    <aside
      className="w-16 flex flex-col items-center shrink-0 gap-2"
      style={{ background: 'var(--color-sidebar)', borderRight: '1px solid var(--color-border)' }}
    >
      {/* 드래그 가능한 트래픽라이트 영역 */}
      <div
        className="w-full flex items-center justify-center gap-1.5 shrink-0"
        style={{ height: 36, paddingTop: 4 }}
        onMouseDown={startDrag}
      >
        <TrafficLight color="#FF5F57" hoverColor="#E0443E" onClick={() => invoke('window_close')} />
        <TrafficLight color="#FEBC2E" hoverColor="#D49B1C" onClick={() => invoke('window_minimize')} />
        <TrafficLight color="#28C840" hoverColor="#1DAF34" onClick={() => invoke('window_toggle_maximize')} />
      </div>

      {/* 연/월 표시 */}
      <div className="mb-4 mt-2 text-center">
        <div className="text-xs font-bold" style={{ color: 'var(--color-primary-dark)' }}>
          {year}
        </div>
        <div className="text-lg font-bold" style={{ color: 'var(--color-primary-dark)' }}>
          {String(month).padStart(2, '0')}
        </div>
      </div>

      {views.map((v) => (
        <button
          key={v.id}
          onClick={() => onViewChange(v.id)}
          title={v.label}
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
          style={{
            background: viewMode === v.id ? 'var(--color-primary)' : 'transparent',
            color: viewMode === v.id ? '#fff' : 'var(--color-text-muted)'
          }}
        >
          {v.icon}
        </button>
      ))}

      {/* 내보내기 버튼 */}
      <button
        onClick={onExport}
        className="w-11 h-11 rounded-xl flex items-center justify-center transition-all mt-1"
        style={{ background: 'transparent', color: 'var(--color-text-muted)' }}
        title="PNG로 내보내기"
      >
        {ICONS.export}
      </button>

      {/* BGM 버튼 */}
      <div ref={bgmShellRef} className="relative flex items-center justify-center mb-1" style={{ width: '100%', zIndex: 20 }}>
        <button
          onClick={handleBgmClick}
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
          style={{
            background: isPlaying ? 'var(--color-primary)' : 'transparent',
            color: isPlaying ? '#fff' : 'var(--color-text-muted)'
          }}
          title={bgmTitle || 'BGM'}
        >
          {isPlaying ? ICONS.music : ICONS.musicOff}
        </button>

        {isBgmInputOpen && (
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: '100%',
              top: '50%',
              transform: 'translateY(-50%)',
              marginLeft: 8,
              width: 220,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              padding: 10,
              borderRadius: 8,
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              boxShadow: '0 8px 22px rgba(0,0,0,0.14)'
            }}
          >
            {(bgmTitle || isTitleLoading) && (
              <div
                style={{
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  borderRadius: 6,
                  background: 'var(--color-primary-light)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-primary-dark)',
                  fontSize: 12,
                  fontWeight: 700,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <span
                  className="bgm-marquee-text"
                  style={{ paddingLeft: '100%' }}
                >
                  {isTitleLoading ? '제목을 불러오는 중...' : bgmTitle}
                </span>
              </div>
            )}
            {(bgmTitle || isTitleLoading) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 999,
                    overflow: 'hidden',
                    background: 'color-mix(in srgb, var(--color-border) 42%, transparent)'
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: 'var(--color-primary)',
                      transition: 'width 0.45s linear'
                    }}
                  />
                </div>
                <button
                  onClick={() => setPlaybackMode(prev => prev === 'repeat-one' ? 'recent-list' : 'repeat-one')}
                  title={playbackMode === 'repeat-one' ? '한 곡 반복' : '목록 전체 반복'}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid var(--color-primary)',
                    background: 'var(--color-primary-light)',
                    color: 'var(--color-primary-dark)',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  {playbackMode === 'repeat-one' ? ICONS.repeatOne : ICONS.repeatAll}
                </button>
              </div>
            )}
            <input
              type="text"
              placeholder="유튜브 링크를 넣고 Enter"
              value={bgmUrl}
              onChange={(e) => setBgmUrl(e.target.value)}
              onKeyDown={handleBgmSubmit}
              autoFocus
              style={{
                fontSize: 12,
                padding: '6px 8px',
                borderRadius: 6,
                width: '100%',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 24 }}>0</span>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--color-primary)' }}
                title="볼륨"
              />
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 28, textAlign: 'right' }}>{volume}</span>
            </div>

            {recentBgms.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
                {recentBgms.map(track => (
                  <div
                    key={track.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 22px',
                      alignItems: 'center',
                      gap: 4,
                      width: '100%',
                      border: '1px solid transparent',
                      background: track.id === bgmId ? 'var(--color-primary-light)' : 'transparent',
                      borderRadius: 6,
                      padding: '2px 3px 2px 6px',
                    }}
                  >
                    <button
                      onClick={() => handleRecentBgmClick(track)}
                      title={track.title}
                      style={{
                        minWidth: 0,
                        border: 0,
                        background: 'transparent',
                        color: track.id === bgmId ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
                        padding: '3px 0',
                        fontSize: 11,
                        fontWeight: 600,
                        textAlign: 'left',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {track.title}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecentBgm(track.id)
                      }}
                      title="최근 목록에서 삭제"
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: 14,
                        height: 14,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-sidebar)',
                        color: 'var(--color-primary-dark)',
                        cursor: 'pointer',
                        fontSize: 10,
                        fontWeight: 'bold',
                        lineHeight: 1,
                        paddingTop: 2,
                        flexShrink: 0
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(bgmId || bgmUrl || recentBgms.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {(bgmId || bgmUrl) && (
                  <button
                    onClick={clearBgm}
                    style={{
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      color: 'var(--color-text-muted)',
                      borderRadius: 6,
                      padding: '5px 6px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    BGM 지우기
                  </button>
                )}
                {recentBgms.length > 0 && (
                  <button
                    onClick={clearRecentBgms}
                    style={{
                      border: '1px solid var(--color-border)',
                      background: 'transparent',
                      color: 'var(--color-text-muted)',
                      borderRadius: 6,
                      padding: '5px 6px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    목록 지우기
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        ref={ytPlayerHostRef}
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none'
        }}
      />

      {/* 컬러 피커 버튼 */}
      <div className="relative flex items-center justify-center mb-1" style={{ width: '100%', zIndex: 18 }}>
        <button
          data-color-picker-button="true"
          onClick={handleColorPick}
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-all"
          style={{
            background: pickedColor ? 'var(--color-primary)' : isColorPicking ? 'var(--color-primary-light)' : 'transparent',
            color: pickedColor ? '#fff' : isColorPicking ? 'var(--color-primary-dark)' : 'var(--color-text-muted)',
            opacity: isColorPicking ? 0.65 : 1,
            cursor: isColorPicking ? 'crosshair' : 'pointer'
          }}
          title={isColorPicking ? '앱 안에서 색상을 클릭하세요' : '앱 내부 색상 추출'}
        >
          {pickedColor ? ICONS.check : ICONS.colorPicker}
        </button>

        {(pickedColor || isColorPicking) && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: '50%',
              transform: 'translateY(-50%)',
              marginLeft: 8,
              padding: '6px 9px',
              borderRadius: 8,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              boxShadow: '0 8px 22px rgba(0,0,0,0.12)',
              color: 'var(--color-primary-dark)',
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              pointerEvents: 'none'
            }}
          >
            {pickedColor ? `${pickedColor} 복사!` : '색상 클릭'}
          </div>
        )}
      </div>

      {colorMagnifierOverlay}

      <div className="flex-1" style={{ width: '100%', cursor: 'move' }} onMouseDown={startDrag} />

      {/* 수동 저장 버튼 (설정 버튼 위) */}
      <button
        onClick={onSave}
        className="w-11 h-11 rounded-xl flex items-center justify-center transition-all mb-1"
        style={{ background: 'transparent', color: 'var(--color-text-muted)' }}
        title="저장"
      >
        {ICONS.save}
      </button>

      <button
        onClick={onThemeToggle}
        className="w-11 h-11 rounded-xl flex items-center justify-center transition-all mb-4"
        style={{
          background: themeOpen ? 'var(--color-primary)' : 'transparent',
          color: themeOpen ? '#fff' : 'var(--color-text-muted)'
        }}
        title="설정"
      >
        {ICONS.settings}
      </button>
    </aside>
  )
}
