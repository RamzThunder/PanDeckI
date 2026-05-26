import React, { useEffect, useState, useCallback, useRef } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { api } from '../api'
import { toLocalDate } from '../store/diary'
import StickerPicker from '../components/StickerPicker'
import CropModal, { CustomShape } from '../components/CropModal'
import TemplateModal from '../components/TemplateModal'
import ReactMarkdown from 'react-markdown'
interface Props {
  currentDate: Date
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  systemFonts: string[]
  globalFont: string
  mosaicIntensity: number
  blurIntensity: number
  diaryName: string
}

export interface CanvasEl {
  id: string
  type: 'text' | 'sticker' | 'photo' | 'card' | 'video' | 'markdown'
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
  cardType?: string
  cardData?: Record<string, string>
  templateId?: string
  templateData?: Record<string, any>
  groupId?: string
  locked?: boolean
  flipH?: boolean
  flipV?: boolean
  isGhost?: boolean
  ghostMode?: 'exclude' | 'mosaic' | 'blur'
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

function getGhostMode(el: CanvasEl): 'exclude' | 'mosaic' | 'blur' | undefined {
  return el.ghostMode ?? (el.isGhost ? 'exclude' : undefined)
}

function applyMosaicExport(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, elX: number, elY: number, elW: number, elH: number, dpr: number, pixelSize = 14) {
  const px = Math.max(0, Math.floor(elX * dpr))
  const py = Math.max(0, Math.floor(elY * dpr))
  const pw = Math.min(Math.ceil(elW * dpr), canvas.width - px)
  const ph = Math.min(Math.ceil(elH * dpr), canvas.height - py)
  if (pw <= 0 || ph <= 0) return
  const smallW = Math.max(1, Math.floor(pw / pixelSize))
  const smallH = Math.max(1, Math.floor(ph / pixelSize))
  const imgData = ctx.getImageData(px, py, pw, ph)
  const tempC = document.createElement('canvas')
  tempC.width = pw; tempC.height = ph
  tempC.getContext('2d')!.putImageData(imgData, 0, 0)
  const smallC = document.createElement('canvas')
  smallC.width = smallW; smallC.height = smallH
  const sctx = smallC.getContext('2d')!
  sctx.drawImage(tempC, 0, 0, smallW, smallH)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(smallC, px, py, pw, ph)
  ctx.restore()
}
// 수평 box blur (슬라이딩 윈도우, O(w*h))
function boxBlurH(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
  const iarr = 1 / (r + r + 1)
  for (let y = 0; y < h; y++) {
    const base = y * w
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0
    for (let j = -r; j <= r; j++) {
      const xi = Math.max(0, Math.min(w - 1, j))
      const i = (base + xi) * 4
      a0 += src[i]; a1 += src[i+1]; a2 += src[i+2]; a3 += src[i+3]
    }
    for (let x = 0; x < w; x++) {
      const idx = (base + x) * 4
      dst[idx] = a0 * iarr; dst[idx+1] = a1 * iarr; dst[idx+2] = a2 * iarr; dst[idx+3] = a3 * iarr
      const addIdx = (base + Math.min(w - 1, x + r + 1)) * 4
      const remIdx = (base + Math.max(0, x - r)) * 4
      a0 += src[addIdx] - src[remIdx]; a1 += src[addIdx+1] - src[remIdx+1]
      a2 += src[addIdx+2] - src[remIdx+2]; a3 += src[addIdx+3] - src[remIdx+3]
    }
  }
}
// 수직 box blur
function boxBlurV(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number) {
  const iarr = 1 / (r + r + 1)
  for (let x = 0; x < w; x++) {
    let a0 = 0, a1 = 0, a2 = 0, a3 = 0
    for (let j = -r; j <= r; j++) {
      const yi = Math.max(0, Math.min(h - 1, j))
      const i = (yi * w + x) * 4
      a0 += src[i]; a1 += src[i+1]; a2 += src[i+2]; a3 += src[i+3]
    }
    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * 4
      dst[idx] = a0 * iarr; dst[idx+1] = a1 * iarr; dst[idx+2] = a2 * iarr; dst[idx+3] = a3 * iarr
      const addIdx = (Math.min(h - 1, y + r + 1) * w + x) * 4
      const remIdx = (Math.max(0, y - r) * w + x) * 4
      a0 += src[addIdx] - src[remIdx]; a1 += src[addIdx+1] - src[remIdx+1]
      a2 += src[addIdx+2] - src[remIdx+2]; a3 += src[addIdx+3] - src[remIdx+3]
    }
  }
}
// 3-pass box blur + 소프트 페더링. 캡처 영역을 r픽셀 확장 후 blur, cosine 마스크로 합성.
function applyBlurExport(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, elX: number, elY: number, elW: number, elH: number, dpr: number, blurPx: number) {
  const r = Math.max(1, Math.round(blurPx * dpr))
  // 요소 물리 픽셀 경계
  const ex = Math.floor(elX * dpr)
  const ey = Math.floor(elY * dpr)
  const ew = Math.ceil(elW * dpr)
  const eh = Math.ceil(elH * dpr)
  // r픽셀 확장 (페더링 번짐 공간)
  const px = Math.max(0, ex - r)
  const py = Math.max(0, ey - r)
  const pw = Math.min(canvas.width - px, ew + 2 * r)
  const ph = Math.min(canvas.height - py, eh + 2 * r)
  if (pw <= 0 || ph <= 0) return

  // 원본 픽셀 저장 (마스크 합성용)
  const origData = ctx.getImageData(px, py, pw, ph)
  const blurBuf = new Uint8ClampedArray(origData.data)
  const tmp = new Uint8ClampedArray(blurBuf.length)
  boxBlurH(blurBuf, tmp, pw, ph, r); boxBlurV(tmp, blurBuf, pw, ph, r)
  boxBlurH(blurBuf, tmp, pw, ph, r); boxBlurV(tmp, blurBuf, pw, ph, r)
  boxBlurH(blurBuf, tmp, pw, ph, r); boxBlurV(tmp, blurBuf, pw, ph, r)

  // 소프트 마스크: 요소 내부=100% blur, 경계~외곽 r픽셀=cosine fade, 외부=0%
  const orig = origData.data
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const cx = px + x, cy = py + y
      // 요소 경계까지의 부호 있는 거리 (양수=내부, 음수=외부)
      const dx = Math.min(cx - ex, ex + ew - 1 - cx)
      const dy = Math.min(cy - ey, ey + eh - 1 - cy)
      const dist = Math.min(dx, dy)
      const a = dist >= 0 ? 1 : dist <= -r ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (-dist) / r)
      const i = (y * pw + x) * 4
      orig[i]   = blurBuf[i]   * a + orig[i]   * (1 - a)
      orig[i+1] = blurBuf[i+1] * a + orig[i+1] * (1 - a)
      orig[i+2] = blurBuf[i+2] * a + orig[i+2] * (1 - a)
      orig[i+3] = blurBuf[i+3] * a + orig[i+3] * (1 - a)
    }
  }

  const tmpC = document.createElement('canvas')
  tmpC.width = pw; tmpC.height = ph
  tmpC.getContext('2d')!.putImageData(origData, 0, 0)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(tmpC, px, py)
  ctx.restore()
}

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
  if (type === 'card')    return { ...base, w: 300, h: 220 }
  if (type === 'video')    return { ...base, w: 480, h: 270 }
  if (type === 'markdown') return { ...base, w: 280, h: 160, bgOpacity: 80 }
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
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
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
  grid:       <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18 M3 15h18 M9 3v18 M15 3v18"/></svg>,
  magnet:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 21h-4v-9c0-2.76-2.24-5-5-5s-5 2.24-5 5v9H3v-9c0-4.97 4.03-9 9-9s9 4.03 9 9v9z"/><path d="M3 16h4 M17 16h4"/></svg>,
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
  ghost: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>,
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

