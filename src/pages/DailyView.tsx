import React, { useEffect, useState, useCallback, useRef } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import QRCode from 'qrcode'
import { api } from '../api'
import { toLocalDate } from '../store/diary'
import StickerPicker from '../components/StickerPicker'
import CropModal, { CustomShape } from '../components/CropModal'
import RandomStudentPicker from '../components/RandomStudentPicker'
import GroupMaker from '../components/GroupMaker'
import type { StudentList } from './StudentLists'
import ReactMarkdown from 'react-markdown'
import { toPng } from 'html-to-image'

const IS_WINDOWS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)

interface Props {
  currentDate: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  boardKey?: string
  boardTitle?: string
  systemFonts: string[]
  globalFont: string
  diaryName: string
  studentLists: StudentList[]
}

export interface CanvasEl {
  id: string
  type: 'text' | 'sticker' | 'photo' | 'video' | 'markdown' | 'analogClock' | 'digitalClock' | 'qr'
  videoType?: 'embed' | 'local'
  x: number; y: number; w: number; h: number; z: number
  rotation: number
  opacity: number
  content: string
  fontSize: number; color: string; bold: boolean; italic: boolean
  underline?: boolean; strikethrough?: boolean
  letterSpacing?: number
  lineHeight?: number
  scaleX?: number
  textPadding?: number
  fontFamily: string
  bgColor: string; bgOpacity: number
  align: 'left' | 'center' | 'right'
  alignV: 'top' | 'middle' | 'bottom'
  clipShape: string
  photoRadius: number
  borderWidth: number
  borderColor: string
  textRadius: number
  linkUrl?: string
  groupId?: string
  locked?: boolean
  flipH?: boolean
  flipV?: boolean
  clockFaceColor?: string    // 눈금/숫자/테두리
  clockHandColor?: string    // 시침/분침 + 중앙 원
  clockSecondColor?: string  // 초침
  clockBgColor?: string      // 배경 ('transparent' = 없음)
  qrUrl?: string
  qrTitle?: string
}

export interface DailyData {
  elements: CanvasEl[]
  bg: string
  bgImage?: string
  bgImageScale?: number
  bgImageRotation?: number  // 0 | 90 | 180 | 270
  bgImageFit?: 'center' | 'cover'
}

interface DragOp      { kind: 'drag';      id: string; sx: number; sy: number; ox: number; oy: number; cx: number; cy: number }
interface ResizeOp    { kind: 'resize';    id: string; sx: number; sy: number; ow: number; oh: number; rot: number; cw: number; ch: number; lockAspect: boolean }
interface RotateOp    { kind: 'rotate';    id: string; ecx: number; ecy: number; sa: number; or: number; cr: number }
interface MultiDragOp    { kind: 'multidrag';    ids: string[]; sx: number; sy: number; origPositions: Record<string, {x: number; y: number}>; dx: number; dy: number }
interface MarqueeOp      { kind: 'marquee';      canvasLeft: number; canvasTop: number; scale: number; x1: number; y1: number; x2: number; y2: number }
interface MultiResizeOp  { kind: 'multiresize';  ids: string[]; sx: number; sy: number; bx: number; by: number; bw: number; bh: number; orig: Record<string, {x: number; y: number; w: number; h: number}> }
type ActiveOp = DragOp | ResizeOp | RotateOp | MultiDragOp | MarqueeOp | MultiResizeOp

const DEFAULT_DATA: DailyData = { elements: [], bg: '#FFF8F0' }
const fontDataUrlCache = new Map<string, string | null>()

const BG_COLORS = ['#FFF8F0','#FDE8F0','#E8F4E8','#E8F0FF','#FFF4E8','#F0F8FF','#FFFFFF','#F5F5F5']

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || hex === 'transparent') return 'transparent'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha / 100})`
}

function getPhotoClipStyle(shape: string, customShapes: CustomShape[]): React.CSSProperties {
  if (shape === 'circle')  return { clipPath: 'circle(50%)' }
  if (shape === 'diamond') return { clipPath: 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' }
  if (shape === 'hexagon') return { clipPath: 'polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)' }
  if (shape === 'heart')   return { clipPath: 'url(#clip-heart)' }
  if (shape === 'star')    return { clipPath: 'url(#clip-star)' }
  const custom = customShapes.find(c => c.id === shape)
  if (custom?.points) {
    const pts = custom.points.split(' ').map(p => {
      const [x, y] = p.split(',').map(Number)
      return `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`
    }).join(', ')
    return { clipPath: `polygon(${pts})` }
  }
  if (custom?.maskSrc) return { WebkitMaskImage: `url(${custom.maskSrc})`, WebkitMaskSize: '100% 100%' } as React.CSSProperties
  return {}
}

function getVideoEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0&playsinline=1`
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?playsinline=1`
  return null
}

// YouTube는 asset:// 오리진을 거부하므로 로컬 HTTP 프록시를 통해 embed
// (Vimeo는 정상 작동하므로 직접 embed 유지)
function getVideoRenderUrl(url: string, youtubePort: number): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (yt) {
    if (youtubePort > 0) return `http://localhost:${youtubePort}/?v=${yt[1]}`
    return `https://www.youtube.com/embed/${yt[1]}?rel=0&playsinline=1`
  }
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?playsinline=1`
  return null
}

function isVideoUrl(url: string): boolean {
  return getVideoEmbedUrl(url) !== null
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

function AnalogClock({ time, el }: { time: Date; el: CanvasEl }): JSX.Element {
  const seconds = time.getSeconds()
  const minutes = time.getMinutes()
  const hours = time.getHours() % 12
  const secondDeg = seconds * 6
  const minuteDeg = (minutes + seconds / 60) * 6
  const hourDeg = (hours + minutes / 60) * 30
  const marks = Array.from({ length: 60 }, (_, i) => i)
  const nums = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1
    const a = (n / 12) * Math.PI * 2 - Math.PI / 2
    return { n, x: 50 + 38 * Math.cos(a), y: 50 + 38 * Math.sin(a) }
  })

  const faceC = el.clockFaceColor ?? '#ffffff'
  const handC = el.clockHandColor ?? '#ffffff'
  const secC  = el.clockSecondColor ?? '#ef4444'
  const bgC   = el.clockBgColor ?? 'transparent'

  return (
    <div className="clock-widget analog-clock-widget">
      <div className="analog-clock-face" style={{ borderColor: hexToRgba(faceC, 88), background: bgC }}>
        {marks.map(i => (
          <span key={i} className={`analog-clock-mark${i % 5 === 0 ? ' major' : ''}`}
            style={{ transform: `rotate(${i * 6}deg)`, background: hexToRgba(faceC, i % 5 === 0 ? 75 : 45) }} />
        ))}
        {nums.map(({ n, x, y }) => (
          <span key={n} className="analog-clock-number"
            style={{ left: `${x}%`, top: `${y}%`, color: hexToRgba(faceC, 92) }}>{n}</span>
        ))}
        <span className="analog-clock-hand hour"
          style={{ transform: `translateX(-50%) rotate(${hourDeg}deg)`, background: handC }} />
        <span className="analog-clock-hand minute"
          style={{ transform: `translateX(-50%) rotate(${minuteDeg}deg)`, background: handC }} />
        <span className="analog-clock-hand second"
          style={{ transform: `translateX(-50%) rotate(${secondDeg}deg)`, background: secC }} />
        <span className="analog-clock-center" style={{ background: handC }} />
      </div>
    </div>
  )
}

function DigitalClock({ time }: { time: Date }): JSX.Element {
  const h = time.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return (
    <div className="clock-widget digital-clock-widget">
      <div className="digital-clock-body">
        <span className="digital-clock-hm">{pad2(h12)}:{pad2(time.getMinutes())}</span>
        <div className="digital-clock-side">
          <span className="digital-clock-ampm">{ampm}</span>
          <span className="digital-clock-s">{pad2(time.getSeconds())}</span>
        </div>
      </div>
    </div>
  )
}

function makeEl(type: CanvasEl['type'], x: number, y: number, content: string, maxZ: number): CanvasEl {
  const base: CanvasEl = {
    id: crypto.randomUUID(), type, x, y, z: maxZ + 1, rotation: 0, opacity: 100,
    content, fontSize: 16, color: '#4A3F3F', bold: false, italic: false,
    fontFamily: "'Noto Sans KR', sans-serif", bgColor: '#ffffff', bgOpacity: 0,
    align: 'left', alignV: 'top', clipShape: 'none', photoRadius: 0, w: 200, h: 100,
    borderWidth: 0, borderColor: '#333333', textRadius: 0,
  }
  if (type === 'sticker') return { ...base, w: 80, h: 80 }
  if (type === 'photo')   return { ...base, w: 180, h: 180 }
  if (type === 'video')    return { ...base, w: 480, h: 270 }
  if (type === 'markdown') return { ...base, w: 280, h: 160, bgOpacity: 80 }
  if (type === 'analogClock') return { ...base, w: 210, h: 210, content: 'analog-clock', bgColor: '#ffffff', bgOpacity: 100, textRadius: 18 }
  if (type === 'digitalClock') return { ...base, w: 260, h: 92, content: 'digital-clock', bgColor: '#ffffff', bgOpacity: 100, textRadius: 18 }
  if (type === 'qr') return { ...base, w: 240, h: 240 }
  return base
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!src) { reject(new Error('no src')); return }
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load failed'))
    img.src = src
  })
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function photoRadiusPx(w: number, h: number, radius = 0): number {
  const pct = Math.max(0, Math.min(50, radius))
  return Math.round(Math.min(w, h) * pct / 100)
}

function primaryFontFamily(fontFamily: string): string {
  return fontFamily.split(',')[0]?.replace(/^['"]|['"]$/g, '').trim() || 'sans-serif'
}

function canvasTextFont(el: CanvasEl): string {
  const primary = primaryFontFamily(el.fontFamily)
  const fallback = el.fontFamily.includes(',') ? `,${el.fontFamily.split(',').slice(1).join(',')}` : ', sans-serif'
  return `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${el.fontSize}px "${primary}"${fallback}`
}

function cssEscapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function ensureEmbeddedFontFaces(elements: CanvasEl[]): Promise<HTMLStyleElement | null> {
  const names = Array.from(new Set(
    elements
      .filter(el => el.type === 'text')
      .map(el => primaryFontFamily(el.fontFamily))
      .filter(Boolean)
  ))
  if (names.length === 0) return null
  const entries = await Promise.all(names.map(async name => {
    if (!fontDataUrlCache.has(name)) {
      const dataUrl = await api.fonts.dataUrl(name).catch(() => null)
      fontDataUrlCache.set(name, dataUrl)
    }
    return [name, fontDataUrlCache.get(name)] as const
  }))
  const style = document.createElement('style')
  style.textContent = entries.map(([name, dataUrl]) => {
    const safe = cssEscapeString(name)
    const src = dataUrl ? `url("${dataUrl}")` : `local("${safe}")`
    return `@font-face{font-family:"${safe}";src:${src};font-display:block;}`
  }).join('\n')
  document.head.appendChild(style)
  return style
}

async function ensureCanvasFonts(elements: CanvasEl[]) {
  const fonts = 'fonts' in document ? document.fonts : undefined
  const textEls = elements.filter(el => el.type === 'text')
  const preloadEls = textEls.map(el => {
    const div = document.createElement('div')
    div.style.cssText = `font-family:${el.fontFamily};font-size:${Math.max(72, el.fontSize)}px;font-weight:${el.bold ? 'bold' : 'normal'};font-style:${el.italic ? 'italic' : 'normal'};position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-9999;`
    div.textContent = `${el.content || '가나다라마바사ABCDEFGabcdefg0123456789'}`
    document.body.appendChild(div)
    void div.offsetWidth
    return div
  })
  if (fonts) {
    await Promise.all(textEls.map(el => fonts.load(canvasTextFont(el)).catch(() => [])))
    await fonts.ready
  }
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50))))
  preloadEls.forEach(el => { try { document.body.removeChild(el) } catch {} })
}

async function renderTextElementPng(el: CanvasEl): Promise<string> {
  const pad = el.textPadding ?? 6
  const bw = el.borderWidth ?? 0
  const textRad = el.textRadius ?? 0
  const justifyV = el.alignV === 'middle' ? 'center' : el.alignV === 'bottom' ? 'flex-end' : 'flex-start'
  const box = document.createElement('div')
  box.style.cssText = [
    `position:fixed`,
    `left:0`,
    `top:0`,
    `width:${el.w}px`,
    `height:${el.h}px`,
    `display:flex`,
    `flex-direction:column`,
    `justify-content:${justifyV}`,
    `background:${hexToRgba(el.bgColor, el.bgOpacity)}`,
    `padding:${pad}px`,
    `border-radius:${textRad}px`,
    `border:${bw > 0 ? `${bw}px solid ${el.borderColor ?? '#333333'}` : 'none'}`,
    `box-sizing:border-box`,
    `overflow:hidden`,
    `pointer-events:none`,
    `z-index:-1`,
  ].join(';')

  const text = document.createElement('div')
  text.textContent = el.content
  text.style.cssText = [
    `font-size:${el.fontSize}px`,
    `color:${el.color}`,
    `font-weight:${el.bold ? 'bold' : 'normal'}`,
    `font-style:${el.italic ? 'italic' : 'normal'}`,
    `text-decoration:${[el.underline && 'underline', el.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none'}`,
    `letter-spacing:${el.letterSpacing ?? 0}px`,
    `line-height:${el.lineHeight ?? 1.4}`,
    `font-family:${el.fontFamily}`,
    `text-align:${el.align}`,
    `white-space:pre-wrap`,
    `word-break:break-word`,
    `transform:${(el.scaleX ?? 100) !== 100 ? `scaleX(${(el.scaleX ?? 100) / 100})` : 'none'}`,
    `transform-origin:${el.align === 'center' ? 'center top' : el.align === 'right' ? 'right top' : 'left top'}`,
  ].join(';')

  box.appendChild(text)
  document.body.appendChild(box)
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return await toPng(box, { pixelRatio: 2 })
  } finally {
    try { document.body.removeChild(box) } catch {}
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur)
      cur = word
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const trimmed = lines.slice(0, maxLines)
    let last = trimmed[maxLines - 1]
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1)
    trimmed[maxLines - 1] = last + '…'
    return trimmed
  }
  return lines
}

