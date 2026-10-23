import { useEffect, useRef, useState } from 'react'
import { isPresentation, useBoardState } from './sync'

interface Playback { time: number; paused: boolean; rate: number; at: number }
const INITIAL: Playback = { time: 0, paused: true, rate: 1, at: 0 }
function playbackTime(state: Playback) {
  return state.time + (state.paused ? 0 : Math.max(0, Math.min(2, (Date.now() - state.at) / 1000)) * state.rate)
}

// The editing player owns playback and audio. The audience player is always muted
// so both windows can show the same video without doubled audio.
export default function PresentationVideo({ id, src, embed, interactive }: { id: string; src: string; embed: boolean; interactive: boolean }) {
  const [state, setState] = useBoardState<Playback>(`video:${id}`, INITIAL)
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const observed = useRef<Playback>({ ...INITIAL })
  const latest = useRef(state)
  latest.current = state
  const [ready, setReady] = useState(0)
  const [error, setError] = useState('')
  const isVimeo = src.startsWith('https://player.vimeo.com/')
  const frameSrc = embed && src ? `${src}${src.includes('?') ? '&' : '?'}${isVimeo ? `muted=${isPresentation ? 1 : 0}&autopause=0` : `mirror=${isPresentation ? 1 : 0}`}` : src

  const readLocal = () => {
    const video = videoRef.current
    if (isPresentation || !video) return
    setState({ time: video.currentTime, paused: video.paused || video.ended, rate: video.playbackRate, at: Date.now() })
  }
  useEffect(() => {
    if (!embed || !src) return
    const origin = new URL(src).origin
    const post = (method: string, value?: unknown) => frameRef.current?.contentWindow?.postMessage({ method, value }, origin)
    const local = { ...INITIAL }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== origin) return
      let data = event.data
      if (typeof data === 'string') { try { data = JSON.parse(data) } catch { return } }
      if (!data || typeof data !== 'object') return
      if (data.type === 'pandecki-video-ready' || data.event === 'ready') { setReady(n => n + 1); return }
      if (data.type === 'pandecki-video-error' || data.event === 'error') { setError('영상을 불러오지 못했습니다.'); return }
      if (isPresentation) {
        if (isVimeo && data.method === 'getCurrentTime' && Number.isFinite(data.value)) observed.current = { ...observed.current, time: data.value, at: Date.now() }
        if (isVimeo && data.method === 'getPaused') observed.current.paused = !!data.value
        return
      }
      if (data.type === 'pandecki-video-state') {
        if (Number.isFinite(data.time) && Number.isFinite(data.rate)) setState({ time: data.time, paused: !!data.paused, rate: data.rate, at: Date.now() })
      } else if (isVimeo) {
        if (data.method === 'getCurrentTime' && Number.isFinite(data.value)) local.time = data.value
        else if (data.method === 'getPaused') local.paused = !!data.value
        else if (data.method === 'getPlaybackRate' && Number.isFinite(data.value)) local.rate = data.value
        else return
        setState({ ...local, at: Date.now() })
      }
    }
    window.addEventListener('message', onMessage)
    const poll = () => {
      if (isVimeo) { post('getPaused'); post('getCurrentTime'); if (!isPresentation) post('getPlaybackRate') }
    }
    const timer = setInterval(poll, 500)
    poll()
    return () => { clearInterval(timer); window.removeEventListener('message', onMessage) }
  }, [src, embed, isVimeo])

  useEffect(() => {
    if (!isPresentation) return
    const sync = () => {
      const target = latest.current
      if (embed) {
        if (!src) return
        const frame = frameRef.current?.contentWindow
        const origin = new URL(src).origin
        if (isVimeo) {
          frame?.postMessage({ method: 'setVolume', value: 0 }, origin)
          if (Math.abs(playbackTime(observed.current) - playbackTime(target)) > 0.75) frame?.postMessage({ method: 'setCurrentTime', value: playbackTime(target) }, origin)
          frame?.postMessage({ method: 'setPlaybackRate', value: target.rate }, origin)
          frame?.postMessage({ method: target.paused ? 'pause' : 'play' }, origin)
        } else frame?.postMessage({ type: 'pandecki-video-sync', ...target, time: playbackTime(target) }, origin)
        return
      }
      const video = videoRef.current
      if (!video || video.readyState < 1) return
      video.muted = true
      video.playbackRate = target.rate
      const time = playbackTime(target)
      if (Math.abs(video.currentTime - time) > 0.5) video.currentTime = time
      if (target.paused) video.pause()
      else if (video.paused) void video.play().then(() => setError('')).catch(() => setError('발표 화면에서 영상을 재생하지 못했습니다.'))
    }
    sync()
  }, [state, ready, src, embed, isVimeo])

  const style = { width: '100%', height: '100%', border: 'none', objectFit: 'contain' as const, pointerEvents: interactive && !isPresentation ? 'auto' as const : 'none' as const }
  return <>
    {embed ? <iframe ref={frameRef} src={frameSrc} style={style} title="판 동영상" onLoad={() => setReady(n => n + 1)} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
      : <video ref={videoRef} src={src} style={style} controls={!isPresentation} playsInline muted={isPresentation}
          onLoadedMetadata={() => { setReady(n => n + 1); readLocal() }} onPlay={readLocal} onPause={readLocal} onSeeked={readLocal} onRateChange={readLocal} onTimeUpdate={readLocal} onEnded={readLocal} />}
    {error && <span style={{ position: 'absolute', bottom: 4, left: 4, color: 'white', background: '#000a', fontSize: 12 }}>{error}</span>}
  </>
}