export default function DailyView({ currentDate, onPrev, onNext, onToday, systemFonts, globalFont, mosaicIntensity, blurIntensity, diaryName }: Props): JSX.Element {
  const dateStr = toLocalDate(currentDate)
  const [data, setData] = useState<DailyData>(DEFAULT_DATA)
  const [saved, setSaved] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [multiIds, setMultiIds] = useState<string[]>([])
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showStickers, setShowStickers] = useState(false)
  const [showVideoMenu, setShowVideoMenu] = useState(false)
  const [showGhostMenu, setShowGhostMenu] = useState(false)
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
  const [showTemplate, setShowTemplate] = useState(false)
  const [editingTemplateElId, setEditingTemplateElId] = useState<string | null>(null)

  // Background inputs
  const [bgHexInput, setBgHexInput] = useState(DEFAULT_DATA.bg)
  const [bgCustomColors, setBgCustomColors] = useState<string[]>(['', '', ''])

  // Text color / border color / bg color inputs (local drafts to allow partial typing)
  const [textColorInput, setTextColorInput] = useState('')
  const [borderColorInput, setBorderColorInput] = useState('#333333')
  const [bgColorInput, setBgColorInput] = useState('#ffffff')

  const [showGrid, setShowGrid] = useState(false)
  const [useSnap,  setUseSnap]  = useState(false)
  const [ghostPreview, setGhostPreview] = useState(true)
  const snapRef = useRef(false)
  useEffect(() => { snapRef.current = useSnap }, [useSnap])

  const canvasRef        = useRef<HTMLDivElement>(null)
  const dataRef          = useRef(data)
  dataRef.current        = data
  const opRef            = useRef<ActiveOp | null>(null)
  const justMarqueedRef  = useRef(false)
  const elClipboardRef   = useRef<CanvasEl[]>([])
  const persistRef    = useRef<(d: DailyData) => Promise<void>>(() => Promise.resolve())
  const exportRef     = useRef<() => Promise<void>>(() => Promise.resolve())
  const [exportPreview, setExportPreview] = useState<{ dataUrl: string; filename: string; privacy: boolean } | null>(null)
  const [youtubePort, setYoutubePort] = useState(0)
  const historyRef    = useRef<DailyData[]>([])
  const historyIdxRef = useRef(-1)

  const dateLabel = currentDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

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

  const buildExportDataUrl = useCallback(async (privacy: boolean): Promise<string> => {
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
    for (const el of [...d.elements].filter(el => !privacy || getGhostMode(el) !== 'exclude').sort((a, b) => a.z - b.z)) {
      if (el.type === 'video') continue
      const gm = privacy ? getGhostMode(el) : undefined
      ctx.save()
      ctx.globalAlpha = el.opacity / 100
      ctx.translate(el.x + el.w / 2, el.y + el.h / 2)
      ctx.rotate((el.rotation * Math.PI) / 180)
      ctx.translate(-el.w / 2, -el.h / 2)
      if (el.type === 'text') {
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
        ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${fs}px ${el.fontFamily}`
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
              const r = Math.min(el.w, el.h) * (el.photoRadius ?? 0) / 100
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
      if (gm === 'mosaic') applyMosaicExport(ctx, offscreen, el.x, el.y, el.w, el.h, dpr, mosaicIntensity)
      if (gm === 'blur')   applyBlurExport(ctx, offscreen, el.x, el.y, el.w, el.h, dpr, blurIntensity)
    }
    return offscreen.toDataURL('image/png')
  }, [customShapes, mosaicIntensity, blurIntensity])

  const exportToPNG = useCallback(async () => {
    const dataUrl = await buildExportDataUrl(true)
    if (!dataUrl) return
    const now = new Date()
    const yy  = String(now.getFullYear()).slice(2)
    const mm  = String(now.getMonth() + 1).padStart(2, '0')
    const dd  = String(now.getDate()).padStart(2, '0')
    const hh  = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const safeName = (diaryName || 'dida').replace(/\s+/g, '_')
    const filename = `${safeName}_${yy}${mm}${dd}_${hh}${min}.png`
    setExportPreview({ dataUrl, filename, privacy: true })
  }, [buildExportDataUrl, diaryName])
  exportRef.current = exportToPNG

  useEffect(() => {
    const onManualSave = () => { persistRef.current(dataRef.current) }
    const onExportPng  = () => { exportRef.current().catch(() => {}) }
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
        op.dx = e.clientX - op.sx
        op.dy = e.clientY - op.sy
        for (const id of op.ids) {
          const orig = op.origPositions[id]
          if (!orig || !canvas) continue
          const elNode = canvas.querySelector<HTMLElement>(`[data-id="${id}"]`)
          if (!elNode) continue
          const elData = dataRef.current.elements.find(x => x.id === id)
          if (!elData) continue
          const sg = (v: number) => snapRef.current ? Math.round(v / 10) * 10 : v
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
        const dx = e.clientX - op.sx
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
        const dx = e.clientX - op.sx, dy = e.clientY - op.sy
        const sg = (v: number) => snapRef.current ? Math.round(v / 10) * 10 : v
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
        const dx = e.clientX - op.sx, dy = e.clientY - op.sy
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
        const scale = Math.max(0.1, (op.bw + (_e.clientX - op.sx)) / op.bw)
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
    const lockAspect = el.type === 'photo' || el.type === 'sticker' || el.type === 'video'
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
    <div className="flex flex-col h-full select-none" style={canvasBgStyle}
      onClick={e => {
        if (e.metaKey || e.ctrlKey) return
        if (justMarqueedRef.current) { justMarqueedRef.current = false; return }
        setSelectedId(null); setMultiIds([]); setEditingId(null); setShowStickers(false); setShowFontList(false); setShowFontSizeList(false); setShowVideoMenu(false); setShowGhostMenu(false)
      }}>

      {/* SVG defs — clip-path + ghost filters */}
      <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <filter id="pixelate-filter" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feFlood x={Math.round(mosaicIntensity * 0.35)} y={Math.round(mosaicIntensity * 0.35)} height="2" width="2"/>
            <feComposite width={mosaicIntensity} height={mosaicIntensity}/>
            <feTile result="a"/>
            <feComposite in="SourceGraphic" in2="a" operator="in"/>
            <feMorphology operator="dilate" radius={Math.round(mosaicIntensity / 2)}/>
          </filter>
          <clipPath id="clip-heart" clipPathUnits="objectBoundingBox">
            <path d="M0.5,0.3 C0.5,0.1 0.75,0.05 0.875,0.2 C1,0.35 1,0.6 0.875,0.75 L0.5,1 L0.125,0.75 C0,0.6 0,0.35 0.125,0.2 C0.25,0.05 0.5,0.1 0.5,0.3 Z" />
          </clipPath>
          <clipPath id="clip-star" clipPathUnits="objectBoundingBox">
            <polygon points="0.5,0 0.61,0.35 0.98,0.35 0.68,0.57 0.79,0.91 0.5,0.70 0.21,0.91 0.32,0.57 0.02,0.35 0.39,0.35" />
          </clipPath>
        </defs>
      </svg>

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.75)' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onPrev} className="text-sm px-3 py-1 rounded-full hover:opacity-70" style={{ color: 'var(--color-primary-dark)' }}>‹ 전 날</button>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>{dateLabel}</h2>
          <button onClick={onToday} className="text-xs px-2 py-0.5 rounded-full hover:opacity-70" style={{ color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary-dark)' }}>오늘</button>
          {saved && <span className="text-xs" style={{ color: 'var(--color-primary-dark)' }}>저장됨 ✓</span>}
        </div>
        <button onClick={onNext} className="text-sm px-3 py-1 rounded-full hover:opacity-70" style={{ color: 'var(--color-primary-dark)' }}>다음 날 ›</button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-3 shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.88)', height: 44 }}
        onClick={e => e.stopPropagation()}>

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
          <button onClick={() => setShowStickers(v => !v)} className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
            style={{ background: showStickers ? 'var(--color-primary)' : 'var(--color-primary-light)', color: showStickers ? '#fff' : 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
            스티커
          </button>
          {showStickers && <StickerPicker onSelect={addSticker} onClose={() => setShowStickers(false)} />}
        </div>
        <button onClick={addPhoto} className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>사진</button>
        <div className="relative">
          <button onClick={() => { setShowVideoMenu(v => !v); setShowVideoUrlInput(false); setVideoUrlInput('') }}
            className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
            style={{ background: showVideoMenu ? 'var(--color-primary)' : 'var(--color-primary-light)', color: showVideoMenu ? '#fff' : 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>
            동영상
          </button>
          {showVideoMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 rounded-xl shadow-xl overflow-hidden"
              style={{ background: '#fff', border: '1px solid var(--color-border)', minWidth: 150 }}
              onClick={e => e.stopPropagation()}>
              {!showVideoUrlInput ? (<>
                <button onClick={() => setShowVideoUrlInput(true)}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-pink-50"
                  style={{ color: 'var(--color-text)' }}>링크로 추가</button>
                <button onClick={addVideoLocal}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-pink-50"
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
        <button onClick={() => setShowTemplate(true)} className="text-xs px-2.5 py-1 rounded-full font-medium hover:opacity-80"
          style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary)' }}>스크랩</button>
        <div className="w-px self-stretch mx-0.5" style={{ background: 'var(--color-border)' }} />

        {/* Canvas background */}
        <div className="flex items-center gap-1.5 flex-wrap h-7">
          <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>배경</span>

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
        <div className="w-px self-stretch mx-0.5" style={{ background: 'var(--color-border)' }} />

        {/* Grid / Snap */}
        <button onClick={() => setShowGrid(v => !v)} title="그리드"
          style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${showGrid ? 'var(--color-primary)' : 'var(--color-border)'}`, background: showGrid ? 'var(--color-primary-light)' : 'transparent', color: showGrid ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', cursor: 'pointer' }}>
          <span style={{ display: 'flex', transform: 'scale(0.78)', transformOrigin: 'center' }}>{ICONS.grid}</span>
        </button>
        <button onClick={() => setUseSnap(v => !v)} title="자석 스냅"
          style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${useSnap ? 'var(--color-primary)' : 'var(--color-border)'}`, background: useSnap ? 'var(--color-primary-light)' : 'transparent', color: useSnap ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', cursor: 'pointer' }}>
          <span style={{ display: 'flex', transform: 'scale(0.78)', transformOrigin: 'center' }}>{ICONS.magnet}</span>
        </button>
        <button onClick={() => setGhostPreview(v => !v)} title={ghostPreview ? '유령 미리보기 끄기' : '유령 미리보기 켜기'}
          style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${ghostPreview ? 'var(--color-primary)' : 'var(--color-border)'}`, background: ghostPreview ? 'var(--color-primary-light)' : 'transparent', color: ghostPreview ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', cursor: 'pointer' }}>
          {ghostPreview
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/><path d="M9 10h.01M15 10h.01" strokeWidth="3"/><path d="M9.5 13 Q12 16 14.5 13"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/><path d="M9 9l6 2m0-2l-6 2"/><path d="M10.5 14h3"/></svg>
          }
        </button>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="flex-1 relative overflow-hidden" style={canvasBgStyle}
        onPointerDown={startMarquee}>

        {/* Grid overlay */}
        {showGrid && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9998,
            backgroundImage: 'linear-gradient(to right, rgba(100,100,200,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,100,200,0.12) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
        )}

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
          const gm = getGhostMode(el)
          const interactiveUrl: string | null =
            el.type === 'video' && el.videoType === 'embed' ? el.content :
            el.type === 'card' && el.cardType === 'tweet' ? (el.cardData?.url ?? null) :
            (el.linkUrl ?? null)

          return (
            <div key={el.id} data-id={el.id}
              style={{
                position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h, zIndex: el.z,
                transform: `rotate(${el.rotation}deg) scaleX(${el.flipH ? -1 : 1}) scaleY(${el.flipV ? -1 : 1})`,
                outline: (isSel || multiIds.includes(el.id)) ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
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
                if (el.type === 'photo' && el.templateId) {
                  setEditingTemplateElId(el.id)
                  setShowTemplate(true)
                }
              }}
              onClick={e => e.stopPropagation()}>

              <div style={{
                width: '100%', height: '100%', opacity: el.opacity / 100,
                position: 'relative',
                ...clipStyle,
                overflow: (el.type === 'photo' || (el.type === 'text' && textRad > 0) || el.type === 'markdown') ? 'hidden' : undefined,
                borderRadius: el.type === 'photo'
                  ? (el.clipShape === 'none' ? `${el.photoRadius ?? 0}%` : 0)
                  : (el.type === 'text' || el.type === 'markdown') ? `${textRad}px` : 0,
                filter: ghostPreview && gm === 'blur' ? `blur(${blurIntensity}px)` : ghostPreview && gm === 'mosaic' ? "url('#pixelate-filter')" : undefined,
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

                {el.type === 'card' && el.cardType === 'tweet' && (
                  <TweetCard data={el.cardData ?? {}} w={el.w} h={el.h} />
                )}

                {interactiveUrl && el.type !== 'video' && <InteractiveOverlay url={interactiveUrl} cmdHeld={cmdHeld} />}
              </div>

              {isSel && !isEdit && (<>
                <div onPointerDown={e => startRotate(e, el.id)} onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', width: 20, height: 20, borderRadius: '50%', zIndex: 99, cursor: 'grab', background: 'var(--color-primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>↻</div>
                <div onPointerDown={e => startResize(e, el.id)} onClick={e => e.stopPropagation()}
                  style={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, borderRadius: '50%', zIndex: 99, cursor: 'se-resize', background: 'var(--color-primary-dark)' }} />
              </>)}
            </div>
          )
        })}

        {/* Ghost mode outlines — rendered above all elements */}
        {ghostPreview && [...data.elements].map(el => {
          const gm = getGhostMode(el)
          if (!gm || el.id === selectedId || multiIds.includes(el.id)) return null
          return (
            <div key={`gm-outline-${el.id}`} style={{
              position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h,
              transform: `rotate(${el.rotation}deg) scaleX(${el.flipH ? -1 : 1}) scaleY(${el.flipV ? -1 : 1})`,
              outline: '1.5px dashed rgba(130,80,200,0.5)',
              outlineOffset: 2,
              pointerEvents: 'none',
              zIndex: 99990,
            }} />
          )
        })}

        {/* Marquee selection overlay */}
        {marqueeRect && (
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
          const minX = Math.min(...selEls.map(el => el.x))
          const maxX = Math.max(...selEls.map(el => el.x + el.w))
          const minY = Math.min(...selEls.map(el => el.y))
          const maxY = Math.max(...selEls.map(el => el.y + el.h))
          const boxW = maxX - minX, boxH = maxY - minY

          const TOOLBAR_H = 44, TOOLBAR_W = 610
          let top = maxY + 10
          if (top + TOOLBAR_H > ch - 8) top = minY - TOOLBAR_H - 10
          top = Math.max(4, top)
          let left = minX
          if (left + TOOLBAR_W > cw - 8) left = cw - TOOLBAR_W - 8
          left = Math.max(4, left)

          const mBtn = (icon: React.ReactNode, title: string, onClick: () => void, active?: boolean) => (
            <button onClick={onClick} title={title} style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`, background: active ? 'var(--color-primary)' : 'transparent', color: active ? '#fff' : 'var(--color-text-muted)' }}>{icon}</button>
          )
          const sep = <div style={{ width: 1, height: 20, background: 'var(--color-border)', margin: '0 2px' }} />

          const allGrouped = selEls.length > 1 && selEls.every(el => el.groupId && el.groupId === selEls[0].groupId)
          const allLocked  = selEls.every(el => !!el.locked)
          const multiGhostMode = (selEls.every(el => getGhostMode(el) === 'exclude') ? 'exclude' : selEls.every(el => getGhostMode(el) === 'mosaic') ? 'mosaic' : selEls.every(el => getGhostMode(el) === 'blur') ? 'blur' : undefined)
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
            <div style={{ position: 'absolute', top, left, zIndex: 9000, background: '#fff', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
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
              {sep}
              {(() => {
                const GHOST_COLOR = '#9c59d1'
                const activeColor = multiGhostMode ? GHOST_COLOR : undefined
                return (
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button title="유령 모드 (우클릭: 해제)" onClick={e => { e.stopPropagation(); setShowGhostMenu(v => !v) }}
                      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); const next = { ...dataRef.current, elements: dataRef.current.elements.map(el => multiIds.includes(el.id) ? { ...el, ghostMode: undefined, isGhost: undefined } : el) }; setData(next); persistRef.current(next); setShowGhostMenu(false) }}
                      style={{ width: 28, height: 28, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: `1px solid ${activeColor ?? 'var(--color-border)'}`, background: activeColor ?? 'transparent', color: activeColor ? '#fff' : 'var(--color-text-muted)' }}>
                      {ICONS.ghost}
                    </button>
                    {showGhostMenu && (
                      <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '4px', display: 'flex', flexDirection: 'column', gap: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 88 }}>
                        {([
                          { key: 'exclude' as const, label: '제외' },
                          { key: 'mosaic'  as const, label: '모자이크' },
                          { key: 'blur'    as const, label: '블러' },
                        ]).map(m => (
                          <button key={m.key} onClick={e => { e.stopPropagation(); const next = { ...dataRef.current, elements: dataRef.current.elements.map(el => multiIds.includes(el.id) ? { ...el, ghostMode: multiGhostMode === m.key ? undefined : m.key, isGhost: undefined } : el) }; setData(next); persistRef.current(next); setShowGhostMenu(false) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: multiGhostMode === m.key ? 700 : 400, background: multiGhostMode === m.key ? GHOST_COLOR : 'transparent', color: multiGhostMode === m.key ? '#fff' : 'var(--color-text)', textAlign: 'left' }}>
                            <span style={{ opacity: multiGhostMode === m.key ? 1 : 0.4, display: 'flex' }}>{ICONS.ghost}</span>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
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
          const ch = canvasRef.current?.clientHeight ?? 900 // 👈 캔버스 높이
          const cw = canvasRef.current?.clientWidth ?? 1600 // 👈 캔버스 너비
          
          const TOOLBAR_H = selectedEl.type === 'text' ? 158 : 44
          const TOOLBAR_W = selectedEl.type === 'text'
              ? 500
              : selectedEl.type === 'photo'
                ? 600
                : 410
                
          // 1. 기본 위치: 개체 아래쪽 (+20px 여유)
          let top = selectedEl.y + selectedEl.h + 20
          
          // 2. 캔버스 하단에서 잘릴 것 같으면 개체 위쪽으로 확 뒤집기! (ch 기준)
          // (위쪽 회전 핸들 -28px을 피하기 위해 -35px 공간 확보)
          if (top + TOOLBAR_H > ch - 20) {
            top = selectedEl.y - TOOLBAR_H - 35
          }
          
          // 3. 위로 뒤집었는데도 캔버스 맨 위를 뚫고 나간다면 강제로 상단 고정
          if (top < 10) top = 10
          
          // 4. 가로 위치 보정
          let left = selectedEl.x
          if (left + TOOLBAR_W > cw - 8) left = cw - TOOLBAR_W - 8
          left = Math.max(10, left)

          const S = { width: 28, height: 28, borderRadius: 6, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 } as const
          const rowBtn = (icon: React.ReactNode, title: string, onClick: () => void, active?: boolean) => (
            <button onClick={onClick} title={title} style={{ ...S, border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`, background: active ? 'var(--color-primary)' : 'transparent', color: active ? '#fff' : 'var(--color-text-muted)' }}>{icon}</button>
          )
          const vSep = <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-border)', flexShrink: 0, margin: '0 1px' }} />
          const hSep = <div style={{ height: 1, background: 'var(--color-border)' }} />

          return (
            <div style={{ position: 'absolute', top, left, zIndex: 9000, background: '#fff', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4, width: TOOLBAR_W }}
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
                  <span style={{ fontSize: 10, color: 'var(--color-primary-dark)', minWidth: 22, flexShrink: 0 }}>{selectedEl.photoRadius ?? 0}%</span>
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
                {vSep}
                {(() => {
                  const curGm = getGhostMode(selectedEl)
                  const GHOST_COLOR = '#9c59d1'
                  return (
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button title="유령 모드 (우클릭: 해제)" onClick={e => { e.stopPropagation(); setShowGhostMenu(v => !v) }}
                        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); updateEl(selectedEl.id, { ghostMode: undefined, isGhost: undefined }); setShowGhostMenu(false) }}
                        style={{ ...S, border: `1px solid ${curGm ? GHOST_COLOR : 'var(--color-border)'}`, background: curGm ? GHOST_COLOR : 'transparent', color: curGm ? '#fff' : 'var(--color-text-muted)' }}>
                        {ICONS.ghost}
                      </button>
                      {showGhostMenu && (
                        <div style={{ position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '4px', display: 'flex', flexDirection: 'column', gap: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 88 }}>
                          {(['exclude', 'mosaic', 'blur'] as const).map(key => (
                            <button key={key} onClick={e => { e.stopPropagation(); updateEl(selectedEl.id, { ghostMode: curGm === key ? undefined : key, isGhost: undefined }); setShowGhostMenu(false) }}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: curGm === key ? 700 : 400, background: curGm === key ? GHOST_COLOR : 'transparent', color: curGm === key ? '#fff' : 'var(--color-text)', textAlign: 'left' }}>
                              <span style={{ opacity: curGm === key ? 1 : 0.4, display: 'flex' }}>{ICONS.ghost}</span>
                              {key === 'exclude' ? '제외' : key === 'mosaic' ? '모자이크' : '블러'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
                {rowBtn(selectedEl.locked ? ICONS.unlock : ICONS.lock, selectedEl.locked ? '잠금 해제' : '잠금', () => updateEl(selectedEl.id, { locked: !selectedEl.locked }), !!selectedEl.locked)}
                {vSep}
                <button onClick={deleteSelected} title="삭제"
                  style={{ ...S, border: '1px solid #fbbbd4', color: '#e03060' }}>{ICONS.trash}</button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Template modal */}
      {showTemplate && (() => {
        const editEl = editingTemplateElId ? dataRef.current.elements.find(e => e.id === editingTemplateElId) : null
        const editMode = editEl?.templateId
          ? { templateId: editEl.templateId as any, data: editEl.templateData as any }
          : undefined
        return (
          <TemplateModal
            globalFont={globalFont}
            systemFonts={systemFonts}
            editMode={editMode}
            onConfirm={(dataUrl, w, h, linkUrl, tplId, tplData) => {
              if (editingTemplateElId) {
                const next = {
                  ...dataRef.current,
                  elements: dataRef.current.elements.map(e =>
                    e.id === editingTemplateElId
                      ? { ...e, content: dataUrl, w, h, linkUrl: linkUrl ?? e.linkUrl, templateData: tplData }
                      : e
                  )
                }
                setData(next); persistRef.current(next); setSelectedId(editingTemplateElId)
              } else {
                const c = canvasRef.current
                const cx = c ? Math.max(0, c.clientWidth / 2 - w / 2) : 60
                const cy = c ? Math.max(0, c.clientHeight / 2 - h / 2) : 60
                const mz = dataRef.current.elements.reduce((m, e) => Math.max(m, e.z), 0)
                const el = {
                  ...makeEl('photo', cx, cy, dataUrl, mz), w, h,
                  ...(linkUrl ? { linkUrl } : {}),
                  ...(tplId ? { templateId: tplId, templateData: tplData } : {}),
                }
                const next = { ...dataRef.current, elements: [...dataRef.current.elements, el] }
                setData(next); persistRef.current(next); setSelectedId(el.id)
              }
              setShowTemplate(false); setEditingTemplateElId(null)
            }}
            onCancel={() => { setShowTemplate(false); setEditingTemplateElId(null) }}
          />
        )
      })()}

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

      {exportPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}
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
              <button
                onClick={async () => {
                  const nextPrivacy = !exportPreview.privacy
                  const dataUrl = await buildExportDataUrl(nextPrivacy)
                  if (dataUrl) setExportPreview(prev => prev ? { ...prev, dataUrl, privacy: nextPrivacy } : null)
                }}
                title={exportPreview.privacy ? '프라이버시 필터 켜짐 (클릭하여 끄기)' : '프라이버시 필터 꺼짐 (클릭하여 켜기)'}
                style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: `1px solid ${exportPreview.privacy ? 'var(--color-primary)' : 'var(--color-border)'}`, background: exportPreview.privacy ? 'var(--color-primary)' : 'transparent', color: exportPreview.privacy ? '#fff' : 'var(--color-text-muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                {exportPreview.privacy ? '필터 켜짐' : '필터 꺼짐'}
              </button>
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