async function drawTweetCard(cardData: Record<string, string>, w: number): Promise<{dataUrl: string; h: number}> {
  const dpr = 2
  const pad = Math.round(w * 0.05)
  const avatarSize = Math.round(w * 0.11)
  const fs = Math.max(10, Math.min(14, Math.round(w / 22)))
  const topPad = Math.round(w * 0.04)
  const lineH = Math.round(fs * 1.55)
  const maxTextW = w - pad * 2
  const hasMedia = !!cardData.mediaImageUrl
  const mediaH = hasMedia ? Math.round(w * 0.57) : 0
  const footerH = 28
  const gapS = 8
  const gapM = 12

  // 텍스트 줄 수 먼저 측정 (높이 계산용)
  const mc = document.createElement('canvas').getContext('2d')!
  mc.font = `${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  const textLines = wrapText(mc, cardData.tweetText ?? '', maxTextW, hasMedia ? 6 : 10)
  const textH = textLines.length * lineH

  // 콘텐츠에 맞게 높이 동적 계산
  const h = topPad + avatarSize + gapM + textH + gapS + (hasMedia ? mediaH + gapS : 0) + footerH + gapS

  const canvas = document.createElement('canvas')
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  // Background
  ctx.fillStyle = '#ffffff'
  rrect(ctx, 0, 0, w, h, 16)
  ctx.fill()

  // Border
  ctx.strokeStyle = '#e1e8ed'
  ctx.lineWidth = 1
  rrect(ctx, 0.5, 0.5, w - 1, h - 1, 16)
  ctx.stroke()

  let y = topPad

  // Avatar circle
  ctx.save()
  ctx.beginPath()
  ctx.arc(pad + avatarSize / 2, y + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
  ctx.clip()
  if (cardData.profileImageUrl) {
    try {
      ctx.drawImage(await loadImg(cardData.profileImageUrl), pad, y, avatarSize, avatarSize)
    } catch { ctx.fillStyle = '#1D9BF0'; ctx.fill() }
  } else {
    ctx.fillStyle = '#1D9BF0'; ctx.fill()
  }
  ctx.restore()

  // Author name
  const nameX = pad + avatarSize + 8
  ctx.fillStyle = '#0f1419'
  ctx.font = `bold ${fs + 1}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(cardData.authorName ?? '', nameX, y + 2)

  // Handle
  ctx.fillStyle = '#536471'
  ctx.font = `${fs - 1}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.fillText(cardData.authorHandle ?? '', nameX, y + fs + 7)

  // 𝕏 logo
  ctx.fillStyle = '#0f1419'
  ctx.font = `bold ${Math.round(w * 0.065)}px -apple-system, sans-serif`
  ctx.textAlign = 'right'
  ctx.fillText('𝕏', w - pad, y + 2)

  y += avatarSize + gapM

  // Tweet text (사전 계산한 줄 그대로 사용)
  ctx.fillStyle = '#0f1419'
  ctx.font = `${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  for (const line of textLines) {
    ctx.fillText(line, pad, y); y += lineH
  }
  y += gapS

  // Media image
  if (hasMedia && cardData.mediaImageUrl) {
    const mediaY = y
    try {
      const img = await loadImg(cardData.mediaImageUrl)
      const mw = w - pad * 2
      ctx.save()
      rrect(ctx, pad, mediaY, mw, mediaH, 10)
      ctx.clip()
      const sr = img.naturalWidth / img.naturalHeight
      const dr = mw / mediaH
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
      if (sr > dr) { sw = img.naturalHeight * dr; sx = (img.naturalWidth - sw) / 2 }
      else { sh = img.naturalWidth / dr; sy = (img.naturalHeight - sh) / 2 }
      ctx.drawImage(img, sx, sy, sw, sh, pad, mediaY, mw, mediaH)
      ctx.restore()
    } catch {}
    y += mediaH + gapS
  }

  // Footer separator
  const footerY = y
  ctx.strokeStyle = '#eff3f4'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad, footerY); ctx.lineTo(w - pad, footerY)
  ctx.stroke()

  // Date
  ctx.fillStyle = '#536471'
  ctx.font = `${fs - 2}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(cardData.date ?? '', pad, footerY + footerH / 2)

  return { dataUrl: canvas.toDataURL('image/png'), h }
}

function TweetCard({ data, w, h }: { data: Record<string, string>; w: number; h: number }) {
  const [avatarError, setAvatarError] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const fontSize = Math.max(10, Math.min(14, w / 22))
  const avatarSize = Math.round(w * 0.11)
  const pad = Math.round(w * 0.05)

  const avatarSrc = data.profileImageUrl || `https://unavatar.io/twitter/${(data.authorHandle ?? '').replace('@', '')}`

  return (
    <div style={{
      width: '100%', height: '100%', boxSizing: 'border-box',
      background: '#fff', borderRadius: 16, border: '1px solid #e1e8ed',
      padding: `${Math.round(w * 0.04)}px ${pad}px`,
      display: 'flex', flexDirection: 'column', gap: Math.round(h * 0.03),
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ width: avatarSize, height: avatarSize, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: '#1D9BF0' }}>
          {!avatarError ? (
            <img src={avatarSrc} onError={() => setAvatarError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: Math.round(avatarSize * 0.42) }}>
              {(data.authorName?.[0] ?? 'X').toUpperCase()}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: fontSize + 1, fontWeight: 700, color: '#0f1419', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.authorName}</div>
          <div style={{ fontSize: fontSize - 1, color: '#536471' }}>{data.authorHandle}</div>
        </div>
        <div style={{ fontSize: Math.round(w * 0.06), color: '#0f1419', fontWeight: 900, flexShrink: 0, lineHeight: 1 }}>𝕏</div>
      </div>

      {/* Tweet text */}
      <div style={{ fontSize, color: '#0f1419', lineHeight: 1.55, overflow: 'hidden', wordBreak: 'break-word', flex: data.mediaImageUrl && !mediaError ? '0 0 auto' : 1 }}>
        {data.tweetText ?? data.text}
      </div>

      {/* 첨부 이미지 */}
      {data.mediaImageUrl && !mediaError && (
        <div style={{ flex: 1, borderRadius: 10, overflow: 'hidden', minHeight: 0, flexShrink: 0 }}>
          <img src={data.mediaImageUrl} onError={() => setMediaError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #eff3f4', paddingTop: Math.round(h * 0.025), display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: fontSize - 2, color: '#536471' }}>{data.date}</span>
        {data.likes && <span style={{ fontSize: fontSize - 2, color: '#536471' }}>♥ {data.likes}</span>}
      </div>
    </div>
  )
}

const FONT_SIZES = [6, 7, 8, 9, 10, 12, 15, 18, 22, 25, 28, 30, 34, 38, 42, 48, 54, 60, 70, 80, 90, 100]

const VALIGN_OPTS: { id: CanvasEl['alignV']; label: string }[] = [
  { id: 'top', label: '⬆' }, { id: 'middle', label: '↕' }, { id: 'bottom', label: '⬇' }
]

const ICONS: Record<string, React.ReactNode> = {
  // 0. 상단 바
  bgFill:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8L3 3 M3 3h4 M3 3v4 M16 16l5 5 M21 21h-4 M21 21v-4"/></svg>,
  bgOriginal: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M3 7V3h4 M17 3h4v4 M3 17v4h4 M21 17v4h-4"/></svg>,
  undo:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>,
  redo:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg>,
  rotate90: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><rect x="10" y="10" width="12" height="12" rx="2.5"/><path d="M 3.5 12 C 3.5 4 8 4 13 5"/><polyline points="10 2.5 13 5 10 7.5"/></svg>,

  // 1. 레이어 순서 정렬 (프리젠테이션 스타일 - 확대 버전)
  bringFront: <svg width="14" height="14" viewBox="0 0 24 24"><path d="M7 12H2V2h10v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><path d="M12 17H7V7h10v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><rect x="12" y="12" width="10" height="10" fill="currentColor"/></svg>,
  bringForward: <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 16H2V2h14v6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><rect x="8" y="8" width="14" height="14" fill="currentColor"/></svg>,
  sendBackward: <svg width="14" height="14" viewBox="0 0 24 24"><path d="M2 2h14v6H8v8H2z" fill="currentColor"/><rect x="8" y="8" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter"/></svg>,
  sendBack: <svg width="14" height="14" viewBox="0 0 24 24"><path d="M2 2h10v5H7v5H2z" fill="currentColor"/><path d="M12 17H7V7h10v5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="miter"/><rect x="12" y="12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter"/></svg>,

  bold: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>,
  italic: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>,
  underline: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="21" x2="20" y2="21"/></svg>,
  strikethrough: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>,

  // 2. 다중 선택 정렬
  formatPainter: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 4H7a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M12 12v9 M9 21h6"/></svg>,
  alignLeft: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V2M4 6h10M4 12h16M4 18h12"/></svg>,
  alignCenter: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M7 6h10M4 12h16M6 18h12"/></svg>,
  alignRight: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 22V2M10 6h10M4 12h16M8 18h12"/></svg>,
  alignTop: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h20M6 4v10M12 4v16M18 4v12"/></svg>,
  alignMiddle: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20M12 2v20M6 8v8M18 8v8"/></svg>, /* (혹시 몰라 추가해둔 중앙 맞춤 보조) */
  alignBottom: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20M6 20V10M12 20V4M18 20v-8"/></svg>,
  distributeH: <svg width="14" height="14" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V2M20 22V2" stroke="currentColor" strokeWidth="2.5" fill="none"/><rect x="8" y="7" width="3" height="10" rx="0.5" fill="currentColor"/><rect x="13" y="7" width="3" height="10" rx="0.5" fill="currentColor"/></svg>,
  distributeV: <svg width="14" height="14" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h20M2 20h20" stroke="currentColor" strokeWidth="2.5" fill="none"/><rect x="7" y="8" width="10" height="3" rx="0.5" fill="currentColor"/><rect x="7" y="13" width="10" height="3" rx="0.5" fill="currentColor"/></svg>,

  // 3. 텍스트 정렬
  textAlignLeft: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h14"/></svg>,
  textAlignCenter: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M7 12h10M5 18h14"/></svg>,
  textAlignRight: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M10 12h10M6 18h14"/></svg>,
  textBoxTop: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7 8h10"/></svg>,
  textBoxMiddle: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7 12h10"/></svg>,
  textBoxBottom: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7 16h10"/></svg>,

  // 4. 기타 그룹/삭제 기능
  group: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h4v4H4zM16 4h4v4h-4zM16 16h4v4h-4zM4 16h4v4H4zM8 6h8M6 8v8M18 8v8M8 18h8"/></svg>,
  ungroup: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h4v4H4zM16 4h4v4h-4zM16 16h4v4h-4zM4 16h4v4H4zM8 12h8M12 8v8"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
  lock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="11" width="14" height="10" rx="2"/><path d="M9 11V7a4 4 0 018 0v4"/></svg>,
  unlock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="11" width="14" height="10" rx="2"/><path d="M9 11V6A3.5 3.5 0 002 6v2"/></svg>,
  flipH: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M7 5L2 12l5 7zM17 5l5 7-5 7z"/></svg>,
  flipV: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20M5 7l7-5 7 5zM5 17l7 5 7-5z"/></svg>,
}

function InteractiveOverlay({ url, cmdHeld }: { url: string; cmdHeld: boolean }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 5,
        pointerEvents: cmdHeld ? 'auto' : 'none',
        cursor: 'pointer',
      }}
      onClick={e => { if (e.metaKey || e.ctrlKey) { e.stopPropagation(); api.shell.openUrl(url) } }}
    />
  )
}

