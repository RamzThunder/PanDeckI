import React, { useState, useEffect } from 'react'
import { api } from '../api'
import CropModal from './CropModal'


const CropCtx = React.createContext<((src: string, frame: { w: number; h: number }) => Promise<string | null>) | null>(null)

// ── Currency ───────────────────────────────────────────────────────────────────

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

function parsePriceValue(value: string): { code: string; amount: string } {
  const sorted = [...CURRENCIES].sort((a, b) => b.symbol.length - a.symbol.length)
  for (const c of sorted) {
    if (value.startsWith(c.symbol)) return { code: c.code, amount: value.slice(c.symbol.length) }
  }
  return { code: '', amount: value }
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = 'hobby' | 'spend' | 'travel' | 'food' | 'archive' | 'style'
type TemplateId = 'baseball' | 'ticket' | 'game' | 'receipt' | 'wishlist' | 'transport' | 'checkin' | 'coffee' | 'food_note' | 'youtube' | 'quote' | 'music' | 'makeup' | 'skincare'

interface BaseballData { bgImageB64: string; away: string; homeScore: string; awayScore: string; venue: string; date: string; seat: string; memo: string; isAway: boolean; homeTeam?: string }
interface TicketData { category: '영화' | '공연' | '전시' | '기타'; title: string; date: string; time: string; venue: string; seat: string; price: string; photoB64: string }
interface GameData { screenshotB64: string; title: string; date: string; oneiner: string; frameColor: string; frameBgB64: string }
interface ReceiptItem { name: string; price: string }
interface ReceiptData { store: string; date: string; items: ReceiptItem[]; footer: string; currency?: string }
interface WishlistData { item: string; price: string; wishScore: number; photoB64: string; oneiner: string; date: string; link: string }
interface TransportData { type: 'KTX' | 'SRT' | '버스' | '지하철' | '비행기' | '기타'; typeLabel: string; from: string; to: string; date: string; departureTime: string; vehicleNumber: string; seat: string; price: string }
interface CheckinData { place: string; category: string; address: string; date: string; rating: number; purpose: string; companions: string; memo: string; link: string }
interface CoffeeData { roastery: string; bean: string; isIced: boolean; equipment: string; beanGrams: string; waterMl: string; brewTime: string; note: string }
interface FoodData { dish: string; restaurant: string; photoB64: string; date: string; comment: string; matColor: string; matImageB64: string }
interface YoutubeData { url: string; title: string; channel: string; thumbnailB64: string; channelAvatarB64: string; impression: string; date: string; duration: string }
interface QuoteData { text: string; source: string; author: string; memo: string; layout: 'manuscript' | 'quote'; manuscriptNewline?: boolean }
interface MusicData { title: string; artist: string; albumArtB64: string; lyric: string }
interface MakeupData { date: string; sun: string; base: string; shading: string; eyeShadow: string; eyeLiner: string; eyeMascara: string; underShadow: string; underMascara: string; underHighlighter: string; highlighter: string; blush: string; lip: string; mood: string; comment: string; rating: number }
interface SkincareData { date: string; time: 'AM' | 'PM'; condition: string; weather: string; toner: string; serum: string; cream: string; special: string; memo: string }
type AnyData = BaseballData | TicketData | GameData | ReceiptData | WishlistData | TransportData | CheckinData | CoffeeData | FoodData | YoutubeData | QuoteData | MusicData | MakeupData | SkincareData

interface Props {
  globalFont: string
  systemFonts: string[]
  onConfirm: (dataUrl: string, w: number, h: number, linkUrl?: string, templateId?: string, templateData?: Record<string, any>) => void
  onCancel: () => void
  editMode?: { templateId: TemplateId; data: AnyData }
}

type Imgs = Record<string, HTMLImageElement>

// ── KBO 팀 데이터 ──────────────────────────────────────────────────────────────
const KBO_TEAMS: Record<string, { label: string; color: string; color2: string }> = {
  '삼성 라이온즈': { label: 'SAMSUNG LIONS',  color: '#074CA1', color2: '#0066B3' },
  'KIA 타이거즈':  { label: 'KIA TIGERS',     color: '#EA0029', color2: '#06141F' },
  'LG 트윈스':     { label: 'LG TWINS',        color: '#C00C3F', color2: '#231F20' },
  '두산 베어스':   { label: 'DOOSAN BEARS',    color: '#1A1748', color2: '#E22531' },
  'NC 다이노스':   { label: 'NC DINOS',         color: '#315288', color2: '#C7A079' },
  '롯데 자이언츠': { label: 'LOTTE GIANTS',   color: '#041E42', color2: '#D00E31' },
  'SSG 랜더스':    { label: 'SSG LANDERS',     color: '#CE0E2D', color2: '#FAC10A' },
  'KT 위즈':       { label: 'KT WIZ',           color: '#000000', color2: '#EB1D23' },
  '한화 이글스':   { label: 'HANWHA EAGLES',  color: '#FC4E00', color2: '#07111F' },
  '키움 히어로즈': { label: 'KIWOOM HEROES',  color: '#570514', color2: '#B07F4B' },
  '상무 피닉스':   { label: 'SANGMU PHOENIX', color: '#EAB146', color2: '#2C292A' },
  '울산 웨일즈':   { label: 'ULSAN WHALES',    color: '#C70000', color2: '#060202' },
}

const WEATHER_REGIONS: Record<string, { lat: number; lng: number }> = {
  '서울': { lat: 37.5665, lng: 126.9780 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '울산': { lat: 35.5384, lng: 129.3114 },
  '수원': { lat: 37.2636, lng: 127.0286 },
  '창원': { lat: 35.2280, lng: 128.6811 },
  '전주': { lat: 35.8242, lng: 127.1480 },
  '청주': { lat: 36.6424, lng: 127.4890 },
  '제주': { lat: 33.4996, lng: 126.5312 },
}


// ── Canvas helpers ─────────────────────────────────────────────────────────────

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w * 2; c.height = h * 2
  c.style.cssText = 'position:fixed;top:-99999px;left:-99999px;pointer-events:none;'
  document.body.appendChild(c)
  const ctx = c.getContext('2d')!
  ctx.scale(2, 2)
  ctx.font = '10px sans-serif'
  return [c, ctx]
}

function finish(canvas: HTMLCanvasElement): string {
  const url = canvas.toDataURL('image/png')
  try { document.body.removeChild(canvas) } catch {}
  return url
}

function measureCtx(fontStr: string): CanvasRenderingContext2D {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  ctx.font = fontStr
  return ctx
}

async function preloadFont(fontName: string): Promise<() => void> {
  const el = document.createElement('div')
  el.style.cssText = `font-family:"${fontName}",sans-serif;position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-9999;`
  el.textContent = '가나다라마바사ABCDEFGabcdefg0123456789'
  document.body.appendChild(el)
  void el.offsetWidth
  try {
    await Promise.race([
      document.fonts.load(`bold 72px "${fontName}"`),
      new Promise(r => setTimeout(r, 300)),
    ])
  } catch {}
  await new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)))
  )
  return () => { try { document.body.removeChild(el) } catch {} }
}

function cf(font: string): string {
  return `"${font || 'Apple SD Gothic Neo'}", sans-serif`
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w }
    else cur = t
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const out = lines.slice(0, maxLines)
    let last = out[maxLines - 1]
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1)
    out[maxLines - 1] = last + '…'
    return out
  }
  return lines
}

// \n을 단락 구분으로 처리하는 wrap — 인용구 박스 등에서 사용
function wrapMultiline(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const result: string[] = []
  for (const para of text.split('\n')) {
    if (result.length >= maxLines) break
    if (!para.trim()) { result.push(''); continue }
    result.push(...wrap(ctx, para, maxW, maxLines - result.length))
  }
  return result.slice(0, maxLines)
}

async function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('load failed'))
    img.src = src
  })
}

function toDataUrl(b64: string): string {
  if (b64.startsWith('data:')) return b64
  if (b64.startsWith('/9j/')) return `data:image/jpeg;base64,${b64}`
  return `data:image/png;base64,${b64}`
}

function isColorDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

function drawCoverImg(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = img.naturalWidth * scale
  const sh = img.naturalHeight * scale
  ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh)
}

async function pickAndReadImage(): Promise<string | null> {
  return api.file.pickImage().catch(() => null)
}

// ── Draw functions ─────────────────────────────────────────────────────────────

function drawBaseball(d: BaseballData, font: string, imgs: Imgs): { dataUrl: string; w: number; h: number } {
  const W = 192, H = 516, pad = 16
  const [canvas, ctx] = mk(W, H)
  const f = cf(font)
  const PHOTO_H = 282
  const STUB_Y  = 414

  const team = KBO_TEAMS[d.homeTeam || '삼성 라이온즈'] ?? KBO_TEAMS['삼성 라이온즈']
  const tc = team.color
  const tc2 = team.color2

  // ── 상단 사진 영역 (삐져나감 방지: 1px 인셋 클리핑) ──
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(10, 1); ctx.arcTo(W - 1, 1, W - 1, 10, 9)
  ctx.lineTo(W - 1, PHOTO_H); ctx.lineTo(1, PHOTO_H); ctx.lineTo(1, 10)
  ctx.arcTo(1, 1, 10, 1, 9); ctx.closePath(); ctx.clip()

  if (imgs.bg) {
    drawCoverImg(ctx, imgs.bg, 0, 0, W, PHOTO_H)
  } else {
    const g = ctx.createLinearGradient(0, 0, W, PHOTO_H)
    g.addColorStop(0, tc); g.addColorStop(0.35, tc); g.addColorStop(1, tc2)
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, PHOTO_H)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 18
    for (let i = -PHOTO_H; i < W + PHOTO_H; i += 36) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + PHOTO_H, PHOTO_H); ctx.stroke()
    }
  }
  const ov = ctx.createLinearGradient(0, PHOTO_H - 110, 0, PHOTO_H)
  ov.addColorStop(0, 'rgba(0,0,0,0)'); ov.addColorStop(1, 'rgba(0,0,0,0.72)')
  ctx.fillStyle = ov; ctx.fillRect(0, PHOTO_H - 110, W, 110)
  ctx.restore()

  ctx.fillStyle = 'rgba(255,255,255,0.80)'; ctx.font = `8px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(team.label, pad, 10)

  // ── 상대팀 표시 (사진 우측 하단 정렬) ──
  ctx.fillStyle = '#fff'; ctx.font = `bold 18px ${f}`
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
  ctx.fillText(`vs ${(d.away || '상대팀').slice(0, 12)}`, W - pad, PHOTO_H - 14)

  // ── 중간 흰 정보 영역 (수학적 중앙 정렬) ──
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, PHOTO_H, W, STUB_Y - PHOTO_H)

  const midY1   = PHOTO_H + (STUB_Y - PHOTO_H) / 4
  const midY2   = PHOTO_H + (STUB_Y - PHOTO_H) * 3 / 4
  const centerY = PHOTO_H + (STUB_Y - PHOTO_H) / 2

  ctx.fillStyle = tc; ctx.font = `bold 12px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(d.date || '', W / 2, midY1 - 18)

  // 홈/원정 토글 연동: 우리 팀 스코어를 크고 선명하게, 상대 팀은 작고 흐리게
  const leftScore  = d.awayScore || '0'
  const rightScore = d.homeScore  || '0'

  ctx.font = `bold 26px ${f}`
  ctx.fillStyle = '#ddd'; ctx.textAlign = 'center'
  ctx.fillText(':', W / 2, midY1 + 10)

  if (d.isAway) {
    ctx.font = `bold 34px ${f}`; ctx.fillStyle = tc
    ctx.textAlign = 'right'; ctx.fillText(leftScore, W / 2 - 12, midY1 + 10)
    ctx.font = `bold 28px ${f}`; ctx.fillStyle = '#aaa'
    ctx.textAlign = 'left';  ctx.fillText(rightScore, W / 2 + 12, midY1 + 10)
  } else {
    ctx.font = `bold 28px ${f}`; ctx.fillStyle = '#aaa'
    ctx.textAlign = 'right'; ctx.fillText(leftScore, W / 2 - 12, midY1 + 10)
    ctx.font = `bold 34px ${f}`; ctx.fillStyle = tc
    ctx.textAlign = 'left';  ctx.fillText(rightScore, W / 2 + 12, midY1 + 10)
  }

  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad, centerY); ctx.lineTo(W - pad, centerY); ctx.stroke()

  ctx.fillStyle = '#888'; ctx.font = `11px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(d.venue || '경기장', W / 2, midY2 - 14)

  ctx.fillStyle = tc; ctx.font = `bold 15px ${f}`
  ctx.fillText(d.seat ? d.seat : '—', W / 2, midY2 + 8)

  // ── 절취선 ──
  ctx.setLineDash([4, 3]); ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.moveTo(12, STUB_Y); ctx.lineTo(W - 12, STUB_Y); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#f0f0f0'
  ctx.beginPath(); ctx.arc(0, STUB_Y, 9, -Math.PI / 2, Math.PI / 2); ctx.fill()
  ctx.beginPath(); ctx.arc(W, STUB_Y, 9, Math.PI / 2, -Math.PI / 2); ctx.fill()

  // ── 하단 스텁 ──
  ctx.fillStyle = '#fff'
  ctx.beginPath(); ctx.moveTo(0, STUB_Y); ctx.lineTo(W, STUB_Y)
  ctx.lineTo(W, H - 10); ctx.arcTo(W, H, W - 10, H, 10)
  ctx.lineTo(10, H); ctx.arcTo(0, H, 0, H - 10, 10)
  ctx.lineTo(0, STUB_Y); ctx.closePath(); ctx.fill()

  const sy = STUB_Y + 8
  ctx.fillStyle = tc; ctx.font = `bold 14px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText(team.label, W / 2, sy)
  ctx.fillStyle = '#aaa'; ctx.font = `9px ${f}`
  ctx.fillText(`vs  ${(d.away || '상대팀').toUpperCase()}`, W / 2, sy + 18)

  const bby = sy + 30
  const barPattern = [1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1]
  const bs = 1.6
  const totalBarW = barPattern.reduce((s, b) => s + b * bs + bs, 0) - bs
  let xi = (W - totalBarW) / 2
  ctx.fillStyle = '#111'
  for (const bw of barPattern) {
    ctx.fillRect(xi, bby, bw * bs, 28); xi += bw * bs + bs
  }
  ctx.fillStyle = '#bbb'; ctx.font = `7px ${f}`
  ctx.textAlign = 'center'
  ctx.fillText('8502050611121314', W / 2, bby + 34)

  if (d.memo) {
    ctx.fillStyle = '#888'; ctx.font = `10px ${f}`
    ctx.fillText(`"${d.memo}"`.slice(0, 24), W / 2, bby + 46)
  }

  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
  rrect(ctx, 0.5, 0.5, W - 1, H - 1, 10); ctx.stroke()
  return { dataUrl: finish(canvas), w: W, h: H }
}

const TICKET_COLOR: Record<TicketData['category'], string> = {
  '영화': '#e84393', '공연': '#7c4dff', '전시': '#00897b', '기타': '#f57c00'
}
const TICKET_EMOJI: Record<TicketData['category'], string> = {
  '영화': '🎬', '공연': '🎭', '전시': '🎨', '기타': '🎫'
}

function drawTicket(d: TicketData, font: string, imgs: Imgs): { dataUrl: string; w: number; h: number } {
  const W = 280, H = 250, pad = 20
  const PHOTO_H = 110, sepY = 170
  const [canvas, ctx] = mk(W, H)
  const f = cf(font), accent = TICKET_COLOR[d.category]
  const hasSeat = d.category !== '전시' && d.category !== '기타'

  ctx.fillStyle = '#fff'; rrect(ctx, 0, 0, W, H, 12); ctx.fill()

  // ── 상단 사진 영역 ──
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(12, 0); ctx.arcTo(W, 0, W, 12, 12)
  ctx.lineTo(W, PHOTO_H); ctx.lineTo(0, PHOTO_H); ctx.lineTo(0, 12)
  ctx.arcTo(0, 0, 12, 0, 12); ctx.closePath(); ctx.clip()

  if (imgs.photo) {
    drawCoverImg(ctx, imgs.photo, 0, 0, W, PHOTO_H)
    const ov = ctx.createLinearGradient(0, 0, 0, PHOTO_H)
    ov.addColorStop(0, 'rgba(0,0,0,0.1)'); ov.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = ov; ctx.fillRect(0, 0, W, PHOTO_H)
  } else {
    // 사진 없을 때: 옅은 accent 배경 + 이모지 워터마크
    ctx.fillStyle = accent; ctx.globalAlpha = 0.1
    ctx.fillRect(0, 0, W, PHOTO_H); ctx.globalAlpha = 1
    ctx.fillStyle = accent; ctx.globalAlpha = 0.18
    ctx.font = `38px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(TICKET_EMOJI[d.category], W / 2, PHOTO_H / 2)
    ctx.globalAlpha = 1
  }
  ctx.restore()

  // 가격 (우하단 of photo)
  if (d.price) {
    ctx.fillStyle = imgs.photo ? 'rgba(255,255,255,0.92)' : accent
    ctx.font = `bold 11px ${f}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'
    ctx.fillText(d.price, W - pad, PHOTO_H - 8)
  }

  // ── 제목 (세로 중앙) ──
  ctx.fillStyle = '#1A1A1A'; ctx.font = `bold 16px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  const titleLines = wrap(ctx, d.title || '제목', W - pad * 2, 2)
  const titleBlockH = titleLines.length * 22
  const titleY = PHOTO_H + Math.round((sepY - PHOTO_H - titleBlockH) / 2)
  for (let i = 0; i < titleLines.length; i++) { ctx.fillText(titleLines[i], pad, titleY + i * 22) }

  // ── 절취선 ──
  ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad - 6, sepY); ctx.lineTo(W - pad + 6, sepY); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#f5f5f5'
  ctx.beginPath(); ctx.arc(0, sepY, 9, -Math.PI / 2, Math.PI / 2); ctx.fill()
  ctx.beginPath(); ctx.arc(W, sepY, 9, Math.PI / 2, -Math.PI / 2); ctx.fill()

  // ── 정보 그리드 ──
  let y = sepY + 13
  const col2 = W / 2 + 4
  const lbl = (t: string, x: number, yy: number) => { ctx.fillStyle = '#aaa'; ctx.font = `10px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(t, x, yy) }
  const val = (t: string, x: number, yy: number) => { ctx.fillStyle = '#1a1a1a'; ctx.font = `bold 12px ${f}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(t || '-', x, yy) }

  lbl('날짜', pad, y); lbl('시간', col2, y); y += 13
  val(d.date, pad, y); val(d.time, col2, y); y += 18
  lbl('장소', pad, y); if (hasSeat) lbl('좌석', col2, y); y += 13
  val(d.venue, pad, y); if (hasSeat) val(d.seat, col2, y)

  ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; rrect(ctx, 0.5, 0.5, W - 1, H - 1, 12); ctx.stroke()
  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawGame(d: GameData, font: string, imgs: Imgs): { dataUrl: string; w: number; h: number } {
  const W = 220, H = 268, photoW = 196, photoH = 158, pad = 12
  const [canvas, ctx] = mk(W, H)
  const f = cf(font)
  const frameColor = d.frameColor || '#f9f8f6'
  const dark = isColorDark(frameColor) && !imgs.frameBg

  // 폴라로이드 카드 배경 (색상)
  ctx.fillStyle = frameColor
  rrect(ctx, 0, 0, W, H, 4); ctx.fill()

  // 틀 배경 이미지
  if (imgs.frameBg) {
    ctx.save(); rrect(ctx, 0, 0, W, H, 4); ctx.clip()
    drawCoverImg(ctx, imgs.frameBg, 0, 0, W, H)
    ctx.restore()
  }

  // 사진 영역
  ctx.save()
  ctx.rect(pad, pad, photoW, photoH); ctx.clip()
  if (imgs.screenshot) {
    drawCoverImg(ctx, imgs.screenshot, pad, pad, photoW, photoH)
  } else {
    const g = ctx.createLinearGradient(pad, pad, pad + photoW, pad + photoH)
    g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#16213e')
    ctx.fillStyle = g; ctx.fillRect(pad, pad, photoW, photoH)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.font = `52px ${f}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('🎮', pad + photoW / 2, pad + photoH / 2)
  }
  ctx.restore()

  // 사진 영역 얇은 테두리
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1
  ctx.strokeRect(pad, pad, photoW, photoH)

  // 상단 구역: 날짜 + 타이틀 (원래 위치)
  let y = pad + photoH + 14
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.5)' : '#999'; ctx.font = `10px ${f}`
  ctx.textAlign = 'right'; ctx.textBaseline = 'top'
  ctx.fillText(d.date || '', W - pad, y); y += 4

  ctx.fillStyle = dark ? '#fff' : '#1a1a1a'; ctx.font = `bold 14px ${f}`; ctx.textAlign = 'left'
  ctx.fillText((d.title || '게임 제목').slice(0, 18), pad, y); y += 22

  // 하단 구역: 한마디 세로 중앙
  if (d.oneiner) {
    const oneinerZoneTop = y
    const oneinerY = oneinerZoneTop + Math.round((H - oneinerZoneTop - 11) / 2) - 2
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.7)' : '#666'; ctx.font = `italic 12px ${f}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`"${d.oneiner}"`.slice(0, 26), W / 2, oneinerY)
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1
  rrect(ctx, 0.5, 0.5, W - 1, H - 1, 4); ctx.stroke()
  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawReceipt(d: ReceiptData, font: string): { dataUrl: string; w: number; h: number } {
  const W = 220, pad = 16
  const f = cf(font)
  const items = d.items.filter(i => i.name)
  const total = items.reduce((s, i) => s + (Number(i.price.replace(/[^0-9]/g, '')) || 0), 0)
  const H = 20 + 20 + 16 + 12 + 20 + items.length * 22 + 10 + 14 + 24 + 22 + 14
  const [canvas, ctx] = mk(W, H)

  ctx.fillStyle = '#FEFCF8'; ctx.fillRect(0, 0, W, H)

  // 상단 지그재그
  ctx.fillStyle = '#F0EDE6'
  ctx.beginPath(); ctx.moveTo(0, 0)
  for (let x = 0; x <= W; x += 10) { ctx.lineTo(x + 5, 8); ctx.lineTo(x + 10, 0) }
  ctx.lineTo(W, 0); ctx.closePath(); ctx.fill()

  // 하단 지그재그
  ctx.beginPath(); ctx.moveTo(0, H)
  for (let x = 0; x <= W; x += 10) { ctx.lineTo(x + 5, H - 8); ctx.lineTo(x + 10, H) }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill()

  let y = 22
  ctx.fillStyle = '#1a1a1a'; ctx.font = `bold 14px ${f}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText(d.store || '가게 이름', W / 2, y); y += 20
  ctx.fillStyle = '#888'; ctx.font = `11px ${f}`; ctx.fillText(d.date || '-', W / 2, y); y += 22

  ctx.setLineDash([3, 3]); ctx.strokeStyle = '#D0C8BB'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke()
  ctx.setLineDash([]); y += 12

  ctx.font = `11px ${f}`
  for (const item of items) {
    ctx.fillStyle = '#333'; ctx.textAlign = 'left'
    let name = item.name
    while (name.length > 1 && ctx.measureText(name).width > W - pad * 2 - 60) name = name.slice(0, -1)
    if (name !== item.name) name += '…'
    ctx.fillText(name, pad, y)
    ctx.fillStyle = '#555'; ctx.textAlign = 'right'; ctx.fillText(item.price || '0', W - pad, y); y += 22
  }

  y += 8; ctx.strokeStyle = '#333'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke(); y += 14

  const curSym = CURRENCIES.find(c => c.code === (d.currency ?? 'KRW'))?.symbol ?? '₩'
  ctx.fillStyle = '#1a1a1a'; ctx.font = `bold 13px ${f}`
  ctx.textAlign = 'left'; ctx.fillText('합계', pad, y)
  ctx.textAlign = 'right'; ctx.fillText(`${curSym}${total.toLocaleString()}`, W - pad, y); y += 26

  if (d.footer) { ctx.fillStyle = '#C0B8A8'; ctx.font = `10px ${f}`; ctx.textAlign = 'center'; ctx.fillText(d.footer, W / 2, y) }
  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawWishlist(d: WishlistData, font: string, imgs: Imgs): { dataUrl: string; w: number; h: number } {
  const W = 220, pad = 16
  const f = cf(font)
  const cream = '#F3EDE2', navy = '#2C3E50', stampRed = '#B5451B'
  const photoH = 120

  const tc = measureCtx(`bold 15px ${f}`)
  const nameLines = wrap(tc, d.item || '아이템', W - pad * 2, 2)

  const H = 40
    + nameLines.length * 22 + 6
    + (imgs.photo ? photoH + 12 : 0)
    + 26   // 가격 + 날짜
    + 22   // 별점
    + (d.oneiner ? 18 : 0)
    + 10 + 28 + 10  // 갭 + 바코드 + 하단

  const [canvas, ctx] = mk(W, H)

  // 크라프트지 배경
  ctx.fillStyle = cream; ctx.fillRect(0, 0, W, H)

  // 재봉선 점선 테두리
  ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.9
  ctx.strokeRect(7, 7, W - 14, H - 14)
  ctx.setLineDash([])

  // 펀치 홀 (투명 구멍 + 테두리 그림자)
  const hx = W / 2, hy = 18
  // 그림자 (구멍 뚫기 전에 먼저)
  ctx.beginPath(); ctx.arc(hx + 1, hy + 1.5, 7, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill()
  // 구멍 투명하게 뚫기
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  // 구멍 테두리 링
  ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; ctx.stroke()

  // 홀 아래 점선 구분선
  let y = hy + 14
  ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke()
  ctx.setLineDash([]); y += 8

  // 아이템 이름 (잉크 스탬프)
  ctx.fillStyle = navy; ctx.font = `bold 15px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  for (const ln of nameLines) { ctx.fillText(ln, W / 2, y); y += 22 }
  y += 6

  // 제품 사진 (cover crop, 비율 유지)
  if (imgs.photo) {
    const pw = W - pad * 2
    ctx.save(); ctx.rect(pad, y, pw, photoH); ctx.clip()
    drawCoverImg(ctx, imgs.photo, pad, y, pw, photoH)
    ctx.restore()
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1
    ctx.strokeRect(pad, y, pw, photoH)
    y += photoH + 12
  }

  // 가격 + 날짜
  if (d.price) {
    ctx.fillStyle = navy; ctx.font = `bold 14px ${f}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(d.price, pad, y)
  }
  ctx.fillStyle = 'rgba(44,62,80,0.4)'; ctx.font = `9px ${f}`
  ctx.textAlign = 'right'; ctx.textBaseline = 'top'
  ctx.fillText(d.date || '', W - pad, y + 4)
  y += 26

  // 별점 (빈티지 스탬프 레드)
  ctx.font = `13px ${f}`; ctx.textBaseline = 'top'
  for (let i = 1; i <= 5; i++) {
    ctx.fillStyle = i <= d.wishScore ? stampRed : 'rgba(0,0,0,0.14)'
    ctx.textAlign = 'left'
    ctx.fillText('★', pad + (i - 1) * 16, y)
  }
  y += 22

  // 한줄 코멘트 (이탤릭, 우측)
  if (d.oneiner) {
    ctx.fillStyle = 'rgba(44,62,80,0.5)'; ctx.font = `italic 10px ${f}`
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    ctx.fillText(`"${d.oneiner}"`.slice(0, 28), W - pad, y)
    y += 18
  }

  y += 10

  // 가짜 바코드
  const barPattern = [1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1]
  const bs = 2.5, gapW = 1.2
  const totalBarW = barPattern.reduce((s, b) => s + b * bs + gapW, 0) - gapW
  let xi = (W - totalBarW) / 2
  ctx.fillStyle = navy
  for (const bw of barPattern) { ctx.fillRect(xi, y, bw * bs, 18); xi += bw * bs + gapW }
  ctx.fillStyle = 'rgba(44,62,80,0.38)'; ctx.font = `7px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText(
    (d.price || '').replace(/[^0-9]/g, '').padStart(12, '0').slice(0, 12) || '000000000000',
    W / 2, y + 20
  )

  return { dataUrl: finish(canvas), w: W, h: H }
}

const TRANSPORT_LABEL: Record<TransportData['type'], string> = {
  'KTX': '기차 승차권', 'SRT': '기차 승차권', '버스': '버스 승차권',
  '지하철': '지하철 승차권', '비행기': '비행기 탑승권', '기타': '승차권',
}

function drawTransport(d: TransportData, font: string): { dataUrl: string; w: number; h: number } {
  const W = 310, H = 192, pad = 16, BAND_H = 34
  const [canvas, ctx] = mk(W, H)
  const f = cf(font)
  const ink = '#1A1A1A', muted = '#6B6B6B', light = '#999999'

  // 빛바랜 종이 그라데이션 배경
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#F5F8F0'); bg.addColorStop(1, '#EDF1E5')
  rrect(ctx, 0, 0, W, H, 8); ctx.fillStyle = bg; ctx.fill()

  // 미세 가로 줄 (종이 결)
  ctx.strokeStyle = 'rgba(0,0,0,0.025)'; ctx.lineWidth = 1
  for (let yy = 6; yy < H - BAND_H; yy += 6) {
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke()
  }

  // ── 헤더 ──
  const tplLabel = d.type === '기타' && d.typeLabel
    ? `[ ${d.typeLabel} ]` : `[ ${TRANSPORT_LABEL[d.type]} ]`
  ctx.fillStyle = ink; ctx.font = `bold 11px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(tplLabel, pad, 12)

  // 가짜 일련번호 (날짜 기반 결정론적 생성)
  const seed = Math.abs((d.date + d.from + d.to + d.seat).split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7919))
  const serial = `NO. ${String((seed % 90) + 10).padStart(2, '0')}-${String((seed % 900000) + 100000)}`
  ctx.fillStyle = light; ctx.font = `9px ${f}`
  ctx.textAlign = 'right'; ctx.fillText(serial, W - pad, 13)

  // 구분선 1
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.moveTo(pad, 30); ctx.lineTo(W - pad, 30); ctx.stroke()

  // ── 출발지 ▶ 도착지 (텍스트 길이에 따라 폰트 자동 축소) ──
  const fromText = d.from || '출발'
  const toText = d.to || '도착'
  const arrowW = 28  // ▶ 영역 예약
  const maxTextW = W / 2 - pad - arrowW / 2
  let fSize = 26
  ctx.font = `bold ${fSize}px ${f}`
  while (fSize > 13 && (ctx.measureText(fromText).width > maxTextW || ctx.measureText(toText).width > maxTextW)) {
    fSize -= 1; ctx.font = `bold ${fSize}px ${f}`
  }
  const textY = 37 + Math.round((26 - fSize) / 2)
  ctx.fillStyle = ink; ctx.textBaseline = 'top'
  ctx.textAlign = 'left'; ctx.fillText(fromText, pad, textY)
  ctx.textAlign = 'right'; ctx.fillText(toText, W - pad, textY)
  ctx.fillStyle = '#555'; ctx.font = `bold 13px ${f}`
  ctx.textAlign = 'center'; ctx.fillText('▶', W / 2, 44)

  // 구분선 2
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.moveTo(pad, 74); ctx.lineTo(W - pad, 74); ctx.stroke()

  // ── 날짜 + 출발 시간 ──
  let y = 82
  ctx.fillStyle = muted; ctx.font = `8px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('탑승일', pad, y)
  ctx.textAlign = 'center'; ctx.fillText('출발', W / 2, y)
  y += 12
  ctx.fillStyle = ink; ctx.font = `bold 12px ${f}`
  ctx.textAlign = 'left'; ctx.fillText(d.date || '----.--.--', pad, y)
  ctx.textAlign = 'center'; ctx.fillText(d.departureTime || '--:--', W / 2, y)
  y += 20

  // ── 편명 + 좌석 ──
  ctx.fillStyle = muted; ctx.font = `8px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('편명 / 차량', pad, y)
  ctx.textAlign = 'right'; ctx.fillText('좌석 / 게이트', W - pad, y)
  y += 12
  ctx.fillStyle = ink; ctx.font = `bold 12px ${f}`
  ctx.textAlign = 'left'; ctx.fillText(d.vehicleNumber || d.type, pad, y)
  ctx.font = `bold 18px ${f}`
  ctx.textAlign = 'right'; ctx.fillText(d.seat || '-', W - pad, y - 2)

  // ── 마그네틱 밴드 ──
  const bandY = H - BAND_H
  ctx.fillStyle = '#CDD1C7'
  ctx.beginPath()
  ctx.moveTo(0, bandY); ctx.lineTo(W, bandY)
  ctx.lineTo(W, H - 8); ctx.arcTo(W, H, W - 8, H, 8)
  ctx.lineTo(8, H); ctx.arcTo(0, H, 0, H - 8, 8)
  ctx.lineTo(0, bandY); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.moveTo(0, bandY); ctx.lineTo(W, bandY); ctx.stroke()

  const bandMid = bandY + BAND_H / 2
  ctx.fillStyle = '#333'; ctx.font = `bold 10px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText(d.price || '', pad, bandMid)
  const bcode = `${(seed % 90000) + 10000}-${(seed % 9000) + 1000}-${(seed % 90000) + 10000}-${(seed % 90) + 10}`
  ctx.fillStyle = '#555'; ctx.font = `9px ${f}`
  ctx.textAlign = 'right'; ctx.fillText(bcode, W - pad, bandMid)

  // 외곽선
  ctx.strokeStyle = '#BEC4B5'; ctx.lineWidth = 1
  rrect(ctx, 0.5, 0.5, W - 1, H - 1, 8); ctx.stroke()
  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawCheckin(d: CheckinData, font: string): { dataUrl: string; w: number; h: number } {
  const W = 280, pad = 14
  const f = cf(font)
  const paper = '#F8F5F0', ink = '#1A1A1A', ruled = '#C4BAB0', labelClr = '#AAAAAA'
  const fr = 6  // inner frame inset

  const H = d.memo ? 272 : 250
  const [canvas, ctx] = mk(W, H)

  // 배경
  ctx.fillStyle = paper; rrect(ctx, 0, 0, W, H, 4); ctx.fill()

  // 외곽 테두리
  ctx.strokeStyle = '#BEB5AB'; ctx.lineWidth = 1
  rrect(ctx, 0.5, 0.5, W - 1, H - 1, 4); ctx.stroke()

  // 내부 실선 프레임
  ctx.strokeStyle = '#D4CCC4'; ctx.lineWidth = 0.6
  ctx.strokeRect(fr, fr, W - fr * 2, H - fr * 2)

  // ── 헤더 ──
  let y = fr + 10
  ctx.fillStyle = '#888'; ctx.font = `bold 8px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('CHECK-IN  CARD', W / 2, y); y += 13

  ctx.strokeStyle = '#C8C0B8'; ctx.lineWidth = 0.6
  ctx.beginPath(); ctx.moveTo(fr + 10, y); ctx.lineTo(W - fr - 10, y); ctx.stroke()
  y += 8

  // ── 장소명 ──
  ctx.fillStyle = ink; ctx.font = `bold 17px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  let placeVal = d.place || '장소 이름'
  ctx.font = `bold 17px ${f}`
  while (placeVal.length > 1 && ctx.measureText(placeVal).width > W - pad * 2) placeVal = placeVal.slice(0, -1)
  ctx.fillText(placeVal, pad, y); y += 22

  ctx.strokeStyle = '#C8C0B8'; ctx.lineWidth = 0.6
  ctx.beginPath(); ctx.moveTo(fr + 10, y); ctx.lineTo(W - fr - 10, y); ctx.stroke()
  y += 8

  // ── 필드 헬퍼 (라벨 + 값 + 밑줄) ──
  const field = (label: string, val: string, x: number, fy: number, w: number): number => {
    ctx.fillStyle = labelClr; ctx.font = `7px ${f}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(label, x, fy); fy += 10
    ctx.fillStyle = ink; ctx.font = `11px ${f}`
    let v = val
    while (v.length > 1 && ctx.measureText(v).width > w - 4) v = v.slice(0, -1)
    if (v !== val) v += '…'
    ctx.fillText(v, x, fy); fy += 13
    ctx.strokeStyle = ruled; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x + w, fy); ctx.stroke()
    return fy + 9
  }

  const colW = (W - pad * 2 - 10) / 2

  // Row 1: 카테고리 | 날짜
  const r1 = field('CATEGORY', d.category || '', pad, y, colW)
  field('DATE', d.date || '', pad + colW + 10, y, colW)
  y = r1

  // Row 2: 주소
  y = field('ADDRESS', d.address || '', pad, y, W - pad * 2)

  // Row 3: 목적 | 동행
  const r3 = field('PURPOSE', d.purpose || '', pad, y, colW)
  field('COMPANION', d.companions || '', pad + colW + 10, y, colW)
  y = r3

  // ── 평점: 미니멀 원형 스탬프 ──
  ctx.fillStyle = labelClr; ctx.font = `7px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('RATING', W / 2, y); y += 10

  const sR = 24
  const sCX = W / 2, sCY = y + sR + 4

  // 원형 테두리
  ctx.beginPath(); ctx.arc(sCX, sCY, sR, 0, Math.PI * 2)
  ctx.strokeStyle = '#2C3E50'; ctx.lineWidth = 1.2; ctx.stroke()

  // 별 파라미터
  const starO = 15, starI = 6, starCY2 = sCY - 6
  const makeStar = () => {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5
      const r = i % 2 === 0 ? starO : starI
      const px = sCX + r * Math.cos(ang)
      const py = starCY2 + r * Math.sin(ang)
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
    ctx.closePath()
  }

  // (1) 바탕 별 (연한 회색)
  makeStar(); ctx.fillStyle = '#DDD8D0'; ctx.fill()

  // (2) 아래에서 차오르는 별 (clip + fillRect)
  const starTop = starCY2 - starO
  const starBot = starCY2 + starO * 0.809
  const fillH = (starBot - starTop) * (Math.min(Math.max(d.rating, 0), 5) / 5.0)
  ctx.save()
  makeStar(); ctx.clip()
  ctx.fillStyle = '#2C3E50'
  ctx.fillRect(sCX - starO, starBot - fillH, starO * 2, fillH)
  ctx.restore()

  // 점수 텍스트 (원형 안쪽 하단)
  ctx.fillStyle = '#2C3E50'; ctx.font = `5.5px monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.letterSpacing = '-0.3px'
  ctx.fillText(`${d.rating.toFixed(1)} / 5.0`, sCX, sCY + sR - 9)
  ctx.letterSpacing = '0px'

  y = sCY + sR + 10

  // ── 메모: 살짝 기울인 휘갈긴 코멘트 ──
  if (d.memo) {
    const memoY = y + 14
    ctx.save()
    ctx.translate(W / 2, memoY)
    ctx.rotate(-0.05)
    ctx.fillStyle = 'rgba(40,30,20,0.55)'; ctx.font = `italic 10px ${f}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(`"${d.memo}"`.slice(0, 36), 0, 0)
    ctx.restore()
  }

  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawCoffee(d: CoffeeData, font: string): { dataUrl: string; w: number; h: number } {
  const W = 264, pad = 16
  const f = cf(font)
  const cream = '#FDFBF7', ink = '#1A1A1A', muted = '#8B7D74', dimLine = '#DED5CB'
  const hasNote = !!d.note
  const H = hasNote ? 200 : 152
  const [canvas, ctx] = mk(W, H)

  // 배경
  ctx.fillStyle = cream; rrect(ctx, 0, 0, W, H, 10); ctx.fill()

  // ── 커피 링 데코 (연한 아날로그 감성) ──
  ctx.save()
  ctx.globalAlpha = 0.055
  ctx.strokeStyle = '#6B3F1F'
  ctx.lineWidth = 10
  ctx.beginPath(); ctx.arc(W - 20, H - 16, 34, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 7
  ctx.beginPath(); ctx.arc(20, 20, 20, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()

  // 외곽 테두리
  ctx.strokeStyle = '#E4D9CF'; ctx.lineWidth = 0.8
  rrect(ctx, 0.5, 0.5, W - 1, H - 1, 10); ctx.stroke()

  const dashedLine = (y: number) => {
    ctx.setLineDash([2, 3]); ctx.strokeStyle = dimLine; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke()
    ctx.setLineDash([])
  }

  // ── BREWING LOG ──
  let y = 16
  ctx.fillStyle = muted; ctx.font = `bold 7.5px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('BREWING  LOG', W / 2, y); y += 13
  dashedLine(y); y += 11

  // ── 로스터리 ──
  ctx.fillStyle = muted; ctx.font = `9px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText((d.roastery || 'Roastery').toUpperCase(), W / 2, y); y += 16

  // ── 원두명 + 아이스/핫 배지 ──
  const BADGE_W = 30, BADGE_H = 14, BADGE_GAP = 6
  const maxBeanW = W - pad * 2 - BADGE_W - BADGE_GAP
  let beanSize = 20
  ctx.font = `bold ${beanSize}px ${f}`
  const beanText = d.bean || '원두명'
  while (beanSize > 12 && ctx.measureText(beanText).width > maxBeanW) {
    beanSize -= 1; ctx.font = `bold ${beanSize}px ${f}`
  }
  const beanMeasuredW = ctx.measureText(beanText).width
  const beanStartX = (W - beanMeasuredW - BADGE_GAP - BADGE_W) / 2
  ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(beanText, beanStartX, y)

  // 배지
  const badgeX = beanStartX + beanMeasuredW + BADGE_GAP
  const badgeY = y + Math.round((beanSize - BADGE_H) / 2) + 1
  ctx.fillStyle = d.isIced ? '#E3F2FD' : '#FFF3E0'
  rrect(ctx, badgeX, badgeY, BADGE_W, BADGE_H, 4); ctx.fill()
  ctx.fillStyle = d.isIced ? '#1565C0' : '#BF360C'
  ctx.font = `bold 6.5px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(d.isIced ? '❄ ICE' : '♨ HOT', badgeX + BADGE_W / 2, badgeY + BADGE_H / 2)

  y += beanSize + 12
  dashedLine(y); y += 11

  // ── 레시피 그리드 (4칸) ──
  const gridItems = [
    { label: 'EQUIPMENT', val: d.equipment || '—' },
    { label: 'BEAN', val: d.beanGrams ? `${d.beanGrams}g` : '—' },
    { label: 'WATER', val: d.waterMl ? `${d.waterMl}ml` : '—' },
    { label: 'TIME', val: d.brewTime || '—' },
  ]
  const colW = (W - pad * 2) / 4
  for (let i = 0; i < gridItems.length; i++) {
    const cx = pad + i * colW + colW / 2
    ctx.fillStyle = muted; ctx.font = `6px ${f}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(gridItems[i].label, cx, y)

    ctx.fillStyle = ink; ctx.font = `bold 10.5px ${f}`
    const val = gridItems[i].val
    const valW = ctx.measureText(val).width
    const maxValW = colW - 6
    if (valW > maxValW) {
      const sx = Math.max(0.55, maxValW / valW)
      ctx.save(); ctx.scale(sx, 1)
      ctx.fillText(val, cx / sx, y + 10)
      ctx.restore()
    } else {
      ctx.fillText(val, cx, y + 10)
    }

    // 세로 구분선
    if (i < gridItems.length - 1) {
      ctx.strokeStyle = dimLine; ctx.lineWidth = 0.5; ctx.setLineDash([2, 2])
      const lx = pad + (i + 1) * colW
      ctx.beginPath(); ctx.moveTo(lx, y - 2); ctx.lineTo(lx, y + 26); ctx.stroke()
      ctx.setLineDash([])
    }
  }
  y += 32

  // ── 테이스팅 노트 ──
  if (hasNote) {
    dashedLine(y); y += 11
    const mc = measureCtx(`italic 10px ${f}`)
    const noteLines = wrap(mc, `"${d.note}"`, W - pad * 2, 2)
    ctx.fillStyle = '#9C7B6B'; ctx.font = `italic 10px ${f}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    noteLines.forEach((line, i) => ctx.fillText(line, W / 2, y + i * 15))
  }

  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawFood(d: FoodData, font: string, imgs: Imgs): { dataUrl: string; w: number; h: number } {
  const W = 260, pad = 16
  const f = cf(font)
  const plateCX = W / 2, plateCY = 108, plateR = 68, innerR = plateR - 8

  // 높이 동적 계산
  const tc = measureCtx(`16px ${f}`)
  const dishLines = wrap(tc, d.dish || '음식 이름', W - pad * 3, 2)
  const cc = measureCtx(`10px ${f}`)
  const commentLines = d.comment ? wrap(cc, `"${d.comment}"`, W - pad * 2, 2) : []
  const H = plateCY + plateR + 14
    + (d.restaurant ? 16 : 0)
    + dishLines.length * 19 + 8
    + (commentLines.length > 0 ? commentLines.length * 14 + 6 : 0)
    + (d.date ? 14 : 0)
    + 16

  const [canvas, ctx] = mk(W, H)

  // ── 매트 배경 밝기 분석 및 색상 동적 결정 ──
  const matColor = d.matColor || '#FDEBD0'
  let r = 253, g = 235, b = 208 // default #FDEBD0

  if (imgs.mat) {
    const tcv = document.createElement('canvas'); tcv.width = 1; tcv.height = 1
    const tctx = tcv.getContext('2d')!
    tctx.drawImage(imgs.mat, 0, 0, 1, 1)
    const [cr, cg, cb] = tctx.getImageData(0, 0, 1, 1).data
    r = cr; g = cg; b = cb
  } else {
    const hex = matColor.replace('#', '')
    if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16)
      g = parseInt(hex.slice(2, 4), 16)
      b = parseInt(hex.slice(4, 6), 16)
    }
  }

  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  const isDark = brightness < 100

  let ink: string, muted: string, coral: string, dateClr: string, strokeClr: string
  if (isDark) {
    ink       = '#FFFFFF'
    muted     = 'rgba(255,255,255,0.95)'
    coral     = 'rgba(255,255,255,0.95)'
    dateClr   = 'rgba(255,255,255,0.9)'
    strokeClr = 'rgba(0,0,0,0.2)'
  } else {
    const max = Math.max(r, g, b) || 1
    const rN = Math.pow(r / max, 1.5)
    const gN = Math.pow(g / max, 1.5)
    const bN = Math.pow(b / max, 1.5)
    const dc = (factor: number) => `rgb(${Math.floor(rN * 255 * factor)}, ${Math.floor(gN * 255 * factor)}, ${Math.floor(bN * 255 * factor)})`
    ink       = dc(0.35)
    muted     = dc(0.55)
    coral     = dc(0.5)
    dateClr   = `rgba(${Math.floor(rN * 255 * 0.5)}, ${Math.floor(gN * 255 * 0.5)}, ${Math.floor(bN * 255 * 0.5)}, 0.6)`
    strokeClr = 'rgba(255,255,255,0.3)'
  }

  // ── 배경 (테이블 매트) ──
  if (imgs.mat) {
    ctx.save()
    ctx.beginPath(); rrect(ctx, 0, 0, W, H, 14); ctx.clip()
    drawCoverImg(ctx, imgs.mat, 0, 0, W, H)
    ctx.restore()
  } else {
    ctx.fillStyle = matColor; rrect(ctx, 0, 0, W, H, 14); ctx.fill()
  }

  // 바느질 점선 테두리
  ctx.strokeStyle = 'rgba(255,255,255,0.72)'; ctx.lineWidth = 1.5
  ctx.setLineDash([4, 5])
  rrect(ctx, 9, 9, W - 18, H - 18, 10); ctx.stroke()
  ctx.setLineDash([])

  // ── 커트러리 (헤드 동기화, 한 붓 그리기) ──
  ctx.save()
  ctx.shadowBlur = 6
  ctx.shadowColor = 'rgba(0,0,0,0.08)'
  ctx.shadowOffsetY = 3
  ctx.fillStyle = '#FFFFFF'

  const HEAD_H = 46, TINE_L = 15, ROOT_Y = HEAD_H - TINE_L, SPOON_TOP = HEAD_H + 3

  // 포크 (왼쪽)
  const fx = pad + 25, fy = plateCY
  ctx.beginPath()
  ctx.moveTo(fx - 8, fy + 46)
  ctx.bezierCurveTo(fx - 8, fy + 75, fx + 8, fy + 75, fx + 8, fy + 46)
  ctx.bezierCurveTo(fx + 8, fy + 30, fx + 5, fy + 5, fx + 5, fy)
  ctx.bezierCurveTo(fx + 5, fy - 10, fx + 15, fy - 15, fx + 15, fy - ROOT_Y)
  ctx.lineTo(fx + 15, fy - HEAD_H)
  ctx.arc(fx + 12, fy - HEAD_H, 3, 0, Math.PI, true)
  ctx.lineTo(fx + 9, fy - ROOT_Y)
  ctx.arc(fx + 6, fy - ROOT_Y, 3, 0, Math.PI, false)
  ctx.lineTo(fx + 3, fy - HEAD_H)
  ctx.arc(fx, fy - HEAD_H, 3, 0, Math.PI, true)
  ctx.lineTo(fx - 3, fy - ROOT_Y)
  ctx.arc(fx - 6, fy - ROOT_Y, 3, 0, Math.PI, false)
  ctx.lineTo(fx - 9, fy - HEAD_H)
  ctx.arc(fx - 12, fy - HEAD_H, 3, 0, Math.PI, true)
  ctx.lineTo(fx - 15, fy - ROOT_Y)
  ctx.bezierCurveTo(fx - 15, fy - 15, fx - 5, fy - 10, fx - 5, fy)
  ctx.bezierCurveTo(fx - 5, fy + 5, fx - 8, fy + 30, fx - 8, fy + 46)
  ctx.closePath(); ctx.fill()

  // 숟가락 (오른쪽)
  const sx = W - pad - 25, sy = plateCY
  ctx.beginPath()
  ctx.moveTo(sx - 8, sy + 46)
  ctx.bezierCurveTo(sx - 8, sy + 75, sx + 8, sy + 75, sx + 8, sy + 46)
  ctx.bezierCurveTo(sx + 8, sy + 30, sx + 5, sy + 5, sx + 5, sy)
  ctx.bezierCurveTo(sx + 5, sy - 10, sx + 15, sy - 15, sx + 15, sy - ROOT_Y)
  ctx.bezierCurveTo(sx + 15, sy - ROOT_Y - 10, sx + 10, sy - SPOON_TOP, sx, sy - SPOON_TOP)
  ctx.bezierCurveTo(sx - 10, sy - SPOON_TOP, sx - 14, sy - ROOT_Y - 10, sx - 15, sy - ROOT_Y)
  ctx.bezierCurveTo(sx - 15, sy - 15, sx - 5, sy - 10, sx - 5, sy)
  ctx.bezierCurveTo(sx - 5, sy + 5, sx - 8, sy + 30, sx - 8, sy + 46)
  ctx.closePath(); ctx.fill()

  ctx.restore()

  // ── 접시 ──
  ctx.save()
  ctx.shadowColor = 'rgba(160,120,80,0.18)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5
  ctx.beginPath(); ctx.arc(plateCX, plateCY, plateR, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'; ctx.fill()
  ctx.restore()

  ctx.beginPath(); ctx.arc(plateCX, plateCY, plateR, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'; ctx.fill()
  ctx.beginPath(); ctx.arc(plateCX, plateCY, plateR - 5, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1; ctx.stroke()

  ctx.save()
  ctx.beginPath(); ctx.arc(plateCX, plateCY, innerR, 0, Math.PI * 2); ctx.clip()
  if (imgs.photo) {
    drawCoverImg(ctx, imgs.photo, plateCX - innerR, plateCY - innerR, innerR * 2, innerR * 2)
  } else {
    ctx.fillStyle = '#FFE8D0'
    ctx.fillRect(plateCX - innerR, plateCY - innerR, innerR * 2, innerR * 2)
    ctx.fillStyle = '#D4A882'; ctx.font = `9px ${f}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('사진을 추가해보세요', plateCX, plateCY)
  }
  ctx.restore()

  // ── 텍스트 영역 (동적 색상 적용) ──
  let y = plateCY + plateR + 14
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.lineJoin = 'round'

  const st = (text: string, x: number, ty: number) => {
    ctx.strokeStyle = strokeClr; ctx.lineWidth = 2; ctx.strokeText(text, x, ty)
    ctx.fillText(text, x, ty)
  }

  if (d.restaurant) {
    ctx.fillStyle = muted; ctx.font = `10px ${f}`
    st(d.restaurant.slice(0, 24), W / 2, y); y += 16
  }

  ctx.fillStyle = ink; ctx.font = `16px ${f}`
  for (const line of dishLines) { st(line, W / 2, y); y += 19 }
  y += 8

  if (commentLines.length > 0) {
    ctx.fillStyle = coral; ctx.font = `10px ${f}`
    for (const line of commentLines) { st(line, W / 2, y); y += 14 }
    y += 4
  }

  if (d.date) {
    ctx.fillStyle = dateClr; ctx.font = `8px ${f}`
    st(d.date, W / 2, y)
  }

  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawYoutube(d: YoutubeData, font: string, imgs: Imgs, profileName?: string): { dataUrl: string; w: number; h: number } {
  const W = 300, pad = 14
  const f = cf(font)
  const red = '#FF0000', ink = '#0F0F0F', muted = '#606060'
  const userName = profileName ? `@${profileName}` : '@나의기록'

  const thumbH = Math.round(W * 9 / 16)

  const seed = Math.abs((d.title + d.channel).split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7919))
  const hoursAgo = 1 + (seed % 23)
  const playtime = d.duration || `${3 + (seed % 22)}:${String(seed % 60).padStart(2, '0')}`
  const progress = (seed % 70 + 15) / 100

  const tc = measureCtx(`14px ${f}`)
  const titleLines = wrap(tc, d.title || '영상 제목', W - pad * 2, 3)

  const userCircR = 12
  const impTextX = pad + userCircR * 2 + 8
  const impTextW = W - impTextX - pad
  const tc2 = measureCtx(`11px ${f}`)
  const impLines = d.impression ? wrap(tc2, d.impression, impTextW, 6) : []
  const hasImp = impLines.length > 0

  const H = thumbH + 12
    + 22
    + titleLines.length * 18 + 6
    + (d.date ? 14 : 0)
    + (hasImp ? 45 + impLines.length * 15 : 0)
    + 14

  const [canvas, ctx] = mk(W, H)

  ctx.fillStyle = '#FFFFFF'; rrect(ctx, 0, 0, W, H, 12); ctx.fill()

  // ── 썸네일 ──
  ctx.save()
  rrect(ctx, 1, 1, W - 2, H - 2, 11); ctx.clip()

  if (imgs.thumbnail) {
    const img = imgs.thumbnail
    const imgAspect = img.naturalWidth / img.naturalHeight
    const boxAspect = W / thumbH
    let drawW = W, drawH = thumbH
    if (Math.abs(imgAspect - boxAspect) > 0.01) {
      if (imgAspect > boxAspect) { drawW = W; drawH = W / imgAspect }
      else { drawH = thumbH; drawW = thumbH * imgAspect }
    }
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, thumbH)
    ctx.drawImage(img, (W - drawW) / 2, (thumbH - drawH) / 2, drawW, drawH)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, thumbH)
    g.addColorStop(0, '#1a1a1a'); g.addColorStop(1, '#0a0a0a')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, thumbH)
    ctx.beginPath(); ctx.arc(W / 2, thumbH / 2, 28, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,0,0,0.9)'; ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `18px ${f}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('▶', W / 2 + 2, thumbH / 2)
  }
  ctx.restore()

  // ── 재생 시간 배지 ──
  ctx.font = `9px ${f}`
  const bw = ctx.measureText(playtime).width + 12
  const bh = 16, bx = W - bw - 8, by = thumbH - bh - 8
  ctx.fillStyle = 'rgba(0,0,0,0.76)'; rrect(ctx, bx, by, bw, bh, 3); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(playtime, bx + bw / 2, by + bh / 2)

  // ── 재생 바 ──
  ctx.fillStyle = 'rgba(150,150,150,0.45)'; ctx.fillRect(0, thumbH - 3, W, 3)
  ctx.fillStyle = red; ctx.fillRect(0, thumbH - 3, Math.round(W * progress), 3)

  // ── 텍스트 영역 ──
  let y = thumbH + 12

  // 채널: 프로필 원 + 채널명
  const circR = 8, circX = pad + circR, circY = y + circR
  ctx.beginPath(); ctx.arc(circX, circY, circR, 0, Math.PI * 2)
  if (imgs.channelAvatar) {
    ctx.save(); ctx.clip()
    ctx.drawImage(imgs.channelAvatar, circX - circR, circY - circR, circR * 2, circR * 2)
    ctx.restore()
  } else {
    ctx.fillStyle = red; ctx.fill()
    ctx.fillStyle = '#fff'; ctx.font = `7px ${f}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText((d.channel || 'Y')[0].toUpperCase(), circX, circY)
  }
  ctx.fillStyle = muted; ctx.font = `11px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText((d.channel || '채널명').slice(0, 28), circX + circR + 6, circY)
  y += circR * 2 + 6

  // 제목
  ctx.fillStyle = ink; ctx.font = `14px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  for (const ln of titleLines) { ctx.fillText(ln, pad, y); y += 18 }
  y += 6

  // 날짜 (제목 바로 아래)
  if (d.date) {
    ctx.fillStyle = '#AAAAAA'; ctx.font = `9px ${f}`
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    ctx.fillText(d.date, W - pad, y)
    y += 14
  }

  // ── 댓글 UI (시청 소감이 있을 때만) ──
  if (hasImp) {
    y += 10
    ctx.save()
    ctx.strokeStyle = '#E5E5E5'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke()
    ctx.restore()
    y += 10

    // 사용자 프로필 원
    const userCx = pad + userCircR
    const userCy = y + userCircR
    ctx.beginPath(); ctx.arc(userCx, userCy, userCircR, 0, Math.PI * 2)
    if (imgs.userProfile) {
      ctx.save(); ctx.clip()
      const uimg = imgs.userProfile
      const size = userCircR * 2
      let sx = 0, sy = 0, sw = uimg.naturalWidth, sh = uimg.naturalHeight
      if (uimg.naturalWidth / uimg.naturalHeight > 1) { sw = sh; sx = (uimg.naturalWidth - sw) / 2 }
      else { sh = sw; sy = (uimg.naturalHeight - sh) / 2 }
      ctx.drawImage(uimg, sx, sy, sw, sh, userCx - userCircR, userCy - userCircR, size, size)
      ctx.restore()
    } else {
      ctx.fillStyle = '#4A90D9'; ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = `bold 9px ${f}`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('Me', userCx, userCy)
    }

    // 이름 + 시간
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillStyle = ink; ctx.font = `bold 11px ${f}`
    ctx.fillText(userName, impTextX, y)
    const nameW = ctx.measureText(userName).width
    ctx.fillStyle = muted; ctx.font = `10px ${f}`
    ctx.fillText(`  ${hoursAgo}시간 전`, impTextX + nameW, y)
    y += 15

    // 소감 텍스트 (프로필 원 오른쪽 라인에 맞춰 자동 줄바꿈)
    ctx.fillStyle = '#3F3F3F'; ctx.font = `11px ${f}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    for (const ln of impLines) { ctx.fillText(ln, impTextX, y); y += 15 }
  }

  ctx.strokeStyle = '#E5E5E5'; ctx.lineWidth = 1; rrect(ctx, 0.5, 0.5, W - 1, H - 1, 12); ctx.stroke()
  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawQuote(d: QuoteData, font: string): { dataUrl: string; w: number; h: number } {
  if (d.layout === 'manuscript') return drawQuoteManuscript(d, font)
  return drawQuoteBox(d, font)
}

function drawQuoteBox(d: QuoteData, font: string): { dataUrl: string; w: number; h: number } {
  const W = 300, pad = 22
  const f = cf(font)

  const bg = '#FCFBFA'
  const redLine = '#D9534F'
  const blueLine = '#E2E8F0'
  const ink = '#2C3E50'

  const tc = measureCtx(`16px ${f}`)
  const quoteLines = wrapMultiline(tc, d.text || '문장을 입력하세요', W - pad * 2, 20)

  const mc = measureCtx(`12px ${f}`)
  const memoLines = d.memo ? wrapMultiline(mc, d.memo, W - pad * 2, 8) : []

  const quoteH = quoteLines.length * 26
  const hasAttrib = !!(d.author || d.source)
  const footerH = hasAttrib ? 22 : 0
  const memoLinesCount = memoLines.length   // 실제 내용 줄 수만큼만
  const memoH = memoLinesCount > 0 ? memoLinesCount * 22 + 30 : 0  // ANNOTATION 라벨 포함
  const H = 45 + quoteH + 16 + footerH + memoH + 20

  const [canvas, ctx] = mk(W, H)

  // 전체 배경
  ctx.fillStyle = bg
  rrect(ctx, 0, 0, W, H, 6)
  ctx.fill()

  // 상단 붉은 복선
  ctx.strokeStyle = redLine; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(W, 32); ctx.stroke()
  ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(0, 36); ctx.lineTo(W, 36); ctx.stroke()

  // 분류 라벨
  ctx.fillStyle = redLine; ctx.font = `bold 10px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('LITERARY ARCHIVE', pad, 12)

  // 메인 문장
  let y = 55
  ctx.fillStyle = ink; ctx.font = `bold 17px ${f}`; ctx.textAlign = 'left'
  for (const ln of quoteLines) { ctx.fillText(ln, pad, y); y += 26 }
  y += 16

  // 푸터 (저자, 출처) — 문장 바로 아래
  if (hasAttrib) {
    ctx.fillStyle = ink; ctx.font = `12px ${f}`; ctx.textAlign = 'right'
    ctx.fillText([d.author ? `— ${d.author}` : '', d.source ? `「${d.source}」` : ''].filter(s => s).join(', '), W - pad, y)
    y += footerH
  }

  // 주석 영역 — 메모가 있을 때만 표시
  if (memoLinesCount > 0) {
    const memoStartY = y + 14
    // 줄노트 격자 (실제 줄 수만큼)
    ctx.strokeStyle = blueLine; ctx.lineWidth = 1
    for (let i = 0; i <= memoLinesCount; i++) {
      const lineY = memoStartY + i * 22
      ctx.beginPath(); ctx.moveTo(pad, lineY); ctx.lineTo(W - pad, lineY); ctx.stroke()
    }
    // 메모 텍스트
    ctx.fillStyle = '#486581'; ctx.font = `12px ${f}`; ctx.textAlign = 'left'
    let my = memoStartY + 4
    for (const ln of memoLines) { ctx.fillText(ln, pad, my); my += 22 }
  }

  // 외곽 테두리
  ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1
  rrect(ctx, 0.5, 0.5, W - 1, H - 1, 6)
  ctx.stroke()

  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawQuoteManuscript(d: QuoteData, font: string): { dataUrl: string; w: number; h: number } {
  const f = cf(font)
  const red = '#E74C3C'
  const cellSize = 22
  const rawText = (d.text && d.text.trim()) ? d.text : '문장을 입력하세요'
  const useNewline = !!d.manuscriptNewline
  const paragraphs = useNewline ? rawText.split('\n') : [rawText]
  const totalChars = paragraphs.reduce((sum, p) => sum + Array.from(p).length, 0)
  // 글자 수에 맞춰 cols 결정 → 격자가 중앙에 조각처럼 떠 있는 느낌
  const cols = Math.min(12, Math.max(4, Math.ceil(totalChars / 4)))
  // 단락별 시작 행 계산 (줄바꿈 모드: \n마다 새 행, 일반 모드: 순차 흐름)
  let totalRows = 0
  const paraRowStarts: number[] = []
  for (const para of paragraphs) {
    paraRowStarts.push(totalRows)
    const len = Array.from(para).length
    totalRows += len === 0 ? 1 : Math.ceil(len / cols)
  }
  const rows = Math.max(1, totalRows)
  const gridW = cols * cellSize
  const gridH = rows * cellSize
  const gutter = 21
  const hasAttrib = !!(d.author || d.source)
  const attribH = hasAttrib ? 16 : 0
  const botGap = (hasAttrib || d.memo) ? 10 : 0
  const memoLines = d.memo ? wrap(measureCtx(`10px ${f}`), d.memo, gridW, 5) : []
  const hasMemo = memoLines.length > 0
  const sepH = hasMemo ? 14 : 0        // 구분선 위 gap(6) + 선(1) + 아래 gap(7)
  const memoTextH = hasMemo ? memoLines.length * 14 + 4 : 0
  const W = gridW + gutter * 2
  const H = gutter + gridH + botGap + attribH + sepH + memoTextH + gutter

  const [canvas, ctx] = mk(W, H)
  const gx = gutter, gy = gutter

  // 순백 배경
  ctx.fillStyle = '#FFFFFF'
  rrect(ctx, 0, 0, W, H, 12)
  ctx.fill()

  // 얇은 회색 외곽선 (입체감)
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'
  ctx.lineWidth = 1
  rrect(ctx, 0.5, 0.5, W - 1, H - 1, 12)
  ctx.stroke()

  // 격자 그림자 (조각처럼 떠 있는 느낌)
  ctx.save()
  ctx.shadowColor = 'rgba(231,76,60,0.13)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetX = 2
  ctx.shadowOffsetY = 4
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(gx, gy, gridW, gridH)
  ctx.restore()

  // 격자 내부 흰색 재칠 (shadow 번짐 방지)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(gx, gy, gridW, gridH)

  // 빨간 격자선 (선명하고 두껍게)
  ctx.strokeStyle = red
  ctx.lineWidth = 1.3
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath()
    ctx.moveTo(gx, gy + r * cellSize)
    ctx.lineTo(gx + gridW, gy + r * cellSize)
    ctx.stroke()
  }
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath()
    ctx.moveTo(gx + c * cellSize, gy)
    ctx.lineTo(gx + c * cellSize, gy + gridH)
    ctx.stroke()
  }

  // 셀 중앙 가로 점선 (연한 빨간)
  ctx.strokeStyle = 'rgba(231,76,60,0.28)'
  ctx.lineWidth = 0.6
  ctx.setLineDash([2, 2])
  for (let r = 0; r < rows; r++) {
    const midY = gy + r * cellSize + cellSize / 2
    ctx.beginPath(); ctx.moveTo(gx, midY); ctx.lineTo(gx + gridW, midY); ctx.stroke()
  }
  ctx.setLineDash([])

  // 글자: 셀의 75% 크기, 한 칸에 한 글자
  const fontSize = Math.round(cellSize * 0.75)
  ctx.fillStyle = '#1A1A1A'
  ctx.font = `${fontSize}px ${f}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const paraChars = Array.from(paragraphs[pi])
    const startRow = paraRowStarts[pi]
    paraChars.forEach((ch: string, i: number) => {
      const row = startRow + Math.floor(i / cols)
      const col = i % cols
      if (row < rows) ctx.fillText(ch, gx + col * cellSize + cellSize / 2, gy + row * cellSize + cellSize / 2)
    })
  }

  // 출처/저자 (격자 우측 하단, 빨간 잉크)
  let ay = gy + gridH + botGap
  if (hasAttrib) {
    const label = [d.author ? `— ${d.author}` : '', d.source ? `「${d.source}」` : ''].filter(s => s).join('  ')
    ctx.fillStyle = red; ctx.font = `10px ${f}`
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    ctx.fillText(label.slice(0, 28), gx + gridW, ay)
    ay += 16
  }

  // 구분선 + 메모
  if (hasMemo) {
    const sepY = ay + 6
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 0.8
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(gx, sepY); ctx.lineTo(gx + gridW, sepY); ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#999999'; ctx.font = `10px ${f}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    let my = sepY + 7
    for (const ln of memoLines) { ctx.fillText(ln, gx, my); my += 14 }
  }

  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawMusic(d: MusicData, font: string, imgs: Imgs): { dataUrl: string; w: number; h: number } {
  const W = 310, pad = 16
  const f = cf(font)
  const artSize = 100, artX = pad
  const tx = artX + artSize + 14
  const maxW = W - tx - pad - 10

  // 제목/가사 줄 수 먼저 계산해서 카드 높이 동적 결정
  const artistH = 16, titleLineH = 22, lyricLineH = 18, gapAT = 6, gapTL = 10
  const titleLines = wrap(measureCtx(`bold 17px ${f}`), d.title || '곡 제목', maxW, 10)
  const lyricLines = d.lyric ? wrap(measureCtx(`13px ${f}`), `"${d.lyric}"`, maxW, 10) : []
  const contentH = artistH + gapAT + titleLines.length * titleLineH + (lyricLines.length > 0 ? gapTL + lyricLines.length * lyricLineH : 0)
  const H = Math.max(132, 32 + contentH)
  const artY = Math.round((H - artSize) / 2)

  const [canvas, ctx] = mk(W, H)

  // ── 동적 색상 변수 초기화 (기본: 어두운 테마) ──
  let bgStyle: string | CanvasGradient = '#1E1A17'
  let cTitle = '#ffffff', cSub = 'rgba(255,255,255,0.75)'
  let cBtnBg = 'rgba(255,255,255,0.08)', cBtnIc = 'rgba(255,255,255,0.6)'

  // ── 1. 앨범 아트 대표 색상 & 밝기 추출 ──
  ctx.save()
  rrect(ctx, 0, 0, W, H, 14)
  ctx.clip()

  if (imgs.albumArt) {
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = 1; tempCanvas.height = 1
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.drawImage(imgs.albumArt, 0, 0, 1, 1)
    const [r, g, b] = tempCtx.getImageData(0, 0, 1, 1).data

    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    const bgGrad = ctx.createLinearGradient(0, 0, W, H)

    if (brightness > 190) {
      // 밝은 앨범 아트: 배경은 밝게, 글자는 앨범 고유색으로 어둡게
      bgGrad.addColorStop(0, `rgb(${Math.floor(r * 0.99)}, ${Math.floor(g * 0.99)}, ${Math.floor(b * 0.99)})`)
      bgGrad.addColorStop(1, `rgb(${Math.floor(r * 0.85)}, ${Math.floor(g * 0.85)}, ${Math.floor(b * 0.85)})`)
      bgStyle = bgGrad

      const max = Math.max(r, g, b) || 1
      const rD = Math.floor(Math.pow(r / max, 1.5) * 255 * 0.5)
      const gD = Math.floor(Math.pow(g / max, 1.5) * 255 * 0.5)
      const bD = Math.floor(Math.pow(b / max, 1.5) * 255 * 0.5)

      cTitle = `rgb(${rD}, ${gD}, ${bD})`
      cSub   = `rgba(${rD}, ${gD}, ${bD}, 0.8)`
      cBtnBg = `rgba(${rD}, ${gD}, ${bD}, 0.1)`
      cBtnIc = `rgba(${rD}, ${gD}, ${bD}, 0.7)`
    } else {
      // 어두운 앨범 아트: 배경을 어둡게 누르고, 글자는 흰색
      bgGrad.addColorStop(0, `rgb(${Math.floor(r * 0.75)}, ${Math.floor(g * 0.75)}, ${Math.floor(b * 0.75)})`)
      bgGrad.addColorStop(1, `rgb(${Math.floor(r * 0.35)}, ${Math.floor(g * 0.35)}, ${Math.floor(b * 0.35)})`)
      bgStyle = bgGrad
    }
  }

  ctx.fillStyle = bgStyle
  ctx.fillRect(0, 0, W, H)
  ctx.restore()

  // ── 2. 앨범 아트 이미지 렌더링 ──
  ctx.save()
  rrect(ctx, artX, artY, artSize, artSize, 8)
  ctx.clip()
  if (imgs.albumArt) {
    drawCoverImg(ctx, imgs.albumArt, artX, artY, artSize, artSize)
  } else {
    const g = ctx.createLinearGradient(artX, artY, artX + artSize, artY + artSize)
    g.addColorStop(0, '#5c4bff'); g.addColorStop(1, '#ff4bac')
    ctx.fillStyle = g; ctx.fillRect(artX, artY, artSize, artSize)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = `30px ${f}`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('♪', artX + artSize / 2, artY + artSize / 2)
  }
  ctx.restore()

  // ── 3. 텍스트 정보 렌더링 ──
  let ty = artY + Math.round((artSize - contentH) / 2)

  ctx.fillStyle = cSub; ctx.font = `13px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText((d.artist || '아티스트').slice(0, 24), tx, ty); ty += artistH + gapAT

  ctx.fillStyle = cTitle; ctx.font = `bold 17px ${f}`
  for (const ln of titleLines) {
    ctx.fillText(ln, tx, ty); ty += titleLineH
  }

  if (lyricLines.length > 0) {
    ty += gapTL
    ctx.fillStyle = cSub; ctx.font = `13px ${f}`
    for (const ln of lyricLines) {
      ctx.fillText(ln, tx, ty); ty += lyricLineH
    }
  }


  // ── 5. 재생 버튼 장식 ──
  const pbx = W - pad - 13, pby = H - pad - 13
  ctx.beginPath(); ctx.arc(pbx, pby, 13, 0, Math.PI * 2)
  ctx.fillStyle = cBtnBg; ctx.fill()
  ctx.fillStyle = cBtnIc; ctx.font = `10px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('▶', pbx + 1, pby)

  return { dataUrl: finish(canvas), w: W, h: H }
}

// ── Metadata ──────────────────────────────────────────────────────────────────

const CATEGORIES: { id: Category; emoji: string; label: string }[] = [
  { id: 'hobby',   emoji: '🎮', label: '취미' },
  { id: 'spend',   emoji: '🛍',  label: '소비' },
  { id: 'travel',  emoji: '✈️',  label: '이동' },
  { id: 'food',    emoji: '🍽',  label: '냠냠' },
  { id: 'archive', emoji: '📚', label: '아카이빙' },
  { id: 'style',   emoji: '💄', label: '꾸꾸꾸' },
]

const TEMPLATES_BY_CAT: Record<Category, { id: TemplateId; emoji: string; label: string; desc: string }[]> = {
  hobby:   [
    { id: 'baseball', emoji: '⚾', label: '야구 직관',    desc: '티켓 · 스코어 기록' },
    { id: 'ticket',   emoji: '🎬', label: '티켓',          desc: '영화 · 공연 · 전시' },
    { id: 'game',     emoji: '🎮', label: '게임',           desc: '플레이 폴라로이드' },
  ],
  spend:   [
    { id: 'receipt',  emoji: '🧾', label: '영수증',        desc: '쇼핑 · 결제 내역' },
    { id: 'wishlist', emoji: '✦',  label: '위시리스트',    desc: '갖고 싶은 아이템' },
  ],
  travel:  [
    { id: 'transport', emoji: '🚀', label: '교통수단',     desc: '비행기 · KTX · 버스' },
    { id: 'checkin',   emoji: '📍', label: '장소 체크인',  desc: '방문한 곳 기록' },
  ],
  food:    [
    { id: 'coffee',    emoji: '☕', label: '커피',          desc: '드립 기록 · 테이스팅' },
    { id: 'food_note', emoji: '🍴', label: '먹은 것',       desc: '접시 모양 카드' },
  ],
  archive: [
    { id: 'youtube', emoji: '▶',  label: '유튜브',         desc: '링크 자동 불러오기' },
    { id: 'quote',   emoji: '"', label: '문장 수집',      desc: '원고지 · 인용구 박스' },
    { id: 'music',   emoji: '♪',  label: '음악',           desc: '앨범 아트 플레이어' },
  ],
  style: [
    { id: 'makeup',   emoji: '💋', label: '메이크업',   desc: '오늘의 색조 & 룩북 스크랩' },
    { id: 'skincare', emoji: '💧', label: '기초 케어',  desc: '피부 상태 & 스킨케어 레시피' },
  ],
}

function defaultData(id: TemplateId, tplDef: Record<string, string> = {}): AnyData {
  const d = new Date()
  const today = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const base = (() => { switch (id) {
    case 'baseball':  return { bgImageB64: '', away: '', homeScore: '', awayScore: '', venue: '', date: today, seat: '', memo: '', isAway: false, homeTeam: '삼성 라이온즈' }
    case 'ticket':    return { category: '영화', title: '', date: today, time: '', venue: '', seat: '', price: '', photoB64: '' }
    case 'game':      return { screenshotB64: '', title: '', date: today, oneiner: '', frameColor: '#f9f8f6', frameBgB64: '' }
    case 'receipt':   return { store: '', date: today, items: [{ name: '', price: '' }], footer: '감사합니다 ✦', currency: 'KRW' }
    case 'wishlist':  return { item: '', price: '', wishScore: 3, photoB64: '', oneiner: '', date: today, link: '' }
    case 'transport': return { type: 'KTX', typeLabel: '', from: '', to: '', date: today, departureTime: '', vehicleNumber: '', seat: '', price: '' }
    case 'checkin':   return { place: '', category: '', address: '', date: today, rating: 4.5, purpose: '', companions: '', memo: '', link: '' }
    case 'coffee':    return { roastery: '', bean: '', isIced: false, equipment: '', beanGrams: '', waterMl: '', brewTime: '', note: '' }
    case 'food_note': return { dish: '', restaurant: '', photoB64: '', date: today, comment: '', matColor: '#FDEBD0', matImageB64: '' }
    case 'youtube':   return { url: '', title: '', channel: '', thumbnailB64: '', channelAvatarB64: '', impression: '', date: today, duration: '' }
    case 'quote':     return { text: '', source: '', author: '', memo: '', layout: 'quote' }
    case 'music':     return { title: '', artist: '', albumArtB64: '', lyric: '' }
    case 'makeup':    return { date: today, sun: '', base: '', shading: '', eyeShadow: '', eyeLiner: '', eyeMascara: '', underShadow: '', underMascara: '', underHighlighter: '', highlighter: '', blush: '', lip: '', mood: '', comment: '', rating: 5 }
    case 'skincare':  return { date: today, time: 'PM', condition: '', weather: '', toner: '', serum: '', cream: '', special: '', memo: '' }
  }})()
  // Merge non-empty saved defaults over the base (skip arrays like receipt.items)
  const merged = { ...base }
  for (const [k, v] of Object.entries(tplDef)) {
    if (v && k in merged && !Array.isArray((merged as any)[k])) (merged as any)[k] = v
  }
  return merged as AnyData
}

function drawMakeup(d: MakeupData, font: string): { dataUrl: string; w: number; h: number } {
  const W = 320, H = 430
  const [canvas, ctx] = mk(W, H)
  const f = cf(font)
  const INK    = '#1A1A1A'
  const MUTED  = 'rgba(26,26,26,0.35)'
  const DIMMED = 'rgba(26,26,26,0.18)'

  // Helper: truncate to maxW (font must be set before calling)
  const trunc = (text: string, maxW: number): string => {
    if (!text) return '—'
    if (ctx.measureText(text).width <= maxW) return text
    let t = text
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
    return t + '…'
  }

  // ── Background & outer border ─────────────────────────────────────────────
  ctx.fillStyle = '#F9F8F6'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = INK; ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1)

  // ── HEADER (44px tall) ────────────────────────────────────────────────────
  const HDR_H = 44
  const cpad = 14

  ctx.textBaseline = 'middle'

  // Date — left
  ctx.fillStyle = MUTED; ctx.font = `8px ${f}`
  ctx.textAlign = 'left'
  ctx.fillText(d.date, cpad, HDR_H / 2)

  // MAKEUP RECORD — center
  ctx.fillStyle = INK; ctx.font = `8.5px ${f}`
  ctx.textAlign = 'center'
  ctx.fillText('MAKEUP RECORD', W / 2, HDR_H / 2)

  // Rating stars (0–10 → 0–5 ★) — right
  const full = Math.round(d.rating / 2)
  ctx.fillStyle = INK; ctx.font = `9px ${f}`
  ctx.textAlign = 'right'
  ctx.fillText('★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full)), W - cpad, HDR_H / 2)

  // Header bottom rule
  ctx.strokeStyle = INK; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, HDR_H); ctx.lineTo(W, HDR_H); ctx.stroke()

  // ── BODY: 2-column (split at W/2) ────────────────────────────────────────
  const MOOD_H = d.comment ? 56 : 48
  const BODY_BOT = H - MOOD_H
  const MID_X = W / 2

  // Center vertical rule
  ctx.beginPath(); ctx.moveTo(MID_X, HDR_H); ctx.lineTo(MID_X, BODY_BOT); ctx.stroke()

  // ── LEFT COLUMN: BASE & CONTOUR ───────────────────────────────────────────
  {
    const maxW = MID_X - cpad * 2
    let y = HDR_H + 14

    // Column label
    ctx.fillStyle = MUTED; ctx.font = `7px ${f}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('BASE & CONTOUR', cpad, y)
    y += 12

    // Sub-rule
    ctx.strokeStyle = DIMMED; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(cpad, y); ctx.lineTo(MID_X - cpad, y); ctx.stroke()
    y += 10

    // Distribute 4 items across remaining body height
    const items: [string, string][] = [
      ['SUNCARE', d.sun],
      ['BASE', d.base],
      ['SHADING', d.shading],
      ['HIGHLIGHTER', d.highlighter],
    ]
    const slotH = (BODY_BOT - y - 8) / items.length

    for (const [label, val] of items) {
      ctx.fillStyle = MUTED; ctx.font = `7.5px ${f}`
      ctx.textBaseline = 'top'
      ctx.fillText(label, cpad, y)

      ctx.fillStyle = INK; ctx.font = `9.5px ${f}`
      ctx.fillText(trunc(val, maxW), cpad, y + 12)

      y += slotH
    }
  }

  // ── RIGHT COLUMN: COLOR & POINT ───────────────────────────────────────────
  {
    const rx = MID_X + cpad
    const maxW = MID_X - cpad * 2
    let y = HDR_H + 14

    // Column label
    ctx.fillStyle = MUTED; ctx.font = `7px ${f}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('COLOR & POINT', rx, y)
    y += 12

    // Sub-rule
    ctx.strokeStyle = DIMMED; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(W - cpad, y); ctx.stroke()
    y += 8

    // EYE group
    ctx.fillStyle = DIMMED; ctx.font = `7px ${f}`
    ctx.textBaseline = 'top'
    ctx.fillText('EYE', rx, y)
    y += 10

    for (const [label, val] of [['SHADOW', d.eyeShadow], ['LINER', d.eyeLiner], ['MASCARA', d.eyeMascara]] as [string,string][]) {
      ctx.fillStyle = MUTED; ctx.font = `7px ${f}`; ctx.fillText(label, rx, y); y += 9
      ctx.fillStyle = INK;   ctx.font = `9px ${f}`;  ctx.fillText(trunc(val, maxW), rx, y); y += 15
    }
    y += 5

    // UNDER group
    ctx.fillStyle = DIMMED; ctx.font = `7px ${f}`
    ctx.fillText('UNDER', rx, y)
    y += 10

    for (const [label, val] of [['SHADOW', d.underShadow], ['MASCARA', d.underMascara], ['HIGHLIGHT', d.underHighlighter]] as [string,string][]) {
      ctx.fillStyle = MUTED; ctx.font = `7px ${f}`; ctx.fillText(label, rx, y); y += 9
      ctx.fillStyle = INK;   ctx.font = `9px ${f}`;  ctx.fillText(trunc(val, maxW), rx, y); y += 15
    }
    y += 5

    // BLUSH
    ctx.fillStyle = MUTED; ctx.font = `7.5px ${f}`; ctx.fillText('BLUSH', rx, y); y += 10
    ctx.fillStyle = INK;   ctx.font = `9px ${f}`;  ctx.fillText(trunc(d.blush, maxW), rx, y); y += 16

    // LIP
    ctx.fillStyle = MUTED; ctx.font = `7.5px ${f}`; ctx.fillText('LIP', rx, y); y += 10
    ctx.fillStyle = INK;   ctx.font = `9px ${f}`;  ctx.fillText(trunc(d.lip, maxW), rx, y)
  }

  // ── MOOD HEADLINE + COMMENT (bottom) ─────────────────────────────────────
  ctx.strokeStyle = INK; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, BODY_BOT); ctx.lineTo(W, BODY_BOT); ctx.stroke()

  const moodText = (d.mood || "TODAY'S LOOK").toUpperCase()
  let moodFs = 17
  ctx.font = `${moodFs}px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  while (ctx.measureText(moodText).width > W - 28 && moodFs > 11) {
    moodFs--
    ctx.font = `${moodFs}px ${f}`
  }
  ctx.fillStyle = INK

  const moodY = d.comment ? BODY_BOT + 16 : BODY_BOT + MOOD_H / 2
  ctx.fillText(moodText, W / 2, moodY)

  if (d.comment) {
    ctx.fillStyle = MUTED; ctx.font = `9px ${f}`
    ctx.fillText(trunc(d.comment, W - 28), W / 2, moodY + moodFs + 4)
  }

  return { dataUrl: finish(canvas), w: W, h: H }
}

function drawSkincare(d: SkincareData, font: string): { dataUrl: string; w: number; h: number } {
  const W = 300, H = 400
  const [canvas, ctx] = mk(W, H)
  const f = cf(font)
  const INK    = '#1A1A1A'
  const MUTED  = 'rgba(26,26,26,0.35)'
  const DIMMED = 'rgba(26,26,26,0.18)'
  const cpad = 16

  const trunc = (text: string, maxW: number): string => {
    if (!text) return '—'
    if (ctx.measureText(text).width <= maxW) return text
    let t = text
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
    return t + '…'
  }

  // ── Background & outer border ─────────────────────────────────────────────
  ctx.fillStyle = '#F9F8F6'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = INK; ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1)

  // ── HEADER (50px) ─────────────────────────────────────────────────────────
  const HDR_H = 50

  // Left: SKINCARE RECORD label
  ctx.fillStyle = MUTED; ctx.font = `7px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('SKINCARE RECORD', cpad, 12)

  // Date large
  ctx.fillStyle = INK; ctx.font = `13px ${f}`
  ctx.textBaseline = 'top'
  ctx.fillText(d.date, cpad, 22)

  // AM/PM badge inline after date
  const dateMW = ctx.measureText(d.date).width
  ctx.fillStyle = INK; ctx.font = `9px ${f}`
  ctx.textBaseline = 'middle'
  // Badge box
  const badgeX = cpad + dateMW + 8
  const badgeW = 26, badgeH = 14, badgeY = 26
  ctx.strokeStyle = INK; ctx.lineWidth = 0.8
  ctx.strokeRect(badgeX, badgeY, badgeW, badgeH)
  ctx.fillStyle = INK; ctx.font = `7.5px ${f}`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(d.time, badgeX + badgeW / 2, badgeY + badgeH / 2)

  // Right: Weather stamp box
  if (d.weather) {
    ctx.font = `7.5px ${f}`
    const wParts = d.weather.split(' · ')
    const boxPad = 6
    const lineH = 11
    const boxH2 = wParts.length * lineH + boxPad * 2
    const maxWW = 110
    const boxW2 = Math.min(maxWW, Math.max(...wParts.map(p => ctx.measureText(p).width)) + boxPad * 2)
    const bx = W - cpad - boxW2
    const by = HDR_H / 2 - boxH2 / 2 - 2
    ctx.strokeStyle = MUTED; ctx.lineWidth = 0.8
    ctx.strokeRect(bx, by, boxW2, boxH2)
    ctx.fillStyle = MUTED; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    wParts.forEach((p, i) => ctx.fillText(trunc(p, boxW2 - boxPad * 2), bx + boxPad, by + boxPad + i * lineH))
  }

  // Header bottom rule
  ctx.strokeStyle = INK; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, HDR_H); ctx.lineTo(W, HDR_H); ctx.stroke()

  // ── CONDITION (피부 상태 요약) ─────────────────────────────────────────────
  let y = HDR_H + 14

  ctx.fillStyle = DIMMED; ctx.font = `7px ${f}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText('CONDITION', cpad, y); y += 10

  ctx.fillStyle = INK; ctx.font = `10.5px ${f}`
  ctx.fillText(trunc(d.condition || '—', W - cpad * 2), cpad, y); y += 10

  // Sub-rule
  ctx.strokeStyle = DIMMED; ctx.lineWidth = 0.5
  ctx.beginPath(); ctx.moveTo(cpad, y + 6); ctx.lineTo(W - cpad, y + 6); ctx.stroke()
  y += 18

  // ── ROUTINE LIST ──────────────────────────────────────────────────────────
  const steps: [string, string][] = [
    ['TONER',        d.toner],
    ['SERUM',        d.serum],
    ['CREAM',        d.cream],
    ['SPECIAL CARE', d.special],
  ]

  // Available height for steps + memo
  const MEMO_H = d.memo ? 44 : 0
  const stepsH = H - y - MEMO_H - cpad
  const slotH = stepsH / steps.length

  for (let i = 0; i < steps.length; i++) {
    const [label, val] = steps[i]
    const sy = y + i * slotH

    // Step number (tiny index)
    ctx.fillStyle = DIMMED; ctx.font = `7px ${f}`
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    ctx.fillText(String(i + 1).padStart(2, '0'), cpad + 10, sy + 1)

    // Vertical tick
    ctx.strokeStyle = DIMMED; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(cpad + 14, sy + 4); ctx.lineTo(cpad + 14, sy + slotH - 6); ctx.stroke()

    // Label
    ctx.fillStyle = MUTED; ctx.font = `7.5px ${f}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText(label, cpad + 20, sy + 1)

    // Value
    ctx.fillStyle = INK; ctx.font = `10px ${f}`
    ctx.fillText(trunc(val, W - cpad - 36), cpad + 20, sy + 13)

    // Horizontal item separator (not last)
    if (i < steps.length - 1) {
      ctx.strokeStyle = DIMMED; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(cpad + 14, sy + slotH - 1); ctx.lineTo(W - cpad, sy + slotH - 1); ctx.stroke()
    }
  }

  // ── MEMO (하단) ───────────────────────────────────────────────────────────
  if (d.memo) {
    const memoY = H - MEMO_H + 6
    ctx.strokeStyle = DIMMED; ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(cpad, memoY - 4); ctx.lineTo(W - cpad, memoY - 4); ctx.stroke()

    ctx.fillStyle = DIMMED; ctx.font = `7px ${f}`
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    ctx.fillText('MEMO', cpad, memoY)

    const memoLines = wrap(ctx, d.memo, W - cpad * 2, 2)
    ctx.fillStyle = MUTED; ctx.font = `9px ${f}`
    memoLines.forEach((line, li) => {
      ctx.fillText(line, cpad, memoY + 12 + li * 13)
    })
  }

  return { dataUrl: finish(canvas), w: W, h: H }
}