export default function DailyView({ currentDate, onPrev, onNext, onToday, boardKey, boardTitle, systemFonts, globalFont, diaryName, studentLists }: Props): JSX.Element {
  const dateStr = boardKey ?? toLocalDate(currentDate)
  const [data, setData] = useState<DailyData>(DEFAULT_DATA)
  const [saved, setSaved] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [multiIds, setMultiIds] = useState<string[]>([])
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showStickers, setShowStickers] = useState(false)
  const [showVideoMenu, setShowVideoMenu] = useState(false)
  const [showClockMenu, setShowClockMenu] = useState(false)
  const [showQrMenu, setShowQrMenu] = useState(false)
  const [qrInput, setQrInput] = useState('')
  const [qrTitleInput, setQrTitleInput] = useState('')
  const [qrEditId, setQrEditId] = useState<string | null>(null)
  const [qrEditUrl, setQrEditUrl] = useState('')
  const [qrEditTitle, setQrEditTitle] = useState('')
  const [showBackgroundMenu, setShowBackgroundMenu] = useState(false)
  const [showRandomPicker, setShowRandomPicker] = useState(false)
  const [randomPickerSelected, setRandomPickerSelected] = useState(false)
  const [randomPickerPosition, setRandomPickerPosition] = useState({ x: 120, y: 90 })
  const [randomPickerSize, setRandomPickerSize] = useState({ width: 620, height: 380 })
  const [randomPickerZ, setRandomPickerZ] = useState(10000)
  const [pickerInitResult, setPickerInitResult] = useState<import('../components/RandomStudentPicker').PickerResult | undefined>(undefined)
  const [groupInitResult, setGroupInitResult] = useState<import('../components/GroupMaker').GroupResult | undefined>(undefined)
  const [showGroupMaker, setShowGroupMaker] = useState(false)
  const [groupMakerSelected, setGroupMakerSelected] = useState(false)
  const [groupMakerPosition, setGroupMakerPosition] = useState({ x: 160, y: 120 })
  const [groupMakerSize, setGroupMakerSize] = useState({ width: 680, height: 420 })
  const [groupMakerZ, setGroupMakerZ] = useState(10000)
  const [dockVisible, setDockVisible] = useState(true)
  const dockHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showVideoUrlInput, setShowVideoUrlInput] = useState(false)
  const [videoUrlInput, setVideoUrlInput] = useState('')
  const mdTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [cmdHeld, setCmdHeld] = useState(false)
  const [cropTarget, setCropTarget] = useState<string | null>(null)
  const [fontSearch, setFontSearch] = useState('')
  const [showFontList, setShowFontList] = useState(false)
  const [showFontSizeList, setShowFontSizeList] = useState(false)
  const [customShapes, setCustomShapes] = useState<CustomShape[]>([])
  const [tweetMsg, setTweetMsg] = useState<{text: string; type: 'info'|'error'} | null>(null)

  // Background inputs
  const [bgHexInput, setBgHexInput] = useState(DEFAULT_DATA.bg)
  const [bgCustomColors, setBgCustomColors] = useState<string[]>(['', '', ''])

  // Text color / border color / bg color inputs (local drafts to allow partial typing)
  const [textColorInput, setTextColorInput] = useState('')
  const [borderColorInput, setBorderColorInput] = useState('#333333')
  const [bgColorInput, setBgColorInput] = useState('#ffffff')


  const canvasRef        = useRef<HTMLDivElement>(null)
  const dataRef          = useRef(data)
  dataRef.current        = data
  const opRef            = useRef<ActiveOp | null>(null)
  const justMarqueedRef  = useRef(false)
  const elClipboardRef   = useRef<CanvasEl[]>([])
  const persistRef    = useRef<(d: DailyData) => Promise<void>>(() => Promise.resolve())
  const exportRef     = useRef<() => Promise<void>>(() => Promise.resolve())
  const [exportPreview, setExportPreview] = useState<{ dataUrl: string; filename: string } | null>(null)
  const [capturing, setCapturing] = useState<boolean | null>(null)
  const [clockTime, setClockTime] = useState(() => new Date())
  const [youtubePort, setYoutubePort] = useState(0)
  const historyRef    = useRef<DailyData[]>([])
  const historyIdxRef = useRef(-1)

  const dateLabel = boardTitle ?? currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  const showDock = useCallback(() => {
    if (dockHideTimerRef.current) clearTimeout(dockHideTimerRef.current)
    setDockVisible(true)
  }, [])

  const scheduleDockHide = useCallback(() => {
    if (dockHideTimerRef.current) clearTimeout(dockHideTimerRef.current)
    dockHideTimerRef.current = setTimeout(() => {
      if (!showStickers && !showVideoMenu && !showClockMenu && !showQrMenu && !showBackgroundMenu) setDockVisible(false)
    }, 1400)
  }, [showStickers, showVideoMenu, showClockMenu, showQrMenu, showBackgroundMenu])

  useEffect(() => {
    scheduleDockHide()
    return () => {
      if (dockHideTimerRef.current) clearTimeout(dockHideTimerRef.current)
    }
  }, [scheduleDockHide])

  useEffect(() => {
    if (showStickers || showVideoMenu || showClockMenu || showQrMenu || showBackgroundMenu) showDock()
  }, [showStickers, showVideoMenu, showClockMenu, showQrMenu, showBackgroundMenu, showDock])

  useEffect(() => {
    const timer = window.setInterval(() => setClockTime(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    api.video.getYoutubePort().then(setYoutubePort).catch(() => {})
  }, [])

  useEffect(() => {
    historyRef.current = []
    historyIdxRef.current = -1
    api.entry.get(dateStr).then(raw => {
      const d = raw ? { ...DEFAULT_DATA, ...(raw as DailyData) } : DEFAULT_DATA
      setData(d)
      setBgHexInput(d.bg)
      historyRef.current = [JSON.parse(JSON.stringify(d))]
      historyIdxRef.current = 0
    }).catch(() => { setData(DEFAULT_DATA) })
    setSelectedId(null); setMultiIds([]); setEditingId(null)
    // Load widget state for this date
    setPickerInitResult(undefined)
    setGroupInitResult(undefined)
    setShowRandomPicker(false)
    setShowGroupMaker(false)
    api.settings.get(`pickerWidget_${dateStr}`).then(raw => {
      if (!raw) return
      const s = JSON.parse(raw)
      setPickerInitResult(s)
      setShowRandomPicker(true)
      if (s.position) setRandomPickerPosition(s.position)
      if (s.size) setRandomPickerSize(s.size)
      if (s.z) setRandomPickerZ(s.z)
    }).catch(() => {})
    api.settings.get(`groupWidget_${dateStr}`).then(raw => {
      if (!raw) return
      const s = JSON.parse(raw)
      setGroupInitResult(s)
      setShowGroupMaker(true)
      if (s.position) setGroupMakerPosition(s.position)
      if (s.size) setGroupMakerSize(s.size)
      if (s.z) setGroupMakerZ(s.z)
    }).catch(() => {})
  }, [dateStr])

  // Load global settings
  useEffect(() => {
    api.settings.get('customShapes').then(raw => {
      if (raw) try { setCustomShapes(JSON.parse(raw)) } catch {}
    }).catch(() => {})
    api.settings.get('bgCustomColors').then(raw => {
      if (raw) try { setBgCustomColors(JSON.parse(raw)) } catch {}
    }).catch(() => {})
  }, [])

  // Sync text/border/bg color inputs when selection changes
  useEffect(() => {
    const el = data.elements.find(e => e.id === selectedId)
    setTextColorInput(el?.color ?? '#4A3F3F')
    setBorderColorInput(el?.borderColor ?? '#333333')
    setBgColorInput(el?.bgColor ?? '#ffffff')
  }, [selectedId, data.elements])

  const addCustomShape = useCallback((shape: CustomShape) => {
    setCustomShapes(prev => {
      const next = [...prev, shape]
      api.settings.set('customShapes', JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  const persist = useCallback(async (d: DailyData) => {
    const snapshot = JSON.parse(JSON.stringify(d))
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1)
    historyRef.current.push(snapshot)
    if (historyRef.current.length > 50) historyRef.current.shift()
    historyIdxRef.current = historyRef.current.length - 1
    await api.entry.save(dateStr, d).catch(() => {})
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }, [dateStr])
  persistRef.current = persist

  const update = useCallback((patch: Partial<DailyData>) => {
    const next = { ...dataRef.current, ...patch }
    setData(next); persist(next)
  }, [persist])

  const updateEl = useCallback((id: string, patch: Partial<CanvasEl>) => {
    const next = { ...dataRef.current, elements: dataRef.current.elements.map(el => el.id === id ? { ...el, ...patch } : el) }
    setData(next); persist(next)
  }, [persist])

  const deleteSelected = useCallback(() => {
    if (multiIds.length > 1) {
      const ids = new Set(multiIds)
      const next = { ...dataRef.current, elements: dataRef.current.elements.filter(el => !ids.has(el.id) || !!el.locked) }
      setData(next); persist(next); setMultiIds([]); setSelectedId(null)
      return
    }
    if (!selectedId) return
    const target = dataRef.current.elements.find(el => el.id === selectedId)
    if (target?.locked) return
    const next = { ...dataRef.current, elements: dataRef.current.elements.filter(el => el.id !== selectedId) }
    setData(next); persist(next); setSelectedId(null)
  }, [selectedId, multiIds, persist])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current--
    const prev = historyRef.current[historyIdxRef.current]
    setData(prev); setBgHexInput(prev.bg)
    api.entry.save(dateStr, prev).catch(() => {})
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }, [dateStr])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current++
    const next = historyRef.current[historyIdxRef.current]
    setData(next); setBgHexInput(next.bg)
    api.entry.save(dateStr, next).catch(() => {})
    setSaved(true); setTimeout(() => setSaved(false), 1500)
  }, [dateStr])

  const handleAlign = (type: 'left' | 'center' | 'right' | 'dist-x' | 'top' | 'middle' | 'bottom' | 'dist-y') => {
    if (multiIds.length < 2) return
    const selEls = dataRef.current.elements.filter(el => multiIds.includes(el.id))
    const minX = Math.min(...selEls.map(el => el.x))
    const maxX = Math.max(...selEls.map(el => el.x + el.w))
    const minY = Math.min(...selEls.map(el => el.y))
    const maxY = Math.max(...selEls.map(el => el.y + el.h))
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    let nextEls = [...dataRef.current.elements]
    if (type === 'left') {
      nextEls = nextEls.map(el => multiIds.includes(el.id) ? { ...el, x: minX } : el)
    } else if (type === 'right') {
      nextEls = nextEls.map(el => multiIds.includes(el.id) ? { ...el, x: maxX - el.w } : el)
    } else if (type === 'center') {
      nextEls = nextEls.map(el => multiIds.includes(el.id) ? { ...el, x: cx - el.w / 2 } : el)
    } else if (type === 'top') {
      nextEls = nextEls.map(el => multiIds.includes(el.id) ? { ...el, y: minY } : el)
    } else if (type === 'bottom') {
      nextEls = nextEls.map(el => multiIds.includes(el.id) ? { ...el, y: maxY - el.h } : el)
    } else if (type === 'middle') {
      nextEls = nextEls.map(el => multiIds.includes(el.id) ? { ...el, y: cy - el.h / 2 } : el)
    } else if (type === 'dist-x' && selEls.length > 2) {
      const sorted = [...selEls].sort((a, b) => a.x - b.x)
      const first = sorted[0], last = sorted[sorted.length - 1]
      const step = (last.x - first.x) / (sorted.length - 1)
      const newPos = new Map<string, number>(); sorted.forEach((el, i) => newPos.set(el.id, first.x + i * step))
      nextEls = nextEls.map(el => multiIds.includes(el.id) ? { ...el, x: newPos.get(el.id) ?? el.x } : el)
    } else if (type === 'dist-y' && selEls.length > 2) {
      const sorted = [...selEls].sort((a, b) => a.y - b.y)
      const first = sorted[0], last = sorted[sorted.length - 1]
      const step = (last.y - first.y) / (sorted.length - 1)
      const newPos = new Map<string, number>(); sorted.forEach((el, i) => newPos.set(el.id, first.y + i * step))
      nextEls = nextEls.map(el => multiIds.includes(el.id) ? { ...el, y: newPos.get(el.id) ?? el.y } : el)
    }
    const next = { ...dataRef.current, elements: nextEls }
    setData(next); persistRef.current(next)
  }

  const cloneTextFormat = () => {
    const src = dataRef.current.elements.find(el => el.id === selectedId)
    if (!src || src.type !== 'text') return
    const maxZ = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
    const newEl: CanvasEl = {
      id: Date.now().toString(),
      type: 'text',
      x: src.x + 20, y: src.y + 20,
      w: src.w, h: src.h,
      z: maxZ + 1, rotation: 0, opacity: src.opacity,
      content: '텍스트를 입력하세요',
      fontSize: src.fontSize, color: src.color, bold: src.bold, italic: src.italic,
      underline: src.underline, strikethrough: src.strikethrough,
      letterSpacing: src.letterSpacing, lineHeight: src.lineHeight, scaleX: src.scaleX, textPadding: src.textPadding,
      fontFamily: src.fontFamily, bgColor: src.bgColor, bgOpacity: src.bgOpacity,
      align: src.align, alignV: src.alignV, textRadius: src.textRadius,
      borderWidth: src.borderWidth, borderColor: src.borderColor,
      clipShape: 'none', photoRadius: 0,
    }
    const next = { ...dataRef.current, elements: [...dataRef.current.elements, newEl] }
    setData(next)
    persistRef.current(next)
    setSelectedId(newEl.id)
  }

  const buildExportDataUrl = useCallback(async (): Promise<string> => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return ''
    const W = canvasEl.clientWidth
    const H = canvasEl.clientHeight
    const dpr = 2
    const offscreen = document.createElement('canvas')
    offscreen.width = W * dpr; offscreen.height = H * dpr
    const ctx = offscreen.getContext('2d')!
    ctx.scale(dpr, dpr)
    const d = dataRef.current
    const localFontFaces = await ensureEmbeddedFontFaces(d.elements)
    try {
      await ensureCanvasFonts(d.elements)
      ctx.fillStyle = d.bg; ctx.fillRect(0, 0, W, H)
      if (d.bgImage) {
        try {
          const img = await loadImg(d.bgImage)
          const rot = d.bgImageRotation ?? 0
          const userScale = d.bgImageScale ?? 1
          const isCover = d.bgImageFit === 'cover'
          let dw = img.naturalWidth
          let dh = img.naturalHeight
          if (isCover) {
            const is90or270 = rot === 90 || rot === 270
            const targetW = is90or270 ? H : W
            const targetH = is90or270 ? W : H
            const ir = img.naturalWidth / img.naturalHeight
            const tr = targetW / targetH
            if (ir > tr) { dh = targetH; dw = targetH * ir }
            else { dw = targetW; dh = targetW / ir }
          }
          dw *= userScale; dh *= userScale
          ctx.save()
          ctx.translate(W / 2, H / 2)
          ctx.rotate((rot * Math.PI) / 180)
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
          ctx.restore()
        } catch {}
      }
      for (const el of [...d.elements].sort((a, b) => a.z - b.z)) {
      if (el.type === 'video') continue
      ctx.save()
      ctx.globalAlpha = el.opacity / 100
      ctx.translate(el.x + el.w / 2, el.y + el.h / 2)
      ctx.rotate((el.rotation * Math.PI) / 180)
      ctx.scale(el.flipH ? -1 : 1, el.flipV ? -1 : 1)
      ctx.translate(-el.w / 2, -el.h / 2)
      if (el.type === 'text') {
        let renderedByDom = false
        try {
          const textPng = await renderTextElementPng(el)
          const textImg = await loadImg(textPng)
          ctx.drawImage(textImg, 0, 0, el.w, el.h)
          renderedByDom = true
        } catch {}
        if (!renderedByDom) {
        if (el.bgOpacity > 0) {
          ctx.fillStyle = hexToRgba(el.bgColor, el.bgOpacity)
          const rad = el.textRadius ?? 0
          if (rad > 0) { rrect(ctx, 0, 0, el.w, el.h, rad); ctx.fill() }
          else { ctx.fillRect(0, 0, el.w, el.h) }
        }
        const bw = el.borderWidth ?? 0
        if (bw > 0) {
          ctx.strokeStyle = el.borderColor ?? '#333333'; ctx.lineWidth = bw
          const rad = el.textRadius ?? 0
          if (rad > 0) { rrect(ctx, 0, 0, el.w, el.h, rad) }
          else { ctx.beginPath(); ctx.rect(0, 0, el.w, el.h) }
          ctx.stroke()
        }
        const pad = el.textPadding ?? 6, fs = el.fontSize
        const lh = fs * (el.lineHeight ?? 1.4)
        const sx = (el.scaleX ?? 100) / 100
        ctx.font = canvasTextFont(el)
        ;(ctx as any).letterSpacing = `${el.letterSpacing ?? 0}px`
        ctx.fillStyle = el.color; ctx.textBaseline = 'top'
        ctx.textAlign = el.align as CanvasTextAlign
        const textX = el.align === 'left' ? pad : el.align === 'center' ? el.w / 2 : el.w - pad
        if (sx !== 1) ctx.transform(sx, 0, 0, 1, textX * (1 - sx), 0)
        const maxW = el.w - pad * 2
        const effectiveMaxW = maxW / sx
        const allLines: string[] = []
        for (const para of el.content.split('\n')) {
          if (!para) { allLines.push(''); continue }
          const words = para.split(' '); let cur = ''
          for (const word of words) {
            const test = cur ? cur + ' ' + word : word
            if (ctx.measureText(test).width > effectiveMaxW && cur) { allLines.push(cur); cur = word }
            else { cur = test }
          }
          allLines.push(cur)
        }
        const totalH = allLines.length * lh
        const startY = el.alignV === 'top' ? pad : el.alignV === 'middle' ? (el.h - totalH) / 2 : el.h - totalH - pad
        allLines.forEach((line, i) => {
          const y = startY + i * lh
          ctx.fillText(line, textX, y)
          if (el.underline || el.strikethrough) {
            const lw2 = ctx.measureText(line).width
            const lineStartX = el.align === 'left' ? textX : el.align === 'center' ? textX - lw2 / 2 : textX - lw2
            ctx.save()
            ctx.strokeStyle = el.color
            ctx.lineWidth = Math.max(1, fs * 0.06)
            if (el.underline) { ctx.beginPath(); ctx.moveTo(lineStartX, y + fs * 1.08); ctx.lineTo(lineStartX + lw2, y + fs * 1.08); ctx.stroke() }
            if (el.strikethrough) { ctx.beginPath(); ctx.moveTo(lineStartX, y + fs * 0.5); ctx.lineTo(lineStartX + lw2, y + fs * 0.5); ctx.stroke() }
            ctx.restore()
          }
        })
        }
      } else if (el.type === 'sticker' || el.type === 'photo') {
        try {
          const img = await loadImg(el.content)
          ctx.save()
          if (el.type === 'photo') {
            if (el.clipShape === 'circle') {
              ctx.beginPath(); ctx.arc(el.w / 2, el.h / 2, Math.min(el.w, el.h) / 2, 0, Math.PI * 2); ctx.clip()
            } else if (el.clipShape === 'diamond') {
              ctx.beginPath(); ctx.moveTo(el.w/2,0); ctx.lineTo(el.w,el.h/2); ctx.lineTo(el.w/2,el.h); ctx.lineTo(0,el.h/2); ctx.closePath(); ctx.clip()
            } else if (el.clipShape === 'hexagon') {
              const pts: [number,number][] = [[.25,0],[.75,0],[1,.5],[.75,1],[.25,1],[0,.5]]
              ctx.beginPath(); pts.forEach(([x,y],i) => i===0 ? ctx.moveTo(x*el.w,y*el.h) : ctx.lineTo(x*el.w,y*el.h)); ctx.closePath(); ctx.clip()
            } else if (el.clipShape === 'heart') {
              ctx.beginPath()
              ctx.moveTo(el.w*.5,el.h*.3)
              ctx.bezierCurveTo(el.w*.5,el.h*.1,el.w*.75,el.h*.05,el.w*.875,el.h*.2)
              ctx.bezierCurveTo(el.w,el.h*.35,el.w,el.h*.6,el.w*.875,el.h*.75)
              ctx.lineTo(el.w*.5,el.h); ctx.lineTo(el.w*.125,el.h*.75)
              ctx.bezierCurveTo(0,el.h*.6,0,el.h*.35,el.w*.125,el.h*.2)
              ctx.bezierCurveTo(el.w*.25,el.h*.05,el.w*.5,el.h*.1,el.w*.5,el.h*.3)
              ctx.closePath(); ctx.clip()
            } else if (el.clipShape === 'star') {
              const pts: [number,number][] = [[.5,0],[.61,.35],[.98,.35],[.68,.57],[.79,.91],[.5,.70],[.21,.91],[.32,.57],[.02,.35],[.39,.35]]
              ctx.beginPath(); pts.forEach(([x,y],i) => i===0 ? ctx.moveTo(x*el.w,y*el.h) : ctx.lineTo(x*el.w,y*el.h)); ctx.closePath(); ctx.clip()
            } else if (el.clipShape === 'none' && (el.photoRadius ?? 0) > 0) {
              const r = photoRadiusPx(el.w, el.h, el.photoRadius)
              rrect(ctx, 0, 0, el.w, el.h, r); ctx.clip()
            } else if (el.clipShape.startsWith('custom_')) {
              const cs = customShapes.find(c => c.id === el.clipShape)
              if (cs?.points) {
                const cpts = cs.points.split(' ').map(p => { const [x,y] = p.split(',').map(Number); return [x*el.w, y*el.h] as [number,number] })
                ctx.beginPath(); cpts.forEach(([x,y],i) => i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y)); ctx.closePath(); ctx.clip()
              }
            }
          }
          ctx.drawImage(img, 0, 0, el.w, el.h)
          ctx.restore()
        } catch {}
      }
      ctx.restore()
      }
      return offscreen.toDataURL('image/png')
    } finally {
      if (localFontFaces) {
        try { document.head.removeChild(localFontFaces) } catch {}
      }
    }
  }, [customShapes])

  const buildCaptureDataUrl = useCallback(async (): Promise<string> => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return ''
    setCapturing(true)
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const rect = canvasEl.getBoundingClientRect()
    try {
      const b64 = await api.export.captureRegionB64({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })
      return `data:image/png;base64,${b64}`
    } finally {
      setCapturing(null)
    }
  }, [])

  const exportToPNG = useCallback(async () => {
    const dataUrl = await buildCaptureDataUrl().catch(() => buildExportDataUrl())
    if (!dataUrl) return
    const now = new Date()
    const yy  = String(now.getFullYear()).slice(2)
    const mm  = String(now.getMonth() + 1).padStart(2, '0')
    const dd  = String(now.getDate()).padStart(2, '0')
    const hh  = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const safeName = (diaryName || 'PanDeckI').replace(/\s+/g, '_')
    const filename = `${safeName}_${yy}${mm}${dd}_${hh}${min}.png`
    setExportPreview({ dataUrl, filename })
  }, [buildCaptureDataUrl, buildExportDataUrl, diaryName])
  exportRef.current = exportToPNG

  useEffect(() => {
    const onManualSave = () => { persistRef.current(dataRef.current) }
    const onExportPng  = () => { exportRef.current().catch((e: unknown) => console.error('export failed', e)) }
    window.addEventListener('diary-manual-save', onManualSave)
    window.addEventListener('diary-export-png',  onExportPng)
    return () => {
      window.removeEventListener('diary-manual-save', onManualSave)
      window.removeEventListener('diary-export-png',  onExportPng)
    }
  }, [])

  const saveBgCustomColors = (colors: string[]) => {
    api.settings.set('bgCustomColors', JSON.stringify(colors)).catch(() => {})
  }

  const pickBgImage = async () => {
    const url = await api.file.pickImage().catch(() => null)
    if (!url) return
    update({ bgImage: url, bgImageScale: 1, bgImageRotation: 0 })
  }

  const fetchTweet = async (tweetUrl: string) => {
    try {
      const tweetId = tweetUrl.match(/\/status\/(\d+)/)?.[1]

      // Rust 커맨드로 fetch (WKWebView CORS 우회)
      const oembedRaw = await api.http.fetchText(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true&dnt=true`
      )
      const oembed = JSON.parse(oembedRaw) as Record<string, any>

      const parser = new DOMParser()
      const doc = parser.parseFromString(oembed.html as string, 'text/html')
      const blockquote = doc.querySelector('blockquote')
      const p = blockquote?.querySelector('p')

      const tweetText = Array.from(p?.childNodes ?? [])
        .filter(n => {
          if (n.nodeType === 1) {
            const txt = n.textContent ?? ''
            return !txt.startsWith('pic.twitter.com') && !txt.startsWith('pic.x.com')
          }
          return true
        })
        .map(n => n.textContent ?? '')
        .join('')
        .replace(/https?:\/\/t\.co\/\S+/g, '')
        .trim()

      const dateLink = Array.from(blockquote?.querySelectorAll(':scope > a') ?? []).pop()
      const date = dateLink?.textContent?.trim() ?? ''
      const authorHandle = '@' + ((oembed.author_url as string)?.split('/').filter(Boolean).pop() ?? '')

      let profileImageUrl = ''
      let mediaImageUrl = ''

      if (tweetId) {
        try {
          const token = Math.round(Number(tweetId) / 1e15 * Math.PI).toString(36)
          const synRaw = await api.http.fetchText(
            `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`
          )
          const syn = JSON.parse(synRaw) as Record<string, any>
          const rawAvatar = (syn.user?.profile_image_url_https as string ?? '').replace('_normal', '_bigger')
          const mediaList: any[] = syn.mediaDetails ?? syn.entities?.media ?? []
          const firstMedia = mediaList[0]
          const rawMedia = firstMedia?.type === 'photo'
            ? `${firstMedia.media_url_https}?format=jpg&name=medium`
            : (firstMedia?.media_url_https ?? '')
          ;[profileImageUrl, mediaImageUrl] = await Promise.all([
            api.http.fetchImageB64(rawAvatar),
            api.http.fetchImageB64(rawMedia),
          ])
        } catch {}
      }

      if (!profileImageUrl) {
        profileImageUrl = await api.http.fetchImageB64(
          `https://unavatar.io/twitter/${authorHandle.replace('@', '')}`
        ).catch(() => '')
      }

      const cardData = {
        authorName: oembed.author_name as string,
        authorHandle, tweetText, date, url: tweetUrl,
        profileImageUrl, mediaImageUrl,
      }

      const w = 300
      const { dataUrl, h } = await drawTweetCard(cardData, w)

      const c = canvasRef.current
      const cx = c ? Math.max(0, c.clientWidth / 2 - w / 2) : 60
      const cy = c ? Math.max(0, c.clientHeight / 2 - h / 2) : 60
      const mz = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
      const el = { ...makeEl('photo', cx, cy, dataUrl, mz), w, h, linkUrl: tweetUrl }
      const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
      setData(next); persistRef.current(next); setSelectedId(el.id)
      return true
    } catch (e) { console.error('fetchTweet failed', e); return false }
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Backspace' && (selectedId || multiIds.length > 1) && editingId !== selectedId) {
        e.preventDefault(); deleteSelected()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault(); undo()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault(); redo()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'c' && !editingId) {
        const ids = multiIds.length > 1 ? multiIds : (selectedId ? [selectedId] : [])
        if (ids.length === 0) return
        e.preventDefault()
        elClipboardRef.current = dataRef.current.elements.filter(el => ids.includes(el.id))
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
        e.preventDefault()
        const ids = multiIds.length > 1 ? multiIds : []
        if (ids.length < 2) return
        const selEls = dataRef.current.elements.filter(el => ids.includes(el.id))
        const allGrouped = selEls.every(el => el.groupId && el.groupId === selEls[0].groupId)
        if (allGrouped) {
          const next = { ...dataRef.current, elements: dataRef.current.elements.map(el => ids.includes(el.id) ? { ...el, groupId: undefined } : el) }
          setData(next); persistRef.current(next)
        } else {
          const gid = crypto.randomUUID()
          const next = { ...dataRef.current, elements: dataRef.current.elements.map(el => ids.includes(el.id) ? { ...el, groupId: gid } : el) }
          setData(next); persistRef.current(next)
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'v' && !editingId) {
        if (elClipboardRef.current.length === 0) return
        e.preventDefault()
        const mz = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
        let zi = mz + 1
        const pasted = elClipboardRef.current.map(el => ({ ...el, id: crypto.randomUUID(), x: el.x + 20, y: el.y + 20, z: zi++ }))
        const next = { ...dataRef.current, elements: [...dataRef.current.elements, ...pasted] }
        setData(next); persistRef.current(next)
        if (pasted.length === 1) { setSelectedId(pasted[0].id); setMultiIds([]) }
        else { setMultiIds(pasted.map(el => el.id)); setSelectedId(pasted[0].id) }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, multiIds, editingId, deleteSelected, undo, redo])

  // ── Cmd key tracking (영상 재생 모드) ─────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Meta') setCmdHeld(true) }
    const onUp   = (e: KeyboardEvent) => { if (e.key === 'Meta') setCmdHeld(false) }
    const onBlur = () => setCmdHeld(false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // ── Clipboard paste ───────────────────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const items = Array.from(e.clipboardData?.items ?? [])
      const c = canvasRef.current
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            const url = reader.result as string
            const img = new Image()
            img.onload = () => {
              const MAX_DIM = 280
              let w = img.naturalWidth, h = img.naturalHeight
              if (w > MAX_DIM || h > MAX_DIM) {
                if (w >= h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM }
                else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM }
              }
              const cx = c ? Math.max(0, c.clientWidth / 2 - w / 2) : 60
              const cy = c ? Math.max(0, c.clientHeight / 2 - h / 2) : 60
              const mz = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
              const el = { ...makeEl('photo', cx, cy, url, mz), w, h }
              const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
              setData(next); persistRef.current(next); setSelectedId(el.id)
            }
            img.src = url
          }
          reader.readAsDataURL(file)
          return
        }
      }
      for (const item of items) {
        if (item.type === 'text/plain') {
          item.getAsString(async text => {
            const trimmed = text.trim()
            if (!trimmed) return
            // 영상 URL 감지
            if (isVideoUrl(trimmed)) {
              const c = canvasRef.current
              const cx = c ? c.clientWidth / 2 - 240 : 100
              const cy = c ? c.clientHeight / 2 - 135 : 100
              const maxZ = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
              const el: CanvasEl = { ...makeEl('video', cx, cy, trimmed, maxZ), videoType: 'embed' }
              const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
              setData(next); persistRef.current(next); setSelectedId(el.id)
              return
            }
            // Twitter/X 링크 감지
            if (/^https?:\/\/(twitter\.com|x\.com)\/.+\/status\/\d+/.test(trimmed)) {
              await fetchTweet(trimmed)
              return
            }
            const cx = 60, cy = 60
            const maxZ = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
            const el = makeEl('text', cx, cy, trimmed, maxZ)
            const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
            setData(next); persistRef.current(next); setSelectedId(el.id)
          })
          return
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  // ── Window pointer handlers ───────────────────────────────────────────────
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const op = opRef.current
      if (!op) return
      const canvas = canvasRef.current
      const canvasRect = canvas?.getBoundingClientRect()
      const pointerScale = canvas && canvasRect ? canvas.offsetWidth / canvasRect.width : 1

      if (op.kind === 'marquee') {
        op.x2 = (e.clientX - op.canvasLeft) * op.scale
        op.y2 = (e.clientY - op.canvasTop) * op.scale
        setMarqueeRect({
          x: Math.min(op.x1, op.x2),
          y: Math.min(op.y1, op.y2),
          w: Math.abs(op.x2 - op.x1),
          h: Math.abs(op.y2 - op.y1),
        })
        return
      }

      if (op.kind === 'multidrag') {
        op.dx = (e.clientX - op.sx) * pointerScale
        op.dy = (e.clientY - op.sy) * pointerScale
        for (const id of op.ids) {
          const orig = op.origPositions[id]
          if (!orig || !canvas) continue
          const elNode = canvas.querySelector<HTMLElement>(`[data-id="${id}"]`)
          if (!elNode) continue
          const elData = dataRef.current.elements.find(x => x.id === id)
          if (!elData) continue
          const sg = (v: number) => v
          const rot = ((elData.rotation ?? 0) * Math.PI) / 180
          const W = elData.w, H = elData.h
          const bbW = Math.abs(W * Math.cos(rot)) + Math.abs(H * Math.sin(rot))
          const bbH = Math.abs(W * Math.sin(rot)) + Math.abs(H * Math.cos(rot))
          const newX = sg(Math.max(bbW / 2 - W / 2, Math.min(canvas.clientWidth  - W / 2 - bbW / 2, orig.x + op.dx)))
          const newY = sg(Math.max(bbH / 2 - H / 2, Math.min(canvas.clientHeight - H / 2 - bbH / 2, orig.y + op.dy)))
          elNode.style.left = `${newX}px`; elNode.style.top = `${newY}px`
        }
        return
      }

      if (op.kind === 'multiresize') {
        const dx = (e.clientX - op.sx) * pointerScale
        const scale = Math.max(0.1, (op.bw + dx) / op.bw)
        const boxNode = canvas?.querySelector<HTMLElement>('#multi-sel-box')
        if (boxNode) { boxNode.style.width = `${op.bw * scale}px`; boxNode.style.height = `${op.bh * scale}px` }
        for (const id of op.ids) {
          const orig = op.orig[id]
          const elNode = canvas?.querySelector<HTMLElement>(`[data-id="${id}"]`)
          if (elNode && orig) {
            elNode.style.width  = `${orig.w * scale}px`
            elNode.style.height = `${orig.h * scale}px`
            elNode.style.left   = `${op.bx + (orig.x - op.bx) * scale}px`
            elNode.style.top    = `${op.by + (orig.y - op.by) * scale}px`
          }
        }
        return
      }

      const node = canvas?.querySelector<HTMLElement>(`[data-id="${op.id}"]`)

      if (op.kind === 'drag') {
        if (!node || !canvas) return
        const dx = (e.clientX - op.sx) * pointerScale, dy = (e.clientY - op.sy) * pointerScale
        const sg = (v: number) => v
        const elRot = ((dataRef.current.elements.find(el => el.id === op.id)?.rotation ?? 0) * Math.PI) / 180
        const W = node.offsetWidth, H = node.offsetHeight
        const bbW = Math.abs(W * Math.cos(elRot)) + Math.abs(H * Math.sin(elRot))
        const bbH = Math.abs(W * Math.sin(elRot)) + Math.abs(H * Math.cos(elRot))
        const newX = sg(Math.max(bbW / 2 - W / 2, Math.min(canvas.clientWidth  - W / 2 - bbW / 2, op.ox + dx)))
        const newY = sg(Math.max(bbH / 2 - H / 2, Math.min(canvas.clientHeight - H / 2 - bbH / 2, op.oy + dy)))
        node.style.left = `${newX}px`; node.style.top = `${newY}px`
        op.cx = newX; op.cy = newY
      } else if (op.kind === 'resize') {
        const rad = (op.rot * Math.PI) / 180
        const dx = (e.clientX - op.sx) * pointerScale, dy = (e.clientY - op.sy) * pointerScale
        const exDelta = dx * Math.cos(rad) + dy * Math.sin(rad)
        const eyDelta = -dx * Math.sin(rad) + dy * Math.cos(rad)
        if (op.lockAspect) {
          const aspect = op.ow / op.oh
          const scale = Math.max(0.1, ((op.ow + exDelta) / op.ow + (op.oh + eyDelta) / op.oh) / 2)
          const rawCw = op.ow * scale
          const rawCh = rawCw / aspect
          if (rawCh < 40) { op.ch = 40; op.cw = 40 * aspect }
          else { op.cw = Math.max(60, rawCw); op.ch = op.cw / aspect }
        } else {
          op.cw = Math.max(60, op.ow + exDelta)
          op.ch = Math.max(40, op.oh + eyDelta)
        }
        if (node) { node.style.width = `${op.cw}px`; node.style.height = `${op.ch}px` }
      } else if (op.kind === 'rotate') {
        const angle = Math.atan2(e.clientY - op.ecy, e.clientX - op.ecx) * (180 / Math.PI)
        let cr = (op.or + (angle - op.sa) + 360) % 360
        if (e.shiftKey) cr = Math.round(cr / 15) * 15
        op.cr = cr
        if (node) node.style.transform = `rotate(${op.cr}deg)`
      }
    }

    function onUp(_e: PointerEvent) {
      const op = opRef.current
      if (!op) return
      opRef.current = null

      if (op.kind === 'marquee') {
        setMarqueeRect(null)
        const mw = Math.abs(op.x2 - op.x1)
        const mh = Math.abs(op.y2 - op.y1)
        if (mw < 4 && mh < 4) return
        const mx = Math.min(op.x1, op.x2)
        const my = Math.min(op.y1, op.y2)
        const hits = dataRef.current.elements.filter(el => {
          const cx = el.x + el.w / 2, cy = el.y + el.h / 2
          const rad = el.rotation * Math.PI / 180
          const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad))
          const aw = el.w * cos + el.h * sin
          const ah = el.w * sin + el.h * cos
          return cx - aw / 2 < mx + mw && cx + aw / 2 > mx &&
                 cy - ah / 2 < my + mh && cy + ah / 2 > my
        }).map(el => el.id)
        if (hits.length > 0) {
          justMarqueedRef.current = true
          setMultiIds(hits)
          setSelectedId(hits[0])
        }
        return
      }

      let next: DailyData
      if (op.kind === 'drag') {
        next = { ...dataRef.current, elements: dataRef.current.elements.map(el => el.id === op.id ? { ...el, x: op.cx, y: op.cy } : el) }
      } else if (op.kind === 'resize') {
        next = { ...dataRef.current, elements: dataRef.current.elements.map(el => el.id === op.id ? { ...el, w: op.cw, h: op.ch } : el) }
      } else if (op.kind === 'rotate') {
        next = { ...dataRef.current, elements: dataRef.current.elements.map(el => el.id === op.id ? { ...el, rotation: op.cr } : el) }
      } else if (op.kind === 'multiresize') {
        const rect = canvasRef.current?.getBoundingClientRect()
        const pointerScale = canvasRef.current && rect ? canvasRef.current.offsetWidth / rect.width : 1
        const scale = Math.max(0.1, (op.bw + (_e.clientX - op.sx) * pointerScale) / op.bw)
        next = { ...dataRef.current, elements: dataRef.current.elements.map(el => {
          if (!op.ids.includes(el.id)) return el
          const orig = op.orig[el.id]
          return { ...el, w: orig.w * scale, h: orig.h * scale, x: op.bx + (orig.x - op.bx) * scale, y: op.by + (orig.y - op.by) * scale }
        })}
      } else {
        const cv = canvasRef.current
        next = { ...dataRef.current, elements: dataRef.current.elements.map(el => {
          if (!op.ids.includes(el.id)) return el
          const orig = op.origPositions[el.id]
          const newX = cv ? Math.max(0, Math.min(cv.clientWidth - el.w, orig.x + op.dx)) : orig.x + op.dx
          const newY = cv ? Math.max(0, Math.min(cv.clientHeight - el.h, orig.y + op.dy)) : orig.y + op.dy
          return { ...el, x: newX, y: newY }
        })}
      }
      setData(next); persistRef.current(next)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup',   onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [])

  const startMarquee = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (e.metaKey || e.ctrlKey) return
    setSelectedId(null)
    setMultiIds([])
    setRandomPickerSelected(false)
    setGroupMakerSelected(false)
    setShowStickers(false)
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    // screen px → logical CSS px (accounts for appZoom transform on parent)
    const scale = canvas.offsetWidth / rect.width
    const x1 = (e.clientX - rect.left) * scale
    const y1 = (e.clientY - rect.top) * scale
    opRef.current = { kind: 'marquee', canvasLeft: rect.left, canvasTop: rect.top, scale, x1, y1, x2: x1, y2: y1 }
  }

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    setRandomPickerSelected(false)
    setGroupMakerSelected(false)
    setShowStickers(false)
    if (e.shiftKey) {
      setMultiIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
      setSelectedId(id)
      return
    }
    if (multiIds.length > 1 && multiIds.includes(id)) {
      const unlocked = multiIds.filter(mid => !dataRef.current.elements.find(x => x.id === mid)?.locked)
      if (unlocked.length === 0) { setSelectedId(id); return }
      const positions: Record<string, {x: number; y: number}> = {}
      dataRef.current.elements.forEach(el => {
        if (unlocked.includes(el.id)) positions[el.id] = { x: el.x, y: el.y }
      })
      opRef.current = { kind: 'multidrag', ids: unlocked, sx: e.clientX, sy: e.clientY, origPositions: positions, dx: 0, dy: 0 }
      return
    }
    // Smart group selection: clicking a grouped element selects all group members
    const clickedEl = dataRef.current.elements.find(x => x.id === id)
    if (clickedEl?.groupId) {
      const groupIds = dataRef.current.elements
        .filter(el => el.groupId === clickedEl.groupId)
        .map(el => el.id)
      if (groupIds.length > 1) {
        setMultiIds(groupIds)
        setSelectedId(id)
        const unlocked = groupIds.filter(gid => !dataRef.current.elements.find(x => x.id === gid)?.locked)
        if (unlocked.length > 0) {
          const positions: Record<string, {x: number; y: number}> = {}
          dataRef.current.elements.forEach(el => {
            if (unlocked.includes(el.id)) positions[el.id] = { x: el.x, y: el.y }
          })
          opRef.current = { kind: 'multidrag', ids: unlocked, sx: e.clientX, sy: e.clientY, origPositions: positions, dx: 0, dy: 0 }
        }
        return
      }
    }
    setMultiIds([])
    setSelectedId(id)
    const el = dataRef.current.elements.find(x => x.id === id)
    if (!el || el.locked) return
    opRef.current = { kind: 'drag', id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, cx: el.x, cy: el.y }
  }

  const startResize = (e: React.PointerEvent, id: string) => {
    e.stopPropagation(); e.preventDefault()
    const el = dataRef.current.elements.find(x => x.id === id)
    if (!el || el.locked) return
    const lockAspect = el.type === 'photo' || el.type === 'sticker' || el.type === 'video' || el.type === 'analogClock'
    opRef.current = { kind: 'resize', id, sx: e.clientX, sy: e.clientY, ow: el.w, oh: el.h, rot: el.rotation, cw: el.w, ch: el.h, lockAspect }
  }

  const startRotate = (e: React.PointerEvent, id: string) => {
    e.stopPropagation(); e.preventDefault()
    const el = dataRef.current.elements.find(x => x.id === id)
    const node = canvasRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)
    if (!el || !node || el.locked) return
    const rect = node.getBoundingClientRect()
    const ecx = rect.left + rect.width / 2, ecy = rect.top + rect.height / 2
    opRef.current = { kind: 'rotate', id, ecx, ecy, sa: Math.atan2(e.clientY - ecy, e.clientX - ecx) * 180 / Math.PI, or: el.rotation, cr: el.rotation }
  }

  const maxZ = data.elements.reduce((m, el) => Math.max(m, el.z), 0)
  const minZ = data.elements.reduce((m, el) => Math.min(m, el.z), 0)

  const addText = () => {
    const el = makeEl('text', 60, 60, '텍스트를 입력하세요', maxZ)
    const next = { ...data, elements: [...data.elements, el] }
    setData(next); persist(next); setSelectedId(el.id)
    setTimeout(() => setEditingId(el.id), 30)
  }

  const addPhoto = async () => {
    const url = await api.file.pickImage().catch(() => null)
    if (!url) return
    const c = canvasRef.current
    const img = new Image()
    img.onload = () => {
      const MAX_DIM = 280
      let w = img.naturalWidth, h = img.naturalHeight
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w >= h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM }
        else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM }
      }
      const cx = c ? Math.max(0, c.clientWidth / 2 - w / 2) : 60
      const cy = c ? Math.max(0, c.clientHeight / 2 - h / 2) : 60
      const mz = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
      const el = { ...makeEl('photo', cx, cy, url, mz), w, h }
      const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
      setData(next); persist(next); setSelectedId(el.id)
    }
    img.src = url
  }

  const addSticker = (b64: string) => {
    const c = canvasRef.current
    const img = new Image()
    img.onload = () => {
      const MAX_DIM = 120
      let w = img.naturalWidth, h = img.naturalHeight
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w >= h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM }
        else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM }
      }
      const cx = c ? c.clientWidth / 2 - w / 2 : 100
      const cy = c ? c.clientHeight / 2 - h / 2 : 100
      const mz = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
      const el = { ...makeEl('sticker', cx, cy, b64, mz), w, h }
      const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
      setData(next); persist(next); setSelectedId(el.id); setShowStickers(false)
    }
    img.src = b64
  }

  const addVideoEmbed = (url: string) => {
    const c = canvasRef.current
    const cx = c ? c.clientWidth / 2 - 240 : 100
    const cy = c ? c.clientHeight / 2 - 135 : 100
    const mz = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
    const el: CanvasEl = { ...makeEl('video', cx, cy, url, mz), videoType: 'embed' }
    const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
    setData(next); persist(next); setSelectedId(el.id)
    setShowVideoMenu(false); setShowVideoUrlInput(false); setVideoUrlInput('')
  }

  const addVideoLocal = async () => {
    const path = await api.file.pickVideo().catch(() => null)
    if (!path) return
    const c = canvasRef.current
    const cx = c ? c.clientWidth / 2 - 240 : 100
    const cy = c ? c.clientHeight / 2 - 135 : 100
    const mz = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
    const el: CanvasEl = { ...makeEl('video', cx, cy, path, mz), videoType: 'local' }
    const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
    setData(next); persist(next); setSelectedId(el.id)
    setShowVideoMenu(false)
  }

  const addClock = (type: 'analogClock' | 'digitalClock') => {
    const c = canvasRef.current
    const w = type === 'analogClock' ? 210 : 260
    const h = type === 'analogClock' ? 210 : 92
    const cx = c ? c.clientWidth / 2 - w / 2 : 100
    const cy = c ? c.clientHeight / 2 - h / 2 : 100
    const mz = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
    const el = { ...makeEl(type, cx, cy, '', mz), w, h }
    const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
    setData(next); persist(next); setSelectedId(el.id)
    setShowClockMenu(false)
  }

  const addQrCode = async (url: string, title: string) => {
    const trimmed = url.trim()
    if (!trimmed) return
    const dataUrl = await QRCode.toDataURL(trimmed, { width: 400, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
    const c = canvasRef.current
    const w = 240
    const titleH = title.trim() ? 48 : 0
    const h = w + titleH
    const cx = c ? c.clientWidth / 2 - w / 2 : 100
    const cy = c ? c.clientHeight / 2 - h / 2 : 100
    const mz = dataRef.current.elements.reduce((m, el) => Math.max(m, el.z), 0)
    const el: CanvasEl = { ...makeEl('qr', cx, cy, dataUrl, mz), w, h, linkUrl: trimmed, qrUrl: trimmed, qrTitle: title.trim() || undefined }
    const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
    setData(next); persist(next); setSelectedId(el.id)
    setShowQrMenu(false); setQrInput(''); setQrTitleInput('')
  }

  const updateQrCode = async () => {
    if (!qrEditId) return
    const url = qrEditUrl.trim()
    if (!url) return
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
    const titleH = qrEditTitle.trim() ? 48 : 0
    const next = {
      ...dataRef.current,
      elements: dataRef.current.elements.map(el => el.id === qrEditId
        ? { ...el, content: dataUrl, linkUrl: url, qrUrl: url, qrTitle: qrEditTitle.trim() || undefined, h: el.w + titleH }
        : el
      ),
    }
    setData(next); persist(next); setQrEditId(null)
  }

  const selectedEl = data.elements.find(el => el.id === selectedId) ?? null
  const filteredFonts = fontSearch
    ? systemFonts.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
    : systemFonts

  const canvasBgStyle: React.CSSProperties = data.bgImage
    ? {
        backgroundColor: data.bg,
      }
    : { background: data.bg }

  return (
    <div className="flex flex-col h-full select-none relative" style={canvasBgStyle}
      onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        if (rect.bottom - e.clientY <= 100) showDock()
        else if (dockVisible && !showStickers && !showVideoMenu && !showClockMenu && !showQrMenu && !showBackgroundMenu) scheduleDockHide()
      }}
      onClick={e => {
        if (e.metaKey || e.ctrlKey) return
        if (justMarqueedRef.current) { justMarqueedRef.current = false; return }
        setSelectedId(null); setMultiIds([]); setRandomPickerSelected(false); setGroupMakerSelected(false); setEditingId(null); setShowStickers(false); setShowFontList(false); setShowFontSizeList(false); setShowVideoMenu(false); setShowClockMenu(false); setShowQrMenu(false); setShowBackgroundMenu(false)
      }}>

      {/* SVG defs — clip paths */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <clipPath id="clip-heart" clipPathUnits="objectBoundingBox">
            <path d="M0.5,0.3 C0.5,0.1 0.75,0.05 0.875,0.2 C1,0.35 1,0.6 0.875,0.75 L0.5,1 L0.125,0.75 C0,0.6 0,0.35 0.125,0.2 C0.25,0.05 0.5,0.1 0.5,0.3 Z" />
          </clipPath>
          <clipPath id="clip-star" clipPathUnits="objectBoundingBox">
            <polygon points="0.5,0 0.61,0.35 0.98,0.35 0.68,0.57 0.79,0.91 0.5,0.70 0.21,0.91 0.32,0.57 0.02,0.35 0.39,0.35" />
          </clipPath>
        </defs>
      </svg>

      {/* Auto-hiding bottom dock */}
      <div className="flex items-center justify-center gap-1.5 px-3 py-2"
        style={{
          position: 'absolute', left: '50%', bottom: 14, zIndex: 200000,
          maxWidth: 'calc(100% - 28px)', minHeight: 48, overflow: 'visible',
          border: '1px solid color-mix(in srgb, var(--color-border) 80%, transparent)',
          borderRadius: 15, background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 8px 28px rgba(30,40,55,0.18)',
          backdropFilter: 'blur(14px)',
          transform: `translate(-50%, ${dockVisible ? '0' : 'calc(100% + 24px)'})`,
          opacity: dockVisible ? 1 : 0,
          pointerEvents: dockVisible ? 'auto' : 'none',
          transition: 'transform .24s ease, opacity .2s ease',
        }}
        onMouseEnter={showDock}
        onMouseLeave={scheduleDockHide}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center gap-1.5 shrink-0">
          {!boardKey && <button onClick={onPrev} className="text-sm px-1.5 hover:opacity-70" style={{ color: 'var(--color-primary-dark)' }}>‹</button>}
          <strong className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{dateLabel}</strong>
          {!boardKey && <button onClick={onToday} className="text-xs px-1.5 rounded-full hover:opacity-70" style={{ color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary-dark)' }}>오늘</button>}
          {!boardKey && <button onClick={onNext} className="text-sm px-1.5 hover:opacity-70" style={{ color: 'var(--color-primary-dark)' }}>›</button>}
          {saved && <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-primary-dark)' }}>저장됨 ✓</span>}
        </div>
        <div className="w-px self-stretch mx-0.5" style={{ background: 'var(--color-border)' }} />

        {/* Undo / Redo */}
        <button onClick={undo} title="실행취소 (⌘Z)"
          style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          {ICONS.undo}
        </button>
        <button onClick={redo} title="다시실행 (⌘⇧Z)"
          style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          {ICONS.redo}
        </button>
        <div className="w-px self-stretch mx-0.5" style={{ background: 'var(--color-border)' }} />

        {/* Add buttons */}
        <button onClick={addText} className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>텍스트</button>
        <div className="relative">
          <button onClick={() => { setShowStickers(v => !v); setShowVideoMenu(false); setShowClockMenu(false); setShowBackgroundMenu(false) }} className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
            style={{ background: showStickers ? 'var(--color-primary)' : 'var(--color-primary-light)', color: showStickers ? '#fff' : 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
            스티커
          </button>
          {showStickers && <StickerPicker onSelect={addSticker} onClose={() => setShowStickers(false)} />}
        </div>
        <button onClick={addPhoto} className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>사진</button>
        <div className="relative">
          <button onClick={() => { setShowVideoMenu(v => !v); setShowStickers(false); setShowClockMenu(false); setShowBackgroundMenu(false); setShowVideoUrlInput(false); setVideoUrlInput('') }}
            className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
            style={{ background: showVideoMenu ? 'var(--color-primary)' : 'var(--color-primary-light)', color: showVideoMenu ? '#fff' : 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
            동영상
          </button>
          {showVideoMenu && (
            <div className="absolute bottom-full left-0 mb-2 z-50 rounded-xl shadow-xl overflow-hidden"
              style={{ background: '#fff', border: '1px solid var(--color-border)', width: 'max-content', minWidth: 'max-content' }}
              onClick={e => e.stopPropagation()}>
              {!showVideoUrlInput ? (<>
                <button onClick={() => setShowVideoUrlInput(true)}
                  className="daily-menu-item text-left text-xs px-3 py-2 whitespace-nowrap"
                  style={{ color: 'var(--color-text)' }}>링크로 추가</button>
                <button onClick={addVideoLocal}
                  className="daily-menu-item text-left text-xs px-3 py-2 whitespace-nowrap"
                  style={{ color: 'var(--color-text)', borderTop: '1px solid var(--color-border)' }}>로컬 영상 추가</button>
              </>) : (
                <div className="p-2 flex flex-col gap-1.5">
                  <input autoFocus type="text" placeholder="YouTube / Vimeo URL"
                    value={videoUrlInput} onChange={e => setVideoUrlInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return
                      const trimmed = videoUrlInput.trim()
                      if (getVideoEmbedUrl(trimmed)) addVideoEmbed(trimmed)
                    }}
                    className="text-xs px-2 py-1 rounded outline-none w-full"
                    style={{ border: `1px solid ${videoUrlInput.trim() && !getVideoEmbedUrl(videoUrlInput.trim()) ? '#f87171' : 'var(--color-border)'}`, color: 'var(--color-text)' }} />
                  {videoUrlInput.trim() && !getVideoEmbedUrl(videoUrlInput.trim()) && (
                    <p className="text-xs" style={{ color: '#f87171' }}>유튜브·비메오 링크만 지원해요</p>
                  )}
                  <button onClick={() => {
                    const trimmed = videoUrlInput.trim()
                    if (getVideoEmbedUrl(trimmed)) addVideoEmbed(trimmed)
                  }}
                    className="text-xs py-1 rounded-full font-medium"
                    style={{ background: 'var(--color-primary)', color: '#fff' }}>
                    추가
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => { setShowClockMenu(value => !value); setShowStickers(false); setShowVideoMenu(false); setShowBackgroundMenu(false) }}
            className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
            style={{ background: showClockMenu ? 'var(--color-primary)' : 'var(--color-primary-light)', color: showClockMenu ? '#fff' : 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
            시계
          </button>
          {showClockMenu && (
            <div className="clock-add-menu absolute bottom-full left-0 mb-2 z-50"
              onClick={e => e.stopPropagation()}>
              <button onClick={() => addClock('analogClock')} className="clock-add-option">
                <span className="clock-option-preview analog"><span /></span>
                <strong>아날로그</strong>
              </button>
              <button onClick={() => addClock('digitalClock')} className="clock-add-option">
                <span className="clock-option-preview digital">12:34:56</span>
                <strong>디지털</strong>
              </button>
            </div>
          )}
        </div>
        <div className="w-px self-stretch mx-0.5" style={{ background: 'var(--color-border)' }} />

        {/* QR code */}
        <div className="relative">
          <button onClick={() => { setShowQrMenu(v => !v); setShowStickers(false); setShowVideoMenu(false); setShowClockMenu(false); setShowBackgroundMenu(false) }}
            className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
            style={{ background: showQrMenu ? 'var(--color-primary)' : 'var(--color-primary-light)', color: showQrMenu ? '#fff' : 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
            QR
          </button>
          {showQrMenu && (
            <div className="absolute bottom-full left-0 mb-2 z-50 rounded-2xl shadow-2xl"
              style={{ width: 280, padding: 14, background: 'rgba(255,255,255,0.97)', border: '1px solid var(--color-border)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <strong className="text-xs" style={{ color: 'var(--color-text)' }}>QR 코드 만들기</strong>
                <button onClick={() => setShowQrMenu(false)} style={{ border: 0, background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>URL을 입력하면 QR 코드를 캔버스에 추가해요</p>
              <label style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 3 }}>URL</label>
              <input
                type="text"
                value={qrInput}
                onChange={e => setQrInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addQrCode(qrInput, qrTitleInput) }}
                placeholder="https://..."
                autoFocus
                style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', marginBottom: 6 }}
              />
              <label style={{ fontSize: 10, color: 'var(--color-text-muted)', display: 'block', marginBottom: 3 }}>타이틀 <span style={{ opacity: 0.6 }}>(선택)</span></label>
              <input
                type="text"
                value={qrTitleInput}
                onChange={e => setQrTitleInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addQrCode(qrInput, qrTitleInput) }}
                placeholder="예: 출석 체크"
                style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
              />
              <button onClick={() => addQrCode(qrInput, qrTitleInput)}
                className="w-full text-xs py-1.5 rounded-full font-medium"
                style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                캔버스에 추가
              </button>
            </div>
          )}
        </div>
        <div className="w-px self-stretch mx-0.5" style={{ background: 'var(--color-border)' }} />
        <button onClick={e => { e.stopPropagation(); setShowRandomPicker(true); setRandomPickerSelected(true); setSelectedId(null); setMultiIds([]); setShowStickers(false); setShowVideoMenu(false); setShowClockMenu(false); setShowBackgroundMenu(false) }}
          className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
          style={{ background: 'var(--color-primary)', color: '#fff', border: '1px solid var(--color-primary)' }}>
          발표 뽑기
        </button>
        <div className="w-px self-stretch mx-0.5" style={{ background: 'var(--color-border)' }} />
        <button onClick={e => { e.stopPropagation(); setShowGroupMaker(true); setGroupMakerSelected(true); setSelectedId(null); setMultiIds([]); setShowStickers(false); setShowVideoMenu(false); setShowClockMenu(false); setShowQrMenu(false); setShowBackgroundMenu(false) }}
          className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
          style={{ background: 'var(--color-primary)', color: '#fff', border: '1px solid var(--color-primary)' }}>
          조 만들기
        </button>
        <div className="w-px self-stretch mx-0.5" style={{ background: 'var(--color-border)' }} />

        {/* Canvas background */}
        <div className="relative">
          <button onClick={() => { setShowBackgroundMenu(value => !value); setShowStickers(false); setShowVideoMenu(false); setShowClockMenu(false) }}
            className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
            style={{ background: showBackgroundMenu ? 'var(--color-primary)' : 'var(--color-primary-light)', color: showBackgroundMenu ? '#fff' : 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
            배경
          </button>
          {showBackgroundMenu && (
            <div className="absolute bottom-full right-0 mb-2 z-50 rounded-2xl shadow-2xl"
              style={{ width: 410, padding: 13, background: 'rgba(255,255,255,0.97)', border: '1px solid var(--color-border)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <strong className="text-xs" style={{ color: 'var(--color-text)' }}>판 배경</strong>
                <button onClick={() => setShowBackgroundMenu(false)} style={{ border: 0, background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">

          {BG_COLORS.map(c => (
            <button key={c} onClick={() => { update({ bg: c }); setBgHexInput(c) }} className="w-5 h-5 rounded-full shrink-0 transition-transform"
              style={{ background: c, border: `2px solid ${data.bg === c ? 'var(--color-primary-dark)' : 'var(--color-border)'}`, transform: data.bg === c ? 'scale(1.15)' : 'scale(1)' }} />
          ))}

          {bgCustomColors.map((cc, i) => (
            <button key={`cc${i}`}
              title={cc ? '클릭: 적용 / 우클릭: 삭제' : '클릭: 현재 배경색 저장'}
              onClick={() => {
                if (cc) { update({ bg: cc }); setBgHexInput(cc) }
                else {
                  const next = [...bgCustomColors]; next[i] = data.bg
                  setBgCustomColors(next); saveBgCustomColors(next)
                }
              }}
              onContextMenu={e => {
                e.preventDefault()
                const next = [...bgCustomColors]; next[i] = ''
                setBgCustomColors(next); saveBgCustomColors(next)
              }}
              className="w-5 h-5 rounded-full shrink-0 transition-transform"
              style={{
                background: cc || 'transparent',
                border: `2px ${cc ? 'solid' : 'dashed'} ${cc && data.bg === cc ? 'var(--color-primary-dark)' : 'var(--color-border)'}`,
                backgroundImage: cc ? undefined : 'repeating-linear-gradient(45deg,#ddd 0,#ddd 1px,transparent 0,transparent 50%)',
                backgroundSize: cc ? undefined : '4px 4px',
                transform: cc && data.bg === cc ? 'scale(1.15)' : 'scale(1)',
              }} />
          ))}

          <input type="text" value={bgHexInput} placeholder="#FFF8F0"
            onChange={e => {
              setBgHexInput(e.target.value)
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) update({ bg: e.target.value })
            }}
            className="text-xs px-2 h-7 rounded outline-none w-[70px] shrink-0"
            style={{ border: '1px solid var(--color-border)', background: 'white' }} />

          <button onClick={pickBgImage}
            className="text-xs h-7 px-2.5 rounded-full font-medium hover:opacity-80 shrink-0"
            style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
            이미지
          </button>

          {data.bgImage && (
            <div className="flex items-center gap-1 h-7 shrink-0">
              {/* 썸네일 + 우측 상단 삭제 x 오버레이 */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                  <img src={data.bgImage} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <button
                  onClick={() => update({ bgImage: undefined, bgImageScale: 1, bgImageRotation: 0 })}
                  title="배경 이미지 삭제"
                  className="flex items-center justify-center rounded-full"
                  style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, background: 'var(--color-sidebar)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: 10, fontWeight: 'bold', lineHeight: 1, paddingTop: 2 }}>
                  ×
                </button>
              </div>
              <button onClick={() => update({ bgImageFit: 'cover' })} title="꽉 차게"
                style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${data.bgImageFit === 'cover' ? 'var(--color-primary)' : 'var(--color-border)'}`, background: data.bgImageFit === 'cover' ? 'var(--color-primary-light)' : 'transparent', color: data.bgImageFit === 'cover' ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', cursor: 'pointer' }}>
                <span style={{ display: 'flex', transform: 'scale(0.78)', transformOrigin: 'center' }}>{ICONS.bgFill}</span>
              </button>
              <button onClick={() => update({ bgImageFit: 'center' })} title="원래 크기"
                style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${(data.bgImageFit ?? 'center') === 'center' ? 'var(--color-primary)' : 'var(--color-border)'}`, background: (data.bgImageFit ?? 'center') === 'center' ? 'var(--color-primary-light)' : 'transparent', color: (data.bgImageFit ?? 'center') === 'center' ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', cursor: 'pointer' }}>
                <span style={{ display: 'flex', transform: 'scale(0.78)', transformOrigin: 'center' }}>{ICONS.bgOriginal}</span>
              </button>
              <button onClick={() => update({ bgImageRotation: ((data.bgImageRotation ?? 0) + 90) % 360 })} title="90° 회전"
                style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <span style={{ display: 'flex', transform: 'scale(0.78)', transformOrigin: 'center' }}>{ICONS.rotate90}</span>
              </button>
              <div className="flex items-center h-7 px-1">
                <input type="range" min={10} max={500} value={Math.round((data.bgImageScale ?? 1) * 100)}
                  onChange={e => update({ bgImageScale: Number(e.target.value) / 100 })}
                  className="w-16 cursor-pointer" style={{ height: 4 }}
                  title={`이미지 크기: ${Math.round((data.bgImageScale ?? 1) * 100)}%`} />
              </div>
            </div>
          )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="flex-1 relative overflow-hidden" style={canvasBgStyle}
        onPointerDown={startMarquee}>

        {/* Background image layer */}
        {data.bgImage && (() => {
          const rot = data.bgImageRotation ?? 0
          const userScale = data.bgImageScale ?? 1
          const isCover = data.bgImageFit === 'cover'
          const is90or270 = rot === 90 || rot === 270
          const cw = canvasRef.current?.clientWidth ?? 1600
          const ch = canvasRef.current?.clientHeight ?? 900
          return (
            <img key="bg-img" src={data.bgImage} draggable={false} style={{
              position: 'absolute', top: '50%', left: '50%',
              width:  isCover ? (is90or270 ? ch : '100%') : undefined,
              height: isCover ? (is90or270 ? cw : '100%') : undefined,
              objectFit: isCover ? 'cover' : undefined,
              transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${userScale})`,
              transformOrigin: 'center center',
              zIndex: 0, pointerEvents: 'none', userSelect: 'none',
            }} />
          )
        })()}

        {[...data.elements].sort((a, b) => a.z - b.z).map(el => {
          const isSel  = el.id === selectedId
          const isEdit = el.id === editingId
          const clipStyle = el.type === 'photo' ? getPhotoClipStyle(el.clipShape, customShapes) : {}
          const justifyV = el.alignV === 'top' ? 'flex-start' : el.alignV === 'middle' ? 'center' : 'flex-end'
          const textRad = el.textRadius ?? 0
          const bw = el.borderWidth ?? 0
          const interactiveUrl: string | null =
            el.type === 'video' && el.videoType === 'embed' ? el.content :
            (el.linkUrl ?? null)

          return (
            <div key={el.id} data-id={el.id}
              style={{
                position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, zIndex: el.z,
                transform: `rotate(${el.rotation}deg) scaleX(${el.flipH ? -1 : 1}) scaleY(${el.flipV ? -1 : 1})`,
                outline: capturing === null && (isSel || multiIds.includes(el.id)) ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
                outlineOffset: 2,
                cursor: isEdit ? 'default' : el.locked ? 'default' : 'move',
              }}
              onPointerDown={e => { if (!isEdit && !e.metaKey && !e.ctrlKey) startDrag(e, el.id) }}
              onDoubleClick={e => {
                e.stopPropagation()
                if (el.type === 'text') {
                  setSelectedId(el.id)
                  setEditingId(el.id)
                  if (el.content === '텍스트를 입력하세요') {
                    setData(prev => ({ ...prev, elements: prev.elements.map(x => x.id === el.id ? { ...x, content: '' } : x) }))
                  }
                }
                if (el.type === 'markdown') { setSelectedId(el.id); setEditingId(el.id) }
                if (el.type === 'qr') { setQrEditId(el.id); setQrEditUrl(el.qrUrl ?? ''); setQrEditTitle(el.qrTitle ?? '') }
              }}
              onClick={e => e.stopPropagation()}>

              <div style={{
                width: '100%', height: '100%', opacity: el.opacity / 100,
                position: 'relative',
                ...clipStyle,
                overflow: (el.type === 'photo' || el.type === 'qr' || (el.type === 'text' && textRad > 0) || el.type === 'markdown') ? 'hidden' : undefined,
                borderRadius: el.type === 'photo'
                  ? (el.clipShape === 'none' ? `${photoRadiusPx(el.w, el.h, el.photoRadius)}px` : 0)
                  : el.type === 'qr' ? 10
                  : (el.type === 'text' || el.type === 'markdown') ? `${textRad}px` : 0,
              }}>
                {el.type === 'text' && (
                  isEdit ? (
                    <textarea autoFocus onFocus={e => { const t = e.target; setTimeout(() => t.select(), 0) }} value={el.content}
                      onChange={e2 => setData(prev => ({ ...prev, elements: prev.elements.map(x => x.id === el.id ? { ...x, content: e2.target.value } : x) }))}
                      onBlur={() => {
                        setEditingId(null)
                        const current = dataRef.current
                        const target = current.elements.find(x => x.id === el.id)
                        if (target && target.content.trim() === '') {
                          const next = { ...current, elements: current.elements.filter(x => x.id !== el.id) }
                          setData(next); persist(next); setSelectedId(null)
                        } else {
                          persist(current)
                        }
                      }}
                      onClick={e2 => e2.stopPropagation()}
                      onPointerDown={e2 => e2.stopPropagation()}
                      style={{
                        width: '100%', height: '100%', resize: 'none', outline: 'none',
                        fontSize: `${el.fontSize}px`,
                        color: el.color,
                        fontWeight: el.bold ? 'bold' : 'normal', fontStyle: el.italic ? 'italic' : 'normal',
                        textDecoration: [el.underline && 'underline', el.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none',
                        letterSpacing: `${el.letterSpacing ?? 0}px`,
                        lineHeight: el.lineHeight ?? 1.4,
                        fontFamily: el.fontFamily,
                        background: el.bgOpacity > 0 ? hexToRgba(el.bgColor, el.bgOpacity) : 'rgba(255,255,255,0.75)',
                        border: bw > 0 ? `${bw}px solid ${el.borderColor ?? '#333333'}` : 'none',
                        padding: el.textPadding ?? 6, borderRadius: textRad,
                        textAlign: el.align, cursor: 'text', userSelect: 'text',
                        boxSizing: 'border-box',
                      }} />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', overflow: 'hidden',
                      display: 'flex', flexDirection: 'column', justifyContent: justifyV,
                      background: hexToRgba(el.bgColor, el.bgOpacity),
                      padding: el.textPadding ?? 6, borderRadius: textRad,
                      border: bw > 0 ? `${bw}px solid ${el.borderColor ?? '#333333'}` : 'none',
                      boxSizing: 'border-box',
                    }}>
                      <div style={{
                        fontSize: `${el.fontSize}px`,
                        color: el.color,
                        fontWeight: el.bold ? 'bold' : 'normal', fontStyle: el.italic ? 'italic' : 'normal',
                        textDecoration: [el.underline && 'underline', el.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none',
                        letterSpacing: `${el.letterSpacing ?? 0}px`,
                        lineHeight: el.lineHeight ?? 1.4,
                        fontFamily: el.fontFamily,
                        textAlign: el.align, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        transform: (el.scaleX ?? 100) !== 100 ? `scaleX(${(el.scaleX ?? 100) / 100})` : undefined,
                        transformOrigin: el.align === 'center' ? 'center top' : el.align === 'right' ? 'right top' : 'left top',
                      }}>{el.content}</div>
                    </div>
                  )
                )}

                {el.type === 'markdown' && (
                  isEdit ? (
                    <textarea
                      autoFocus
                      ref={node => { mdTextareaRef.current = node }}
                      value={el.content}
                      onChange={e2 => setData(prev => ({ ...prev, elements: prev.elements.map(x => x.id === el.id ? { ...x, content: e2.target.value } : x) }))}
                      onBlur={() => { setEditingId(null); persist(dataRef.current) }}
                      onClick={e2 => e2.stopPropagation()}
                      onPointerDown={e2 => e2.stopPropagation()}
                      style={{
                        width: '100%', height: '100%', resize: 'none', outline: 'none',
                        fontSize: 13, fontFamily: 'monospace',
                        color: 'var(--color-text)',
                        background: hexToRgba(el.bgColor, el.bgOpacity),
                        padding: 8, cursor: 'text', userSelect: 'text',
                        boxSizing: 'border-box', borderRadius: textRad,
                      }}
                    />
                  ) : (
                    <div className="md-canvas-render" style={{
                      width: '100%', height: '100%', overflow: 'hidden',
                      background: hexToRgba(el.bgColor, el.bgOpacity),
                      padding: 8, boxSizing: 'border-box', borderRadius: textRad,
                      fontSize: `calc(${el.fontSize}px * var(--font-scale, 1))`,
                      color: el.color,
                      fontFamily: el.fontFamily || undefined,
                    }}>
                      <ReactMarkdown>{el.content}</ReactMarkdown>
                    </div>
                  )
                )}

                {el.type === 'video' && (
                  <div style={{ width: '100%', height: '100%', borderRadius: 6, overflow: 'hidden', position: 'relative', background: '#000' }}>
                    {el.videoType === 'embed' ? (
                      <iframe
                        src={getVideoRenderUrl(el.content, youtubePort) ?? ''}
                        style={{ width: '100%', height: '100%', border: 'none', pointerEvents: cmdHeld ? 'auto' : 'none' }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : (
                      <video
                        src={convertFileSrc(el.content)}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: cmdHeld ? 'auto' : 'none' }}
                        controls
                        playsInline
                      />
                    )}
                  </div>
                )}

                {el.type === 'sticker' && (
                  <img src={el.content} alt="" draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                )}

                {el.type === 'photo' && (
                  <img src={el.content} alt="" draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                )}

                {el.type === 'qr' && (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ flex: 1, padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                      <img src={el.content} alt="QR" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                    </div>
                    {el.qrTitle && (
                      <div style={{ padding: '5px 10px 7px', textAlign: 'center', fontSize: Math.max(11, Math.min(16, el.w * 0.065)), fontWeight: 700, color: '#1a2236', background: '#f5f7ff', borderTop: '1px solid #e8eaff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
                        {el.qrTitle}
                      </div>
                    )}
                  </div>
                )}

                {el.type === 'analogClock' && <AnalogClock time={clockTime} el={el} />}

                {el.type === 'digitalClock' && <DigitalClock time={clockTime} />}

                {interactiveUrl && el.type !== 'video' && <InteractiveOverlay url={interactiveUrl} cmdHeld={cmdHeld} />}
              </div>

              {capturing === null && isSel && !isEdit && (<>
                <div onPointerDown={e => startRotate(e, el.id)} onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', width: 20, height: 20, borderRadius: '50%', zIndex: 99, cursor: 'grab', background: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>↻</div>
                <div onPointerDown={e => startResize(e, el.id)} onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, borderRadius: '50%', zIndex: 99, cursor: 'se-resize', background: 'var(--color-primary-dark)' }} />
              </>)}
            </div>
          )
        })}

        {/* QR Edit popup */}
        {qrEditId && (() => {
          const qrEl = data.elements.find(e => e.id === qrEditId)
          if (!qrEl) return null
          const POPUP_W = 280
          const left = qrEl.x + qrEl.w + 14 + POPUP_W > 1800 ? qrEl.x - POPUP_W - 14 : qrEl.x + qrEl.w + 14
          const top = Math.min(qrEl.y, 1012 - 220)
          return (
            <div style={{ position: 'absolute', left, top, width: POPUP_W, padding: 14, background: 'rgba(255,255,255,0.97)', border: '1px solid var(--color-border)', borderRadius: 14, boxShadow: '0 14px 35px rgba(25,34,50,.18)', zIndex: 2147483647 }}
              onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <strong style={{ fontSize: 12, color: 'var(--color-text)' }}>QR 코드 편집</strong>
                <button onClick={() => setQrEditId(null)} style={{ border: 0, background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
              </div>
              <label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>URL</label>
              <input type="text" value={qrEditUrl} onChange={e => setQrEditUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') updateQrCode() }}
                placeholder="https://..."
                autoFocus
                style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
              <label style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>타이틀 <span style={{ opacity: 0.6 }}>(선택)</span></label>
              <input type="text" value={qrEditTitle} onChange={e => setQrEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') updateQrCode() }}
                placeholder="예: 출석 체크"
                style={{ width: '100%', padding: '6px 8px', fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
              <button onClick={updateQrCode}
                style={{ width: '100%', padding: '7px 0', fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'var(--color-primary)', color: '#fff' }}>
                적용
              </button>
            </div>
          )
        })()}

        {/* Marquee selection overlay */}
        {capturing === null && marqueeRect && (
          <div style={{
            position: 'absolute',
            left: marqueeRect.x, top: marqueeRect.y,
            width: marqueeRect.w, height: marqueeRect.h,
            border: '1.5px dashed var(--color-primary-dark)',
            background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
            pointerEvents: 'none',
            zIndex: 99999,
            borderRadius: 2,
          }} />
        )}

        {/* Multi-select bounding box + floating toolbar */}
        {multiIds.length > 1 && !editingId && (() => {
          const selEls = data.elements.filter(el => multiIds.includes(el.id))
          if (!selEls.length) return null
          const ch = canvasRef.current?.clientHeight ?? 900
          const cw = canvasRef.current?.clientWidth ?? 1600
          const rect2 = canvasRef.current?.getBoundingClientRect()
          const ts2 = canvasRef.current && rect2
            ? canvasRef.current.offsetWidth / rect2.width
            : 1
          const minX = Math.min(...selEls.map(el => el.x))
          const maxX = Math.max(...selEls.map(el => el.x + el.w))
          const minY = Math.min(...selEls.map(el => el.y))
          const maxY = Math.max(...selEls.map(el => el.y + el.h))
          const boxW = maxX - minX, boxH = maxY - minY

          const TOOLBAR_H = 44, TOOLBAR_W = IS_WINDOWS ? 625 : 610
          const TOOLBAR_PAD_X = 8 * 2 + 2
          const TOOLBAR_PAD_Y = 6 * 2 + 2
          const toolbarOuterW = TOOLBAR_W + TOOLBAR_PAD_X
          const toolbarOuterH = TOOLBAR_H + TOOLBAR_PAD_Y
          let top = maxY + 10
          if (top + toolbarOuterH * ts2 > ch - 8) top = minY - toolbarOuterH * ts2 - 10
          top = Math.max(4, top)
          let left = minX
          if (left + toolbarOuterW * ts2 > cw - 8) left = cw - toolbarOuterW * ts2 - 8
          left = Math.max(4, left)

          const mBtn = (icon: React.ReactNode, title: string, onClick: () => void, active?: boolean) => (
            <button onClick={onClick} title={title} style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`, background: active ? 'var(--color-primary)' : 'transparent', color: active ? '#fff' : 'var(--color-text-muted)' }}>{icon}</button>
          )
          const sep = <div style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 2px' }} />

          const allGrouped = selEls.length > 1 && selEls.every(el => el.groupId && el.groupId === selEls[0].groupId)
          const allLocked  = selEls.every(el => !!el.locked)
          const handleMultiLayer = (action: 'front' | 'forward' | 'backward' | 'back') => {
            const sorted = [...dataRef.current.elements].sort((a, b) => a.z - b.z)
            const ids = new Set(multiIds)
            const zMap = new Map(sorted.map(el => [el.id, el.z]))
            if (action === 'front') {
              const nonSel = sorted.filter(el => !ids.has(el.id))
              const sel = sorted.filter(el => ids.has(el.id))
              nonSel.forEach((el, i) => zMap.set(el.id, i + 1))
              sel.forEach((el, i) => zMap.set(el.id, nonSel.length + i + 1))
            } else if (action === 'back') {
              const nonSel = sorted.filter(el => !ids.has(el.id))
              const sel = sorted.filter(el => ids.has(el.id))
              sel.forEach((el, i) => zMap.set(el.id, i + 1))
              nonSel.forEach((el, i) => zMap.set(el.id, sel.length + i + 1))
            } else if (action === 'forward') {
              multiIds.forEach(id => zMap.set(id, (zMap.get(id) ?? 0) + 1))
            } else {
              multiIds.forEach(id => zMap.set(id, Math.max(1, (zMap.get(id) ?? 1) - 1)))
            }
            const next = { ...dataRef.current, elements: dataRef.current.elements.map(el => ({ ...el, z: zMap.get(el.id) ?? el.z })) }
            setData(next); persistRef.current(next)
          }

          const handleGroup = () => {
            if (allGrouped) {
              const next = { ...dataRef.current, elements: dataRef.current.elements.map(el => multiIds.includes(el.id) ? { ...el, groupId: undefined } : el) }
              setData(next); persistRef.current(next)
            } else {
              const gid = crypto.randomUUID()
              const next = { ...dataRef.current, elements: dataRef.current.elements.map(el => multiIds.includes(el.id) ? { ...el, groupId: gid } : el) }
              setData(next); persistRef.current(next)
            }
          }

          return (<>
            {/* 다중 선택 바운딩 박스 + 크기 조절 핸들 */}
            <div id="multi-sel-box" style={{ position: 'absolute', left: minX, top: minY, width: boxW, height: boxH, border: allGrouped ? '1.5px solid var(--color-primary)' : '1.5px dashed var(--color-primary-dark)', pointerEvents: 'none', zIndex: 8999 }}>
              <div style={{ position: 'absolute', right: -6, bottom: -6, width: 14, height: 14, borderRadius: '50%', background: 'var(--color-primary-dark)', cursor: 'se-resize', pointerEvents: 'auto' }}
                onPointerDown={e => {
                  e.stopPropagation(); e.preventDefault()
                  const orig: Record<string, {x: number; y: number; w: number; h: number}> = {}
                  selEls.forEach(el => { orig[el.id] = { x: el.x, y: el.y, w: el.w, h: el.h } })
                  opRef.current = { kind: 'multiresize', ids: multiIds, sx: e.clientX, sy: e.clientY, bx: minX, by: minY, bw: boxW, bh: boxH, orig }
                }}
              />
            </div>

            {/* 정렬 툴바 */}
            <div style={{ position: 'absolute', top, left, zIndex: 100000, background: '#fff', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4, width: toolbarOuterW, boxSizing: 'border-box', transform: `scale(${ts2})`, transformOrigin: 'top left' }}
              onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginRight: 2 }}>{multiIds.length}개</span>
              {sep}
              {mBtn(ICONS.alignLeft, '왼쪽 맞춤', () => handleAlign('left'))}
              {mBtn(ICONS.alignCenter, '가운데 맞춤', () => handleAlign('center'))}
              {mBtn(ICONS.alignRight, '오른쪽 맞춤', () => handleAlign('right'))}
              {mBtn(ICONS.distributeH, '가로 간격 동일', () => handleAlign('dist-x'))}
              {sep}
              {mBtn(ICONS.alignTop, '위쪽 맞춤', () => handleAlign('top'))}
              {mBtn(ICONS.alignMiddle, '중간 맞춤', () => handleAlign('middle'))}
              {mBtn(ICONS.alignBottom, '아래쪽 맞춤', () => handleAlign('bottom'))}
              {mBtn(ICONS.distributeV, '세로 간격 동일', () => handleAlign('dist-y'))}
              {sep}
              {mBtn(ICONS.bringFront,   '맨앞으로', () => handleMultiLayer('front'))}
              {mBtn(ICONS.bringForward, '앞으로',   () => handleMultiLayer('forward'))}
              {mBtn(ICONS.sendBackward, '뒤로',     () => handleMultiLayer('backward'))}
              {mBtn(ICONS.sendBack,     '맨뒤로',   () => handleMultiLayer('back'))}
              {sep}
              {mBtn(allGrouped ? ICONS.ungroup : ICONS.group, allGrouped ? '그룹 해제 (⌘G)' : '그룹화 (⌘G)', handleGroup, allGrouped)}
              {mBtn(allLocked ? ICONS.unlock : ICONS.lock, allLocked ? '잠금 해제' : '잠금', () => {
                const next = { ...dataRef.current, elements: dataRef.current.elements.map(el => multiIds.includes(el.id) ? { ...el, locked: !allLocked } : el) }
                setData(next); persistRef.current(next)
              }, allLocked)}
              {sep}
              <button onClick={() => {
                const ids = new Set(multiIds)
                const next = { ...dataRef.current, elements: dataRef.current.elements.filter(el => !ids.has(el.id) || !!el.locked) }
                setData(next); persist(next); setMultiIds([]); setSelectedId(null)
              }} title="선택 삭제" style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: '1px solid #fbbbd4', background: 'transparent', color: '#e03060' }}>{ICONS.trash}</button>
            </div>
          </>)
        })()}

{/* Inline floating toolbar */}
        {selectedEl && !editingId && multiIds.length <= 1 && (() => {
          const ch = canvasRef.current?.clientHeight ?? 900
          const cw = canvasRef.current?.clientWidth ?? 1600
          // appZoom이 1 미만이면 툴바도 같이 작아지는 문제를 막기 위해 역스케일 적용
          // canvasRef는 부모의 scale(appZoom) 안에 있으므로 offsetWidth/rect.width = 1/appZoom
          const rect = canvasRef.current?.getBoundingClientRect()
          const ts = canvasRef.current && rect
            ? canvasRef.current.offsetWidth / rect.width
            : 1  // ts = 1/appZoom

          const TOOLBAR_H = selectedEl.type === 'text' ? 158 : selectedEl.type === 'analogClock' ? 92 : 44
          const TOOLBAR_W = selectedEl.type === 'text'
              ? (IS_WINDOWS ? 510 : 500)
              : selectedEl.type === 'photo'
                ? (IS_WINDOWS ? 620 : 600)
                : selectedEl.type === 'analogClock'
                  ? (IS_WINDOWS ? 440 : 430)
                  : (IS_WINDOWS ? 420 : 410)
          const TOOLBAR_PAD_X = 8 * 2 + 2
          const TOOLBAR_PAD_Y = 6 * 2 + 2
          const toolbarOuterW = TOOLBAR_W + TOOLBAR_PAD_X
          const toolbarOuterH = TOOLBAR_H + TOOLBAR_PAD_Y

          // 1. 기본 위치: 개체 아래쪽 (+20px 여유)
          let top = selectedEl.y + selectedEl.h + 20

          // 2. 캔버스 하단에서 잘릴 것 같으면 개체 위쪽으로 확 뒤집기
          // 역스케일로 인해 캔버스 좌표계에서 차지하는 외곽 크기는 outer size * ts
          if (top + toolbarOuterH * ts > ch - 20) {
            top = selectedEl.y - toolbarOuterH * ts - 35
          }

          // 3. 위로 뒤집었는데도 캔버스 맨 위를 뚫고 나간다면 강제로 상단 고정
          if (top < 10) top = 10

          // 4. 가로 위치 보정
          let left = selectedEl.x
          if (left + toolbarOuterW * ts > cw - 8) left = cw - toolbarOuterW * ts - 8
          left = Math.max(10, left)

          const S = { width: 28, height: 28, borderRadius: 6, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 } as const
          const rowBtn = (icon: React.ReactNode, title: string, onClick: () => void, active?: boolean) => (
            <button onClick={onClick} title={title} style={{ ...S, border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`, background: active ? 'var(--color-primary)' : 'transparent', color: active ? '#fff' : 'var(--color-text-muted)' }}>{icon}</button>
          )
          const vSep = <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-border)', flexShrink: 0, margin: '0 1px' }} />
          const hSep = <div style={{ height: 1, background: 'var(--color-border)' }} />

          return (
            <div style={{ position: 'absolute', top, left, zIndex: 100000, background: '#fff', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4, width: toolbarOuterW, boxSizing: 'border-box', transform: `scale(${ts})`, transformOrigin: 'top left' }}
              onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>

              {selectedEl.type === 'text' && (<>
                {/* Row 1: 글꼴 조정 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>

                  {/* 폰트 사이즈 하이브리드 콤보박스 */}
                  <div className="relative" style={{ flexShrink: 0 }}>
                    <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 4, height: 28, width: 50, background: 'white', overflow: 'hidden' }}>
                      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="text" inputMode="numeric"
                          value={selectedEl.fontSize}
                          onClick={() => setShowFontSizeList(true)}
                          onDoubleClick={e => (e.target as HTMLInputElement).select()}
                          onChange={e => {
                            const val = parseInt(e.target.value, 10)
                            if (!isNaN(val)) updateEl(selectedEl.id, { fontSize: Math.min(200, Math.max(6, val)) })
                          }}
                          style={{ width: '100%', height: '100%', border: 'none', outline: 'none', textAlign: 'center', fontSize: 11, padding: '0 8px 0 2px', background: 'transparent' }}
                        />
                      </div>
                      <div style={{ borderLeft: '1px solid var(--color-border)', width: 16, position: 'relative', background: '#f9f9f9', overflow: 'hidden' }}>
                        <input
                          type="number" min={6} max={200}
                          value={selectedEl.fontSize}
                          onChange={e => {
                            const newVal = Number(e.target.value), oldVal = selectedEl.fontSize
                            if (newVal > oldVal) updateEl(selectedEl.id, { fontSize: FONT_SIZES.find(s => s > oldVal) || 200 })
                            else if (newVal < oldVal) updateEl(selectedEl.id, { fontSize: [...FONT_SIZES].reverse().find(s => s < oldVal) || 6 })
                          }}
                          tabIndex={-1}
                          style={{ position: 'absolute', right: 0, top: 0, width: 40, height: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'transparent', caretColor: 'transparent' }}
                        />
                      </div>
                    </div>
                    {showFontSizeList && (
                      <div className="absolute z-50 flex flex-col rounded-xl shadow-xl overflow-hidden"
                        style={{ background: '#fff', border: '1px solid var(--color-border)', width: 70, maxHeight: 200, bottom: '110%', left: 0 }}
                        onClick={e => e.stopPropagation()}>
                        <div className="overflow-y-auto">
                          {FONT_SIZES.map(s => (
                            <button key={s} onClick={() => { updateEl(selectedEl.id, { fontSize: s }); setShowFontSizeList(false) }}
                              className="w-full text-center text-xs px-2 py-1 hover:bg-pink-50"
                              style={{ background: selectedEl.fontSize === s ? 'var(--color-primary-light)' : undefined, color: selectedEl.fontSize === s ? 'var(--color-primary-dark)' : undefined }}>
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="relative" style={{ flexShrink: 0 }}>
                    <button onClick={() => setShowFontList(v => !v)}
                      style={{ height: 28, fontSize: 11, padding: '0 5px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'white', maxWidth: 85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      title={selectedEl.fontFamily}>
                      {selectedEl.fontFamily.split(',')[0].replace(/'/g, '').trim().slice(0, 8)}▾
                    </button>
                    {showFontList && (
                      <div className="absolute z-50 flex flex-col rounded-xl shadow-xl overflow-hidden"
                        style={{ background: '#fff', border: '1px solid var(--color-border)', width: 200, maxHeight: 240, bottom: '110%', left: 0 }}
                        onClick={e => e.stopPropagation()}>
                        <input autoFocus type="text" placeholder="폰트 검색..." value={fontSearch}
                          onChange={e => setFontSearch(e.target.value)}
                          className="text-xs px-3 py-2 outline-none"
                          style={{ borderBottom: '1px solid var(--color-border)' }} />
                        <div className="overflow-y-auto">
                          {filteredFonts.map(f => (
                            <button key={f} onClick={() => { updateEl(selectedEl.id, { fontFamily: `'${f}', sans-serif` }); setShowFontList(false); setFontSearch('') }}
                              className="w-full text-left text-xs px-3 py-1.5 hover:bg-pink-50 truncate"
                              style={{ fontFamily: `'${f}'`, background: selectedEl.fontFamily.includes(f) ? 'var(--color-primary-light)' : undefined }}>
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: textColorInput || selectedEl.color, border: '1px solid var(--color-border)', flexShrink: 0 }} />
                    <input type="text" value={textColorInput} placeholder="#4A3F3F"
                      onChange={e => { setTextColorInput(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) updateEl(selectedEl.id, { color: e.target.value }) }}
                      style={{ height: 28, fontSize: 11, padding: '0 4px', borderRadius: 4, border: '1px solid var(--color-border)', width: 52 }} />
                  </div>

                  {vSep}

                  {rowBtn(ICONS.bold, '굵게', () => updateEl(selectedEl.id, { bold: !selectedEl.bold }), selectedEl.bold)}
                  {rowBtn(ICONS.italic, '기울임', () => updateEl(selectedEl.id, { italic: !selectedEl.italic }), selectedEl.italic)}
                  {rowBtn(ICONS.underline, '밑줄', () => updateEl(selectedEl.id, { underline: !selectedEl.underline }), !!selectedEl.underline)}
                  {rowBtn(ICONS.strikethrough, '취소선', () => updateEl(selectedEl.id, { strikethrough: !selectedEl.strikethrough }), !!selectedEl.strikethrough)}

                  {vSep}

                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>자간</span>
                  <input type="number" min={-10} max={30} step={0.5} value={selectedEl.letterSpacing ?? 0}
                    onChange={e => updateEl(selectedEl.id, { letterSpacing: Number(e.target.value) })}
                    style={{ width: 44, height: 28, fontSize: 11, textAlign: 'center', padding: '0 2px', borderRadius: 4, border: '1px solid var(--color-border)', flexShrink: 0 }} />

                  {vSep}

                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>장평</span>
                  <input type="number" min={50} max={200} step={1} value={selectedEl.scaleX ?? 100}
                    onChange={e => updateEl(selectedEl.id, { scaleX: Number(e.target.value) })}
                    style={{ width: 44, height: 28, fontSize: 11, textAlign: 'center', padding: '0 2px', borderRadius: 4, border: '1px solid var(--color-border)', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>%</span>

                </div>

                {hSep}

                {/* Row 2: 문장 조정 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>

                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>줄간격</span>
                  <input type="range" min={0.8} max={3.0} step={0.05} value={selectedEl.lineHeight ?? 1.4}
                    onChange={e => updateEl(selectedEl.id, { lineHeight: Number(e.target.value) })}
                    style={{ width: 60, height: 4, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--color-primary-dark)', minWidth: 24, flexShrink: 0 }}>{(selectedEl.lineHeight ?? 1.4).toFixed(2)}</span>

                  {vSep}

                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>여백</span>
                  <input type="range" min={0} max={40} step={1} value={selectedEl.textPadding ?? 6}
                    onChange={e => updateEl(selectedEl.id, { textPadding: Number(e.target.value) })}
                    style={{ width: 60, height: 4, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--color-primary-dark)', minWidth: 18, flexShrink: 0 }}>{selectedEl.textPadding ?? 6}</span>

                  {vSep}

                  <div style={{ display: 'flex', flexShrink: 0, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
                    {(['left','center','right'] as const).map((a, i) => (
                      <button key={a} onClick={() => updateEl(selectedEl.id, { align: a })} title={a==='left'?'왼쪽 정렬':a==='center'?'가운데 정렬':'오른쪽 정렬'}
                        style={{ width: 28, height: 28, border: 'none', borderLeft: i>0?'1px solid var(--color-border)':undefined, background: selectedEl.align===a?'var(--color-primary)':'transparent', color: selectedEl.align===a?'#fff':'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {a==='left' ? ICONS.textAlignLeft : a==='center' ? ICONS.textAlignCenter : ICONS.textAlignRight}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexShrink: 0, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
                    {VALIGN_OPTS.map((a, i) => (
                      <button key={a.id} onClick={() => updateEl(selectedEl.id, { alignV: a.id })} title={a.id==='top'?'위 정렬':a.id==='middle'?'중간 정렬':'아래 정렬'}
                        style={{ width: 28, height: 28, border: 'none', borderLeft: i>0?'1px solid var(--color-border)':undefined, background: selectedEl.alignV===a.id?'var(--color-primary)':'transparent', color: selectedEl.alignV===a.id?'#fff':'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {a.id==='top' ? ICONS.textBoxTop : a.id==='middle' ? ICONS.textBoxMiddle : ICONS.textBoxBottom}
                      </button>
                    ))}
                  </div>

                </div>

                {hSep}

                {/* Row 3: 텍스트 박스 조정 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center', width: '100%'}}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: bgColorInput || selectedEl.bgColor, border: '1px solid var(--color-border)', flexShrink: 0 }} />
                    <input type="text" value={bgColorInput} placeholder="#ffffff"
                      onChange={e => { setBgColorInput(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) updateEl(selectedEl.id, { bgColor: e.target.value, bgOpacity: selectedEl.bgOpacity === 0 ? 80 : selectedEl.bgOpacity }) }}
                      style={{ height: 28, fontSize: 11, padding: '0 4px', borderRadius: 4, border: '1px solid var(--color-border)', width: 52 }} />
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>배경</span>
                    <input type="range" min={0} max={100} value={selectedEl.bgOpacity}
                      onChange={e => updateEl(selectedEl.id, { bgOpacity: Number(e.target.value) })}
                      style={{ width: 44, height: 4, cursor: 'pointer', flexShrink: 0 }} />
                  </div>
                  {vSep}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>테두리</span>
                    <input type="range" min={0} max={8} value={selectedEl.borderWidth ?? 0}
                      onChange={e => updateEl(selectedEl.id, { borderWidth: Number(e.target.value) })}
                      style={{ width: 36, height: 4, cursor: 'pointer', flexShrink: 0 }} />
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: borderColorInput || selectedEl.borderColor, border: '1px solid var(--color-border)', flexShrink: 0 }} />
                    <input type="text" value={borderColorInput} placeholder="#333333"
                      onChange={e => { setBorderColorInput(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) updateEl(selectedEl.id, { borderColor: e.target.value }) }}
                      style={{ height: 28, fontSize: 11, padding: '0 4px', borderRadius: 4, border: '1px solid var(--color-border)', width: 52 }} />
                  </div>
                  {vSep}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>모서리</span>
                    <input type="range" min={0} max={40} value={selectedEl.textRadius ?? 0}
                      onChange={e => updateEl(selectedEl.id, { textRadius: Number(e.target.value) })}
                      style={{ width: 36, height: 4, cursor: 'pointer', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'var(--color-primary-dark)', minWidth: 22, flexShrink: 0 }}>{selectedEl.textRadius ?? 0}px</span>
                  </div>
                  {vSep}
                  {rowBtn(ICONS.formatPainter, '동일한 서식으로 텍스트 추가', cloneTextFormat)}
                </div>

                {hSep}
              </>)}

              {/* 아날로그 시계 색상 설정 행 */}
              {selectedEl.type === 'analogClock' && (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center', width: '100%' }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>눈금/테두리</span>
                  <input type="color"
                    value={selectedEl.clockFaceColor ?? '#ffffff'}
                    onChange={e => updateEl(selectedEl.id, { clockFaceColor: e.target.value })}
                    style={{ width: 28, height: 28, padding: 2, border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
                  {vSep}
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>시/분침</span>
                  <input type="color"
                    value={selectedEl.clockHandColor ?? '#ffffff'}
                    onChange={e => updateEl(selectedEl.id, { clockHandColor: e.target.value })}
                    style={{ width: 28, height: 28, padding: 2, border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
                  {vSep}
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>초침</span>
                  <input type="color"
                    value={selectedEl.clockSecondColor ?? '#ef4444'}
                    onChange={e => updateEl(selectedEl.id, { clockSecondColor: e.target.value })}
                    style={{ width: 28, height: 28, padding: 2, border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
                  {vSep}
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>배경</span>
                  <input type="color"
                    value={!selectedEl.clockBgColor || selectedEl.clockBgColor === 'transparent' ? '#ffffff' : selectedEl.clockBgColor}
                    onChange={e => updateEl(selectedEl.id, { clockBgColor: e.target.value })}
                    disabled={!selectedEl.clockBgColor || selectedEl.clockBgColor === 'transparent'}
                    style={{ width: 28, height: 28, padding: 2, border: '1px solid var(--color-border)', borderRadius: 4, cursor: !selectedEl.clockBgColor || selectedEl.clockBgColor === 'transparent' ? 'default' : 'pointer', flexShrink: 0, opacity: !selectedEl.clockBgColor || selectedEl.clockBgColor === 'transparent' ? 0.3 : 1 }} />
                  <button
                    onClick={() => {
                      const hasBg = !!selectedEl.clockBgColor && selectedEl.clockBgColor !== 'transparent'
                      updateEl(selectedEl.id, { clockBgColor: hasBg ? 'transparent' : '#ffffff' })
                    }}
                    style={{ ...S, width: 36, fontSize: 9, border: `1px solid ${!selectedEl.clockBgColor || selectedEl.clockBgColor === 'transparent' ? 'var(--color-border)' : 'var(--color-primary)'}`, background: !selectedEl.clockBgColor || selectedEl.clockBgColor === 'transparent' ? 'transparent' : 'var(--color-primary-light)', color: !selectedEl.clockBgColor || selectedEl.clockBgColor === 'transparent' ? 'var(--color-text-muted)' : 'var(--color-primary-dark)' }}>
                    {!selectedEl.clockBgColor || selectedEl.clockBgColor === 'transparent' ? '없음' : 'ON'}
                  </button>
                </div>
                {hSep}
              </>)}

              {/* Row 4 for text / only row for others: 전체 공통 툴바 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center', width: '100%' }}>
                {selectedEl.type === 'photo' && (<>
                  <button onClick={() => setCropTarget(selectedEl.id)}
                    style={{ ...S, width: 'auto', padding: '0 8px', fontSize: 11, background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
                    ✂ 크롭 / 모양
                  </button>
                  {vSep}

                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>모서리</span>
                  <input type="range" min={0} max={50} value={selectedEl.photoRadius ?? 0}
                    onChange={e => updateEl(selectedEl.id, { photoRadius: Number(e.target.value) })}
                    style={{ width: 40, height: 4, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: 'var(--color-primary-dark)', minWidth: 28, flexShrink: 0 }}>{photoRadiusPx(selectedEl.w, selectedEl.h, selectedEl.photoRadius)}px</span>
                  {vSep}

                </>)}
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>불투명도</span>
                <input type="range" min={10} max={100} value={selectedEl.opacity}
                  onChange={e => updateEl(selectedEl.id, { opacity: Number(e.target.value) })}
                  style={{ width: 52, height: 4, cursor: 'pointer', flexShrink: 0 }} />
                {vSep}
                {rowBtn(ICONS.flipH, '좌우 반전', () => updateEl(selectedEl.id, { flipH: !selectedEl.flipH }), !!selectedEl.flipH)}
                {rowBtn(ICONS.flipV, '상하 반전', () => updateEl(selectedEl.id, { flipV: !selectedEl.flipV }), !!selectedEl.flipV)}
                {vSep}
                {rowBtn(ICONS.bringFront, '맨앞으로', () => updateEl(selectedEl.id, { z: maxZ + 1 }))}
                {rowBtn(ICONS.bringForward, '앞으로', () => updateEl(selectedEl.id, { z: selectedEl.z + 1 }))}
                {rowBtn(ICONS.sendBackward, '뒤로', () => updateEl(selectedEl.id, { z: Math.max(1, selectedEl.z - 1) }))}
                {rowBtn(ICONS.sendBack, '맨뒤로', () => updateEl(selectedEl.id, { z: 1 }))}
                {rowBtn(selectedEl.locked ? ICONS.unlock : ICONS.lock, selectedEl.locked ? '잠금 해제' : '잠금', () => updateEl(selectedEl.id, { locked: !selectedEl.locked }), !!selectedEl.locked)}
                {vSep}
                <button onClick={deleteSelected} title="삭제"
                  style={{ ...S, border: '1px solid #fbbbd4', color: '#e03060' }}>{ICONS.trash}</button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Crop modal */}
      {cropTarget && (() => {
        const el = data.elements.find(e => e.id === cropTarget)
        if (!el) return null
        return (
          <CropModal
            src={el.content}
            frameW={el.w}
            frameH={el.h}
            initialShape={el.clipShape}
            initialBorderRadius={el.photoRadius ?? 0}
            customShapes={customShapes}
            onConfirm={(croppedUrl, shape, newSize, borderRadius) => {
              updateEl(cropTarget, {
                content: croppedUrl,
                clipShape: shape,
                ...(newSize ? { w: newSize.w, h: newSize.h } : {}),
                photoRadius: borderRadius ?? 0,
              })
              setCropTarget(null)
            }}
            onAddCustomShape={addCustomShape}
            onCancel={() => setCropTarget(null)}
          />
        )
      })()}

      <RandomStudentPicker
        key={dateStr}
        lists={studentLists}
        position={randomPickerPosition}
        onPositionChange={setRandomPickerPosition}
        size={randomPickerSize}
        onSizeChange={setRandomPickerSize}
        visible={showRandomPicker}
        selected={randomPickerSelected}
        onSelect={() => {
          setRandomPickerSelected(true)
          setSelectedId(null)
          setMultiIds([])
        }}
        onClose={() => {
          setShowRandomPicker(false)
          setRandomPickerSelected(false)
        }}
        z={randomPickerZ}
        maxZ={maxZ}
        onBringFront={() => setRandomPickerZ(maxZ + 1)}
        onSendBack={() => setRandomPickerZ(0)}
        onMoveForward={() => setRandomPickerZ(z => z + 1)}
        onMoveBack={() => setRandomPickerZ(z => Math.max(0, z - 1))}
        initialResult={pickerInitResult}
        onResultChange={result => api.settings.set(`pickerWidget_${dateStr}`, JSON.stringify({ ...result, position: randomPickerPosition, size: randomPickerSize, z: randomPickerZ }))}
      />

      <GroupMaker
        lists={studentLists}
        position={groupMakerPosition}
        onPositionChange={setGroupMakerPosition}
        size={groupMakerSize}
        onSizeChange={setGroupMakerSize}
        visible={showGroupMaker}
        selected={groupMakerSelected}
        onSelect={() => { setGroupMakerSelected(true); setSelectedId(null); setMultiIds([]) }}
        onClose={() => { setShowGroupMaker(false); setGroupMakerSelected(false) }}
        z={groupMakerZ}
        maxZ={maxZ}
        onBringFront={() => setGroupMakerZ(maxZ + 1)}
        onSendBack={() => setGroupMakerZ(0)}
        onMoveForward={() => setGroupMakerZ(z => z + 1)}
        onMoveBack={() => setGroupMakerZ(z => Math.max(0, z - 1))}
        initialResult={groupInitResult}
        onResultChange={result => api.settings.set(`groupWidget_${dateStr}`, JSON.stringify({ ...result, position: groupMakerPosition, size: groupMakerSize, z: groupMakerZ }))}
      />

      {exportPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, visibility: capturing === null ? 'visible' : 'hidden', pointerEvents: capturing === null ? 'auto' : 'none' }}
          onClick={() => setExportPreview(null)}>
          <div style={{ background: 'var(--color-bg)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: '90%', maxHeight: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>내보내기 미리보기</p>
              <button onClick={() => setExportPreview(null)} style={{ fontSize: 18, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflow: 'auto', borderRadius: 8, border: '1px solid var(--color-border)', background: '#888' }}>
              <img src={exportPreview.dataUrl} alt="미리보기" draggable={false}
                style={{ display: 'block', maxWidth: '70vw', maxHeight: '60vh', objectFit: 'contain' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, flex: 1, background: 'var(--color-primary-light)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>파일명</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exportPreview.filename}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setExportPreview(null)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                취소
              </button>
              <button onClick={async () => {
                const b64 = exportPreview.dataUrl.split(',')[1]
                setExportPreview(null)
                await api.export.savePng(b64, exportPreview.filename)
              }}
                style={{ flex: 2, padding: '8px 0', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