function generate(id: TemplateId, data: AnyData, font: string, imgs: Imgs, profileName?: string): { dataUrl: string; w: number; h: number } {
  switch (id) {
    case 'baseball':  return drawBaseball(data as BaseballData, font, imgs)
    case 'ticket':    return drawTicket(data as TicketData, font, imgs)
    case 'game':      return drawGame(data as GameData, font, imgs)
    case 'receipt':   return drawReceipt(data as ReceiptData, font)
    case 'wishlist':  return drawWishlist(data as WishlistData, font, imgs)
    case 'transport': return drawTransport(data as TransportData, font)
    case 'checkin':   return drawCheckin(data as CheckinData, font)
    case 'coffee':    return drawCoffee(data as CoffeeData, font)
    case 'food_note': return drawFood(data as FoodData, font, imgs)
    case 'youtube':   return drawYoutube(data as YoutubeData, font, imgs, profileName)
    case 'quote':     return drawQuote(data as QuoteData, font)
    case 'music':     return drawMusic(data as MusicData, font, imgs)
    case 'makeup':    return drawMakeup(data as MakeupData, font)
    case 'skincare':  return drawSkincare(data as SkincareData, font)
  }
}

// ── Form helpers ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #E0E0E0',
  borderRadius: 6, padding: '6px 8px', fontSize: 12, outline: 'none',
  fontFamily: 'inherit', background: '#fafafa',
}
const lbl: React.CSSProperties = {
  fontSize: 10, color: '#999', marginBottom: 3, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.04em',
}

function F({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={lbl}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inp} />
    </div>
  )
}

function PriceF({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const parsed = parsePriceValue(value)
  const [code, setCode] = useState(parsed.code || 'KRW')
  const [amount, setAmount] = useState(parsed.amount)

  useEffect(() => {
    if (parsed.code) return
    api.settings.get('defaultCurrency').then(v => {
      if (v) setCode(v)
    }).catch(() => {})
  }, [])

  const emit = (c: string, a: string) => {
    const sym = CURRENCIES.find(x => x.code === c)?.symbol ?? ''
    onChange(a ? sym + a : '')
  }

  return (
    <div style={{ marginBottom: 9 }}>
      <div style={lbl}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        <select value={code}
          onChange={e => { setCode(e.target.value); emit(e.target.value, amount) }}
          style={{ ...inp, width: 54, flexShrink: 0, paddingLeft: 4, paddingRight: 2, cursor: 'pointer' }}>
          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol}</option>)}
        </select>
        <input value={amount}
          onChange={e => { setAmount(e.target.value); emit(code, e.target.value) }}
          placeholder={placeholder} style={{ ...inp, flex: 1 }} />
      </div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${React.Children.count(children)}, 1fr)`, gap: 8 }}>{children}</div>
}

function StarRating({ label = '평점', value, onChange }: { label?: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={lbl}>{label}</div>
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(s => (
          <span key={s} onClick={() => onChange(s)}
            style={{ fontSize: 22, cursor: 'pointer', color: s <= value ? '#ffd700' : '#DDD', lineHeight: 1 }}>★</span>
        ))}
      </div>
    </div>
  )
}

function ImgPicker({ label, value, onChange, cropFrame }: { label: string; value: string; onChange: (v: string) => void; cropFrame?: { w: number; h: number } }) {
  const [loading, setLoading] = React.useState(false)
  const openCrop = React.useContext(CropCtx)
  const handle = async () => {
    setLoading(true)
    const url = await pickAndReadImage().catch(() => null)
    setLoading(false)
    if (!url) return
    if (cropFrame && openCrop) {
      const cropped = await openCrop(url, cropFrame)
      if (cropped) onChange(cropped)
    } else {
      onChange(url)
    }
  }
  const handleAdjust = async () => {
    if (!cropFrame || !openCrop) return
    const cropped = await openCrop(value, cropFrame)
    if (cropped) onChange(cropped)
  }
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={lbl}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={handle} disabled={loading} style={{
          padding: '5px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
          border: '1px solid #e0e0e0', background: '#fafafa', color: '#555',
        }}>{loading ? '…' : value ? '변경' : '사진 선택'}</button>
        {value && <>
          <img src={value} style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }} />
          {cropFrame && openCrop && (
            <button onClick={handleAdjust} style={{ fontSize: 11, color: '#777', background: 'none', border: '1px solid #ddd', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}>조정</button>
          )}
          <button onClick={() => onChange('')} style={{ fontSize: 12, color: '#ccc', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </>}
      </div>
    </div>
  )
}

// ── Forms ─────────────────────────────────────────────────────────────────────

function BaseballForm({ d, u }: { d: BaseballData; u: (p: Partial<BaseballData>) => void }) {
  return <>
    <ImgPicker label="배경 사진 (선택)" value={d.bgImageB64} onChange={v => u({ bgImageB64: v })} cropFrame={{ w: 192, h: 282 }} />

    <div style={{ marginBottom: 10 }}>
      <div style={lbl}>경기 장소</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => u({ isAway: false })} style={{
          flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
          background: !d.isAway ? 'var(--color-primary)' : '#F0F0F0',
          color: !d.isAway ? '#fff' : '#555', fontWeight: !d.isAway ? 700 : 400
        }}>홈 경기</button>
        <button onClick={() => u({ isAway: true })} style={{
          flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
          background: d.isAway ? 'var(--color-primary)' : '#F0F0F0',
          color: d.isAway ? '#fff' : '#555', fontWeight: d.isAway ? 700 : 400
        }}>원정 경기</button>
      </div>
    </div>

    <F label="상대팀" value={d.away} onChange={v => u({ away: v })} placeholder="상대팀" />
    <Row>
      <F label="원정팀 스코어" value={d.awayScore} onChange={v => u({ awayScore: v })} placeholder="0" />
      <F label="홈팀 스코어" value={d.homeScore} onChange={v => u({ homeScore: v })} placeholder="0" />
    </Row>
    <Row>
      <F label="경기장" value={d.venue} onChange={v => u({ venue: v })} placeholder="라이온즈파크" />
      <F label="날짜" value={d.date} onChange={v => u({ date: v })} placeholder="2026.05.26" />
    </Row>
    <F label="구역 / 좌석" value={d.seat} onChange={v => u({ seat: v })} placeholder="블루존 3-3 n열 n번" />
    <F label="오늘 경기 한줄평 (선택)" value={d.memo} onChange={v => u({ memo: v })} placeholder="지금 본게 프로야구야?" />
  </>
}

function TicketForm({ d, u }: { d: TicketData; u: (p: Partial<TicketData>) => void }) {
  const hasSeat = d.category !== '전시' && d.category !== '기타'
  return <>
    <ImgPicker label="사진 (선택)" value={d.photoB64} onChange={v => u({ photoB64: v })} cropFrame={{ w: 280, h: 110 }} />
    <div style={{ marginBottom: 10 }}>
      <div style={lbl}>카테고리</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['영화', '공연', '전시', '기타'] as TicketData['category'][]).map(c => (
          <button key={c} onClick={() => u({ category: c })} style={{
            flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
            background: d.category === c ? 'var(--color-primary)' : '#F0F0F0',
            color: d.category === c ? '#fff' : '#555',
          }}>{c}</button>
        ))}
      </div>
    </div>
    <F label="제목" value={d.title} onChange={v => u({ title: v })} placeholder="영화제목" />
    <Row>
      <F label="날짜" value={d.date} onChange={v => u({ date: v })} placeholder="2025.05.26" />
      <F label="시간" value={d.time} onChange={v => u({ time: v })} placeholder="00:00" />
    </Row>
    {hasSeat ? (
      <Row>
        <F label="장소" value={d.venue} onChange={v => u({ venue: v })} placeholder="넷플릭스" />
        <F label="좌석" value={d.seat} onChange={v => u({ seat: v })} placeholder="침대" />
      </Row>
    ) : (
      <F label="장소" value={d.venue} onChange={v => u({ venue: v })} placeholder="장소" />
    )}
    <PriceF label="가격 (선택)" value={d.price} onChange={v => u({ price: v })} placeholder="12000" />
  </>
}

function GameForm({ d, u }: { d: GameData; u: (p: Partial<GameData>) => void }) {
  const [customColors, setCustomColors] = React.useState<string[]>(['', '', ''])
  const [hexInput, setHexInput] = React.useState('')
  const PRESETS = [{ color: '#f9f8f6', label: '미색' }, { color: '#1a1a1a', label: '검정' }]
  const applyHex = () => {
    const hex = hexInput.trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return
    u({ frameColor: hex })
    const slot = customColors.findIndex(c => !c)
    if (slot >= 0) { const nc = [...customColors]; nc[slot] = hex; setCustomColors(nc) }
    setHexInput('')
  }
  return <>
    <ImgPicker label="게임 스크린샷 (선택)" value={d.screenshotB64} onChange={v => u({ screenshotB64: v })} cropFrame={{ w: 196, h: 158 }} />

    <div style={{ marginBottom: 10 }}>
      <div style={lbl}>폴라로이드 틀 색상</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {PRESETS.map(p => (
          <div key={p.color} onClick={() => u({ frameColor: p.color })} title={p.label} style={{
            width: 28, height: 28, borderRadius: 6, background: p.color, cursor: 'pointer',
            border: d.frameColor === p.color ? '2px solid var(--color-primary)' : '1.5px solid #ddd',
          }} />
        ))}
        {customColors.map((c, i) => (
          <div key={i} onClick={() => { if (c) u({ frameColor: c }) }}
            onContextMenu={e => { e.preventDefault(); const nc = [...customColors]; nc[i] = ''; setCustomColors(nc) }}
            style={{
              width: 28, height: 28, borderRadius: 6, background: c || '#f5f5f5', cursor: c ? 'pointer' : 'default',
              border: c && d.frameColor === c ? '2px solid var(--color-primary)' : '1.5px solid #ddd',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {!c && <span style={{ fontSize: 14, color: '#ccc' }}>+</span>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: d.frameColor || '#f9f8f6', border: '1.5px solid #ddd', flexShrink: 0 }} />
        <input value={hexInput} onChange={e => setHexInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyHex()}
          placeholder="#f9f8f6" style={{ ...inp, flex: 1 }} />
        <button onClick={applyHex} style={{
          padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0',
          background: '#fafafa', cursor: 'pointer', fontSize: 12, flexShrink: 0,
        }}>적용</button>
      </div>
    </div>

    <ImgPicker label="틀 배경 이미지 (선택)" value={d.frameBgB64} onChange={v => u({ frameBgB64: v })} />
    <F label="게임 타이틀" value={d.title} onChange={v => u({ title: v })} placeholder="친구모아 아일랜드" />
    <F label="날짜" value={d.date} onChange={v => u({ date: v })} placeholder="2026.05.26" />
    <F label="오늘의 한마디" value={d.oneiner} onChange={v => u({ oneiner: v })} placeholder="오늘 해낸 것" />
  </>
}

function ReceiptForm({ d, u }: { d: ReceiptData; u: (p: Partial<ReceiptData>) => void }) {
  const setItem = (i: number, p: Partial<ReceiptItem>) =>
    u({ items: d.items.map((it, idx) => idx === i ? { ...it, ...p } : it) })
  const currency = d.currency ?? 'KRW'
  const curSym = CURRENCIES.find(c => c.code === currency)?.symbol ?? '₩'
  return <>
    <Row>
      <F label="가게 이름" value={d.store} onChange={v => u({ store: v })} placeholder="집" />
      <F label="날짜" value={d.date} onChange={v => u({ date: v })} placeholder="2026.05.26" />
    </Row>
    <div style={{ marginBottom: 9 }}>
      <div style={lbl}>통화</div>
      <select value={currency} onChange={e => u({ currency: e.target.value })}
        style={{ ...inp, width: '100%', cursor: 'pointer' }}>
        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
      </select>
    </div>
    <div style={{ marginBottom: 8 }}>
      <div style={lbl}>항목</div>
      {d.items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <input value={it.name} onChange={e => setItem(i, { name: e.target.value })} placeholder="메뉴 이름" style={{ ...inp, flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#888', padding: '0 4px', background: '#f0f0f0', border: '1px solid #e0e0e0', borderRight: 'none', borderRadius: '6px 0 0 6px', height: 30, display: 'flex', alignItems: 'center' }}>{curSym}</span>
            <input value={it.price} onChange={e => setItem(i, { price: e.target.value })} placeholder="0" style={{ ...inp, width: 60, borderRadius: '0 6px 6px 0' }} />
          </div>
          {d.items.length > 1 && (
            <button onClick={() => u({ items: d.items.filter((_, j) => j !== i) })}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#CCC', fontSize: 14, flexShrink: 0 }}>✕</button>
          )}
        </div>
      ))}
      <button onClick={() => u({ items: [...d.items, { name: '', price: '' }] })}
        style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ 항목 추가</button>
    </div>
    <F label="하단 문구" value={d.footer} onChange={v => u({ footer: v })} placeholder="감사합니다 ✦" />
  </>
}

function WishlistForm({ d, u }: { d: WishlistData; u: (p: Partial<WishlistData>) => void }) {
  return <>
    <ImgPicker label="제품 사진 (선택)" value={d.photoB64} onChange={v => u({ photoB64: v })} cropFrame={{ w: 260, h: 140 }} />
    <F label="아이템 이름" value={d.item} onChange={v => u({ item: v })} placeholder="닌텐도 스위치 2세대" />
    <Row>
      <PriceF label="가격" value={d.price} onChange={v => u({ price: v })} placeholder="750000" />
      <F label="날짜" value={d.date} onChange={v => u({ date: v })} placeholder="2026.05.26" />
    </Row>
    <StarRating label="위시 점수 / 구매 만족도" value={d.wishScore} onChange={v => u({ wishScore: v })} />
    <F label="한줄평 (선택)" value={d.oneiner} onChange={v => u({ oneiner: v })} placeholder="고민은 배송을 늦출 뿐" />
    <F label="링크 (선택, Cmd/Ctrl+클릭으로 열기)" value={d.link} onChange={v => u({ link: v })} placeholder="https://..." />
  </>
}

function TransportForm({ d, u }: { d: TransportData; u: (p: Partial<TransportData>) => void }) {
  return <>
    <div style={{ marginBottom: 10 }}>
      <div style={lbl}>교통수단</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {(['KTX', 'SRT', '버스', '지하철', '비행기', '기타'] as TransportData['type'][]).map(t => (
          <button key={t} onClick={() => u({ type: t })} style={{
            flex: 1, minWidth: 44, padding: '5px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11,
            background: d.type === t ? 'var(--color-primary)' : '#F0F0F0',
            color: d.type === t ? '#fff' : '#555',
          }}>{t}</button>
        ))}
      </div>
      {d.type === '기타' && (
        <input value={d.typeLabel} onChange={e => u({ typeLabel: e.target.value })}
          placeholder="수단 이름 직접 입력 (예: 선박, 택시…)"
          style={{ ...inp, marginTop: 6 }} />
      )}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 20px 1fr', gap: 6, alignItems: 'end', marginBottom: 9 }}>
      <div><div style={lbl}>출발지</div><input value={d.from} onChange={e => u({ from: e.target.value })} placeholder="대구 / DAE" style={inp} /></div>
      <div style={{ textAlign: 'center', paddingBottom: 8, color: '#aaa', fontSize: 14 }}>▶</div>
      <div><div style={lbl}>도착지</div><input value={d.to} onChange={e => u({ to: e.target.value })} placeholder="부산 / PUS" style={inp} /></div>
    </div>
    <Row>
      <F label="날짜" value={d.date} onChange={v => u({ date: v })} placeholder="2026.05.26" />
      <F label="출발 시간" value={d.departureTime} onChange={v => u({ departureTime: v })} placeholder="09:35" />
    </Row>
    <Row>
      <F label="편명 / 차량번호" value={d.vehicleNumber} onChange={v => u({ vehicleNumber: v })} placeholder="KE123 / KTX 101" />
      <F label="좌석 / 게이트" value={d.seat} onChange={v => u({ seat: v })} placeholder="12A / G32" />
    </Row>
    <PriceF label="가격 (선택)" value={d.price} onChange={v => u({ price: v })} placeholder="59800" />
  </>
}

function CheckinForm({ d, u }: { d: CheckinData; u: (p: Partial<CheckinData>) => void }) {
  return <>
    <F label="장소 이름" value={d.place} onChange={v => u({ place: v })} placeholder="카아페에" />
    <Row>
      <F label="카테고리" value={d.category} onChange={v => u({ category: v })} placeholder="카페" />
      <F label="날짜" value={d.date} onChange={v => u({ date: v })} placeholder="2026.05.26" />
    </Row>
    <F label="주소 (선택)" value={d.address} onChange={v => u({ address: v })} placeholder="서울 성동구..." />
    <Row>
      <F label="방문 목적" value={d.purpose} onChange={v => u({ purpose: v })} placeholder="친목도모" />
      <F label="동행" value={d.companions} onChange={v => u({ companions: v })} placeholder="친구 a, 친구 b" />
    </Row>
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={lbl}>평점</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'monospace' }}>
          {d.rating.toFixed(1)} / 5.0
        </div>
      </div>
      <input type="range" min={0} max={5} step={0.1} value={d.rating}
        onChange={e => u({ rating: parseFloat(e.target.value) })}
        style={{ width: '100%', accentColor: 'var(--color-primary)', cursor: 'pointer' }} />
    </div>
    <F label="한줄 인상 (선택)" value={d.memo} onChange={v => u({ memo: v })} placeholder="또 오고 싶다!" />
    <F label="링크 (선택, Cmd/Ctrl+클릭으로 열기)" value={d.link} onChange={v => u({ link: v })} placeholder="https://maps.app.goo.gl/..." />
  </>
}

function CoffeeForm({ d, u }: { d: CoffeeData; u: (p: Partial<CoffeeData>) => void }) {
  return <>
    <Row>
      <F label="로스터리 / 브랜드" value={d.roastery} onChange={v => u({ roastery: v })} placeholder="커피리브레" />
      <F label="원두명" value={d.bean} onChange={v => u({ bean: v })} placeholder="에티오피아 구지" />
    </Row>
    <div style={{ marginBottom: 10 }}>
      <div style={lbl}>온도</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {([false, true] as const).map(iced => (
          <button key={String(iced)} onClick={() => u({ isIced: iced })}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 8, border: '1.5px solid',
              borderColor: d.isIced === iced ? (iced ? '#1565C0' : '#BF360C') : '#E0E0E0',
              background: d.isIced === iced ? (iced ? '#E3F2FD' : '#FFF3E0') : '#fafafa',
              color: d.isIced === iced ? (iced ? '#1565C0' : '#BF360C') : '#999',
              fontWeight: d.isIced === iced ? 700 : 400, fontSize: 12, cursor: 'pointer',
            }}>
            {iced ? '❄ ICE' : '♨ HOT'}
          </button>
        ))}
      </div>
    </div>
    <F label="추출 도구" value={d.equipment} onChange={v => u({ equipment: v })} placeholder="칼리타 웨이브 155" />
    <div style={{ marginBottom: 9 }}>
      <div style={lbl}>레시피</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <div>
          <div style={{ fontSize: 10, color: '#bbb', marginBottom: 3 }}>원두 (g)</div>
          <input value={d.beanGrams} onChange={e => u({ beanGrams: e.target.value })} placeholder="15" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#bbb', marginBottom: 3 }}>물 (ml)</div>
          <input value={d.waterMl} onChange={e => u({ waterMl: e.target.value })} placeholder="250" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: '#bbb', marginBottom: 3 }}>추출 시간</div>
          <input value={d.brewTime} onChange={e => u({ brewTime: e.target.value })} placeholder="3:30" style={inp} />
        </div>
      </div>
    </div>
    <F label="테이스팅 노트 (선택)" value={d.note} onChange={v => u({ note: v })} placeholder="산미 있고 은은한 꽃향기" />
  </>
}

function FoodForm({ d, u }: { d: FoodData; u: (p: Partial<FoodData>) => void }) {
  const MAT_PRESETS = [
    { color: '#FDEBD0', label: '살구' },
    { color: '#E8F5E9', label: '민트' },
    { color: '#FFF3E0', label: '크림' },
  ]
  const [customMats, setCustomMats] = React.useState<string[]>(['', '', ''])
  const [matHex, setMatHex] = React.useState('')

  const applyMatHex = () => {
    const hex = matHex.trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return
    u({ matColor: hex, matImageB64: '' })
    const slot = customMats.findIndex(c => !c)
    if (slot >= 0) { const nc = [...customMats]; nc[slot] = hex; setCustomMats(nc) }
    setMatHex('')
  }

  return <>
    <ImgPicker label="음식 사진 (선택)" value={d.photoB64} onChange={v => u({ photoB64: v })} cropFrame={{ w: 136, h: 136 }} />
    <F label="음식 메뉴" value={d.dish} onChange={v => u({ dish: v })} placeholder="매참김밥" />
    <Row>
      <F label="음식점 / 브랜드" value={d.restaurant} onChange={v => u({ restaurant: v })} placeholder="바뷔치" />
      <F label="날짜" value={d.date} onChange={v => u({ date: v })} placeholder="2026.05.26" />
    </Row>
    <F label="맛 한줄평 (선택)" value={d.comment} onChange={v => u({ comment: v })} placeholder="없어지지 마 바뷔치야" />

    <div style={{ marginBottom: 10 }}>
      <div style={lbl}>테이블 매트 색상</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {MAT_PRESETS.map(p => (
          <div key={p.color} onClick={() => u({ matColor: p.color, matImageB64: '' })} title={p.label} style={{
            width: 28, height: 28, borderRadius: 6, background: p.color, cursor: 'pointer',
            border: !d.matImageB64 && d.matColor === p.color ? '2px solid var(--color-primary)' : '1.5px solid #ddd',
          }} />
        ))}
        {customMats.map((c, i) => (
          <div key={i}
            onClick={() => { if (c) u({ matColor: c, matImageB64: '' }) }}
            onContextMenu={e => { e.preventDefault(); const nc = [...customMats]; nc[i] = ''; setCustomMats(nc) }}
            style={{
              width: 28, height: 28, borderRadius: 6, background: c || '#f5f5f5', cursor: c ? 'pointer' : 'default',
              border: c && !d.matImageB64 && d.matColor === c ? '2px solid var(--color-primary)' : '1.5px solid #ddd',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {!c && <span style={{ fontSize: 14, color: '#ccc' }}>+</span>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: d.matImageB64 ? 'transparent' : (d.matColor || '#FDEBD0'), border: '1.5px solid #ddd', flexShrink: 0, overflow: 'hidden' }}>
          {d.matImageB64 && <img src={d.matImageB64} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        </div>
        <input value={matHex} onChange={e => setMatHex(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyMatHex()}
          placeholder="#FDEBD0" style={{ ...inp, flex: 1 }} />
        <button onClick={applyMatHex} style={{
          padding: '5px 10px', borderRadius: 6, border: '1px solid #e0e0e0',
          background: '#fafafa', cursor: 'pointer', fontSize: 12, flexShrink: 0,
        }}>적용</button>
      </div>
    </div>
    <ImgPicker label="매트 배경 이미지 (선택)" value={d.matImageB64} onChange={v => u({ matImageB64: v })} />
  </>
}

function YoutubeForm({ d, u }: { d: YoutubeData; u: (p: Partial<YoutubeData>) => void }) {
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')

  const handleFetch = async () => {
    if (!d.url.trim()) return
    setFetching(true); setError('')
    try {
      const [raw, watchHtml] = await Promise.all([
        api.http.fetchText(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(d.url)}&format=json`
        ),
        api.http.fetchText(d.url).catch(() => ''),
      ])
      const info = JSON.parse(raw)
      let thumbUrl = ''
      if (info.thumbnail_url) {
        const b64 = await api.http.fetchImageB64(info.thumbnail_url).catch(() => '')
        if (b64) thumbUrl = toDataUrl(b64)
      }
      // 워치 페이지 HTML에서 lengthSeconds 추출
      let duration = ''
      const secMatch = watchHtml.match(/"lengthSeconds":"(\d+)"/)
      if (secMatch) {
        const secs = parseInt(secMatch[1])
        const h = Math.floor(secs / 3600)
        const m = Math.floor((secs % 3600) / 60)
        const s = secs % 60
        duration = h > 0
          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${m}:${String(s).padStart(2, '0')}`
      }
      // 채널 아바타: author_url 페이지의 og:image 추출
      let channelAvatarB64 = ''
      if (info.author_url) {
        const channelHtml = await api.http.fetchText(info.author_url).catch(() => '')
        const ogMatch = channelHtml.match(/<meta property="og:image" content="([^"]+)"/)
        if (ogMatch) {
          const avatarB64 = await api.http.fetchImageB64(ogMatch[1]).catch(() => '')
          if (avatarB64) channelAvatarB64 = toDataUrl(avatarB64)
        }
      }
      u({ title: info.title || '', channel: info.author_name || '', thumbnailB64: thumbUrl, channelAvatarB64, duration })
    } catch {
      setError('영상 정보를 불러오지 못했어요')
    } finally {
      setFetching(false)
    }
  }

  return <>
    <div style={{ marginBottom: 9 }}>
      <div style={lbl}>YouTube 링크</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={d.url} onChange={e => u({ url: e.target.value })}
          placeholder="https://youtu.be/..."
          style={{ ...inp, flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && handleFetch()} />
        <button onClick={handleFetch} disabled={fetching || !d.url.trim()} style={{
          padding: '5px 14px', borderRadius: 6, border: 'none', flexShrink: 0,
          background: fetching || !d.url.trim() ? '#ccc' : '#FF0000',
          color: '#fff', cursor: fetching || !d.url.trim() ? 'default' : 'pointer', fontSize: 12,
        }}>{fetching ? '…' : '불러오기'}</button>
      </div>
      {error && <div style={{ fontSize: 11, color: '#e44', marginTop: 4 }}>{error}</div>}
    </div>

    {d.title && (
      <div style={{ marginBottom: 10, background: '#fafafa', border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
        {d.thumbnailB64 && <img src={d.thumbnailB64} style={{ width: '100%', display: 'block' }} />}
        <div style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', marginBottom: 2 }}>{d.title}</div>
          <div style={{ fontSize: 11, color: '#FF0000' }}>{d.channel}</div>
        </div>
      </div>
    )}

    <F label="시청소감" value={d.impression} onChange={v => u({ impression: v })} placeholder="대박적 사건" />
    <F label="날짜" value={d.date} onChange={v => u({ date: v })} placeholder="2026.05.26" />
  </>
}

function QuoteForm({ d, u }: { d: QuoteData; u: (p: Partial<QuoteData>) => void }) {
  return <>
    <div style={{ marginBottom: 12 }}>
      <div style={lbl}>레이아웃</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => u({ layout: 'quote' })} style={{
          flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
          background: d.layout !== 'manuscript' ? 'var(--color-primary)' : '#F0F0F0',
          color: d.layout !== 'manuscript' ? '#fff' : '#555',
        }}>인용구 박스</button>
        <button onClick={() => u({ layout: 'manuscript' })} style={{
          flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
          background: d.layout === 'manuscript' ? 'var(--color-primary)' : '#F0F0F0',
          color: d.layout === 'manuscript' ? '#fff' : '#555',
        }}>원고지</button>
      </div>
    </div>
    {d.layout === 'manuscript' && (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>줄바꿈 사용</span>
        <div onClick={() => u({ manuscriptNewline: !d.manuscriptNewline })} style={{
          width: 36, height: 20, borderRadius: 10, cursor: 'pointer', position: 'relative',
          background: d.manuscriptNewline ? 'var(--color-primary)' : '#ccc', transition: 'background 0.2s',
        }}>
          <div style={{
            position: 'absolute', top: 2, left: d.manuscriptNewline ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
      </div>
    )}
    <div style={{ marginBottom: 9 }}>
      <div style={lbl}>문장</div>
      <textarea value={d.text} onChange={e => u({ text: e.target.value })} placeholder="마음에 와닿은 문장..."
        style={{ ...inp, height: 90, resize: 'vertical' as const }} />
    </div>
    <Row>
      <F label="출처 (책·매체)" value={d.source} onChange={v => u({ source: v })} placeholder="어린 왕자" />
      <F label="저자" value={d.author} onChange={v => u({ author: v })} placeholder="생텍쥐페리" />
    </Row>
    <F label="메모 (선택)" value={d.memo} onChange={v => u({ memo: v })} placeholder="감상..." />
  </>
}

function MusicForm({ d, u }: { d: MusicData; u: (p: Partial<MusicData>) => void }) {
  return <>
    <ImgPicker label="앨범 아트 (선택)" value={d.albumArtB64} onChange={v => u({ albumArtB64: v })} cropFrame={{ w: 100, h: 100 }} />
    <F label="곡 제목" value={d.title} onChange={v => u({ title: v })} placeholder="수선화" />
    <F label="아티스트" value={d.artist} onChange={v => u({ artist: v })} placeholder="이츠" />
    <F label="마음에 드는 가사 한 줄" value={d.lyric} onChange={v => u({ lyric: v })} placeholder="보잘것없는 것에 망치거나 아파하지 않길" />
  </>
}

function MakeupForm({ d, u }: { d: MakeupData; u: (p: Partial<MakeupData>) => void }) {
  return <>
    <F label="날짜" value={d.date} onChange={v => u({ date: v })} />
    <F label="선크림" value={d.sun} onChange={v => u({ sun: v })} placeholder="선크림" />
    <F label="베이스" value={d.base} onChange={v => u({ base: v })} placeholder="베이스" />
    <F label="쉐딩" value={d.shading} onChange={v => u({ shading: v })} placeholder="쉐딩" />
    <F label="아이섀도" value={d.eyeShadow} onChange={v => u({ eyeShadow: v })} placeholder="섀도" />
    <F label="아이라이너" value={d.eyeLiner} onChange={v => u({ eyeLiner: v })} placeholder="라이너" />
    <F label="마스카라" value={d.eyeMascara} onChange={v => u({ eyeMascara: v })} placeholder="마스카라" />
    <F label="언더섀도" value={d.underShadow} onChange={v => u({ underShadow: v })} placeholder="언더섀도우" />
    <F label="언더마스카라" value={d.underMascara} onChange={v => u({ underMascara: v })} placeholder="언더마스카라" />
    <F label="언더하이라이터" value={d.underHighlighter} onChange={v => u({ underHighlighter: v })} placeholder="언더하이라이터" />
    <F label="하이라이터" value={d.highlighter} onChange={v => u({ highlighter: v })} placeholder="하이라이터" />
    <F label="블러셔" value={d.blush} onChange={v => u({ blush: v })} placeholder="블러셔" />
    <F label="립" value={d.lip} onChange={v => u({ lip: v })} placeholder="립" />
    <F label="오늘의 무드" value={d.mood} onChange={v => u({ mood: v })} placeholder="추구미" />
    <F label="한줄 코멘트" value={d.comment} onChange={v => u({ comment: v })} placeholder="오늘 메이크업" />
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', minWidth: 72 }}>만족도</span>
      <input type="range" min={0} max={10} value={d.rating} onChange={e => u({ rating: Number(e.target.value) })} style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: 'var(--color-primary-dark)', minWidth: 20 }}>{d.rating}</span>
    </div>
  </>
}

function SkincareForm({ d, u }: { d: SkincareData; u: (p: Partial<SkincareData>) => void }) {
  const [fetching, setFetching] = useState(false)

  const wmoLabel = (c: number): string => {
    if (c === 0) return '맑음'
    if (c === 1) return '대체로 맑음'
    if (c === 2) return '부분 흐림'
    if (c === 3) return '흐림'
    if (c <= 48) return '안개'
    if (c <= 55) return '가랑비'
    if (c <= 57) return '동결 이슬비'
    if (c <= 65) return '비'
    if (c <= 67) return '동결 비'
    if (c <= 75) return '눈'
    if (c === 77) return '싸락눈'
    if (c <= 82) return '소나기'
    if (c <= 86) return '눈 소나기'
    if (c === 95) return '뇌우'
    return '우박 동반 뇌우'
  }

  const fetchWeather = async (date: string) => {
    const apiDate = date.replace(/\./g, '-')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(apiDate)) return
    setFetching(true)
    try {
      let lat = 35.8714, lng = 128.6014, regionName = '대구'
      try {
        const raw = await api.settings.get('scrap_defaults')
        if (raw) {
          const region = JSON.parse(raw)?.skincare?.weatherRegion
          if (region) {
            try {
              // New format: JSON string with {name, lat, lng, country, admin1}
              const geo = JSON.parse(region)
              if (geo.lat != null && geo.lng != null) {
                lat = geo.lat; lng = geo.lng; regionName = geo.name ?? region
              }
            } catch {
              // Old format: string key into WEATHER_REGIONS
              if (WEATHER_REGIONS[region]) {
                lat = WEATHER_REGIONS[region].lat; lng = WEATHER_REGIONS[region].lng; regionName = region
              }
            }
          }
        }
      } catch {}
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean&timezone=Asia%2FSeoul&start_date=${apiDate}&end_date=${apiDate}`
      void regionName
      const raw = await api.http.fetchText(url)
      const json = JSON.parse(raw) as { daily?: { weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; relative_humidity_2m_mean?: number[] } }
      const code = json.daily?.weather_code?.[0]
      const tMax = json.daily?.temperature_2m_max?.[0]
      const tMin = json.daily?.temperature_2m_min?.[0]
      const hum  = json.daily?.relative_humidity_2m_mean?.[0]
      const label = code != null ? wmoLabel(code) : ''
      const temp  = tMin != null && tMax != null ? `${Math.round(tMin)}°/${Math.round(tMax)}°` : ''
      const hText = hum  != null ? `습도 ${Math.round(hum)}%` : ''
      const result = [label, temp, hText].filter(Boolean).join(' · ')
      if (result) u({ weather: result })
    } catch {}
    setFetching(false)
  }

  return <>
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <div style={{ flex: 1 }}>
        <F label="날짜" value={d.date} onChange={v => { u({ date: v }); fetchWeather(v) }} />
      </div>
      <button onClick={() => fetchWeather(d.date)} disabled={fetching}
        style={{ marginBottom: 8, padding: '0 10px', height: 32, borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: fetching ? '#bbb' : 'var(--color-text-muted)', cursor: fetching ? 'default' : 'pointer', fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
        {fetching ? '조회 중…' : '🌤 날씨 자동 입력'}
      </button>
    </div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
      {(['AM', 'PM'] as const).map(t => (
        <button key={t} onClick={() => u({ time: t })}
          style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: `1px solid ${d.time === t ? 'var(--color-primary)' : 'var(--color-border)'}`, background: d.time === t ? 'var(--color-primary-light)' : 'transparent', color: d.time === t ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}>
          {t}
        </button>
      ))}
    </div>
    <F label="피부 컨디션" value={d.condition} onChange={v => u({ condition: v })} placeholder="촉촉함 / 당김 / 트러블" />
    <F label="날씨 (자동 입력 가능)" value={d.weather} onChange={v => u({ weather: v })} placeholder="맑음 · 12°/24° · 습도 45%" />
    <F label="토너" value={d.toner} onChange={v => u({ toner: v })} placeholder="토너" />
    <F label="세럼" value={d.serum} onChange={v => u({ serum: v })} placeholder="에센스" />
    <F label="크림" value={d.cream} onChange={v => u({ cream: v })} placeholder="크림" />
    <F label="스페셜 케어" value={d.special} onChange={v => u({ special: v })} placeholder="시트마스크 / 앰플 등" />
    <F label="메모" value={d.memo} onChange={v => u({ memo: v })} placeholder="사막같은 여기서 날 구해줘..." />
  </>
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function TemplateModal({ globalFont, systemFonts, onConfirm, onCancel, editMode }: Props) {
  const [step, setStep] = useState<'category' | 'template' | 'form'>(editMode ? 'form' : 'category')
  const [category, setCategory] = useState<Category>('hobby')
  const [templateId, setTemplateId] = useState<TemplateId>(editMode?.templateId ?? 'baseball')
  const [allDefaults, setAllDefaults] = useState<Record<string, Record<string, string>>>({})
  const [data, setData] = useState<AnyData>(editMode?.data ?? defaultData('baseball'))
  const [cardFont, setCardFont] = useState(globalFont || 'Apple SD Gothic Neo')
  const [fontSearch, setFontSearch] = useState('')
  const [showFontList, setShowFontList] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [cropPending, setCropPending] = useState<{ src: string; w: number; h: number; resolve: (url: string | null) => void } | null>(null)
  const [globalProfile, setGlobalProfile] = useState<{ name: string; photo: string }>({ name: '', photo: '' })

  const openCrop = React.useCallback((src: string, frame: { w: number; h: number }): Promise<string | null> => {
    return new Promise(resolve => setCropPending({ src, w: frame.w, h: frame.h, resolve }))
  }, [])

  useEffect(() => {
    api.settings.get('scrap_defaults').then(raw => {
      if (raw) try { setAllDefaults(JSON.parse(raw)) } catch {}
    }).catch(() => {})
    api.settings.get('globalProfile').then(raw => {
      if (raw) try {
        const p = JSON.parse(raw)
        setGlobalProfile({ name: p.name ?? '', photo: p.photo ?? '' })
      } catch {}
    }).catch(() => {})
  }, [])

  const upd = (patch: Partial<AnyData>) => setData(prev => ({ ...prev, ...patch } as AnyData))

  const filteredFonts = fontSearch
    ? systemFonts.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
    : systemFonts

  const selectedCat = CATEGORIES.find(c => c.id === category)!
  const templates = TEMPLATES_BY_CAT[category]
  const currentTpl = templates.find(t => t.id === templateId)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const cleanupFont = await preloadFont(cardFont)
      const d = data as any
      const imgs: Imgs = {}
      await Promise.all(
        ([['bg', d.bgImageB64], ['screenshot', d.screenshotB64], ['photo', d.photoB64], ['albumArt', d.albumArtB64], ['thumbnail', d.thumbnailB64], ['channelAvatar', d.channelAvatarB64], ['frameBg', d.frameBgB64], ['mat', d.matImageB64]] as [string, string][])
          .map(async ([key, src]) => { if (src) try { imgs[key] = await loadImg(src) } catch {} })
      )
      if (globalProfile.photo) {
        try { imgs.userProfile = await loadImg(globalProfile.photo) } catch {}
      }
      const r = generate(templateId, data, cardFont, imgs, globalProfile.name)
      cleanupFont()
      const linkUrl =
        (templateId === 'wishlist' || templateId === 'checkin') && d.link ? d.link :
        templateId === 'youtube' && d.url ? d.url :
        undefined
      onConfirm(r.dataUrl, r.w, r.h, linkUrl, templateId, data as Record<string, any>)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }} onClick={onCancel}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 24, width: 400,
        maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>

        {/* ── 카테고리 선택 ── */}
        {step === 'category' && <>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', marginBottom: 3 }}>📋 스크랩 템플릿</div>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 18 }}>어떤 카드를 만들까요?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => { setCategory(cat.id); setStep('template') }} style={{
                border: '1.5px solid #eee', borderRadius: 12, padding: '16px 14px 14px',
                background: '#fafafa', cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 7 }}>{cat.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{cat.label}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                  {TEMPLATES_BY_CAT[cat.id].map(t => t.label).join(' · ')}
                </div>
              </button>
            ))}
          </div>
          <button onClick={onCancel} style={{
            width: '100%', padding: '9px 0', border: '1px solid #e8e8e8',
            borderRadius: 10, background: 'none', cursor: 'pointer', fontSize: 13, color: '#aaa',
          }}>취소</button>
        </>}

        {/* ── 템플릿 선택 ── */}
        {step === 'template' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setStep('category')} style={{
              border: '1px solid #e8e8e8', borderRadius: 8, background: 'none',
              cursor: 'pointer', width: 28, height: 28, fontSize: 14, color: '#888',
            }}>←</button>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{selectedCat.emoji} {selectedCat.label}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {templates.map(t => (
              <button key={t.id} onClick={() => { setTemplateId(t.id); setData(defaultData(t.id, allDefaults[t.id] ?? {})); setStep('form') }} style={{
                border: '1.5px solid #eee', borderRadius: 12, padding: '14px 14px 12px',
                background: '#fafafa', cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ fontSize: 24, lineHeight: 1, marginBottom: 6 }}>{t.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{t.label}</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{t.desc}</div>
              </button>
            ))}
          </div>
          <button onClick={onCancel} style={{
            width: '100%', padding: '9px 0', border: '1px solid #e8e8e8',
            borderRadius: 10, background: 'none', cursor: 'pointer', fontSize: 13, color: '#aaa',
          }}>취소</button>
        </>}

        {/* ── 폼 입력 ── */}
        {step === 'form' && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            {!editMode && (
              <button onClick={() => setStep('template')} style={{
                border: '1px solid #e8e8e8', borderRadius: 8, background: 'none',
                cursor: 'pointer', width: 28, height: 28, fontSize: 14, color: '#888',
              }}>←</button>
            )}
            <span style={{ fontSize: 15, fontWeight: 700 }}>{currentTpl?.emoji} {currentTpl?.label}{editMode ? ' 수정' : ''}</span>
          </div>

          {/* 폰트 선택 */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, marginBottom: 4 }}>
              카드 폰트 <span style={{ fontWeight: 400, color: '#bbb' }}>{cardFont}</span>
            </div>
            <input value={fontSearch}
              onChange={e => { setFontSearch(e.target.value); setShowFontList(true) }}
              onFocus={() => setShowFontList(true)}
              placeholder="폰트 검색…"
              style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #e0e0e0', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }} />
            {showFontList && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8,
                maxHeight: 160, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              }}>
                <div onMouseDown={() => { setCardFont('Apple SD Gothic Neo'); setFontSearch(''); setShowFontList(false) }}
                  style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: '#555', borderBottom: '1px solid #f5f5f5' }}>
                  기본 (Apple SD Gothic Neo)
                </div>
                {filteredFonts.map(f => (
                  <div key={f} onMouseDown={() => { setCardFont(f); setFontSearch(''); setShowFontList(false) }}
                    style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', fontFamily: `'${f}', sans-serif`, background: f === cardFont ? 'var(--color-primary-light)' : 'transparent' }}>
                    {f}
                  </div>
                ))}
              </div>
            )}
          </div>

          <CropCtx.Provider value={openCrop}>
            {templateId === 'baseball'  && <BaseballForm  d={data as BaseballData}  u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'ticket'    && <TicketForm    d={data as TicketData}    u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'game'      && <GameForm      d={data as GameData}      u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'receipt'   && <ReceiptForm   d={data as ReceiptData}   u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'wishlist'  && <WishlistForm  d={data as WishlistData}  u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'transport' && <TransportForm d={data as TransportData} u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'checkin'   && <CheckinForm   d={data as CheckinData}   u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'coffee'    && <CoffeeForm    d={data as CoffeeData}    u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'food_note' && <FoodForm      d={data as FoodData}      u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'youtube'   && <YoutubeForm   d={data as YoutubeData}   u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'quote'     && <QuoteForm     d={data as QuoteData}     u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'music'     && <MusicForm     d={data as MusicData}     u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'makeup'    && <MakeupForm    d={data as MakeupData}    u={p => upd(p as Partial<AnyData>)} />}
            {templateId === 'skincare'  && <SkincareForm  d={data as SkincareData}  u={p => upd(p as Partial<AnyData>)} />}
          </CropCtx.Provider>

          <button onClick={handleGenerate} disabled={generating} style={{
            marginTop: 14, width: '100%', padding: '11px 0',
            background: generating ? '#ccc' : 'var(--color-primary)', color: '#fff',
            border: 'none', borderRadius: 10, cursor: generating ? 'default' : 'pointer',
            fontSize: 14, fontWeight: 600,
          }}>
            {generating ? '생성 중...' : editMode ? '카드 업데이트 ✦' : '카드 생성 ✦'}
          </button>
        </>}
      </div>
      {cropPending && (
        <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <CropModal
            src={cropPending.src}
            frameW={cropPending.w}
            frameH={cropPending.h}
            initialShape="none"
            customShapes={[]}
            onAddCustomShape={() => {}}
            onConfirm={(dataUrl) => { cropPending.resolve(dataUrl); setCropPending(null) }}
            onCancel={() => { cropPending.resolve(null); setCropPending(null) }}
          />
        </div>
      )}
    </div>
  )
}
