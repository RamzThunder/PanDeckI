import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api'

export interface CustomShape {
  id: string
  label: string
  points?: string   // kept for backward compat
  maskSrc?: string
}

const BUILTIN: { id: string; label: string }[] = [
  { id: 'none', label: '□' },
  { id: 'circle', label: '○' },
  { id: 'free', label: '자유형' },
]

interface Props {
  src: string
  frameW: number
  frameH: number
  initialShape: string
  initialBorderRadius?: number
  customShapes: CustomShape[]
  onConfirm: (croppedDataUrl: string, shape: string, newSize?: { w: number; h: number }, borderRadius?: number) => void
  onAddCustomShape: (shape: CustomShape) => void
  onCancel: () => void
}

const PREVIEW_MAX = 320
const MAX_OUT = 800

function radiusPx(w: number, h: number, radius = 0): number {
  const pct = Math.max(0, Math.min(50, radius))
  return Math.round(Math.min(w, h) * pct / 100)
}

function getOutputSize(w: number, h: number): { w: number; h: number } {
  const scale = Math.min(MAX_OUT / w, MAX_OUT / h)
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  }
}

function ShapeMask({ shape, w, h, customShapes }: { shape: string; w: number; h: number; customShapes: CustomShape[] }) {
  if (shape === 'none' || shape === 'free') return null

  const custom = shape.startsWith('custom_') ? customShapes.find(c => c.id === shape) : undefined

  if (custom?.maskSrc) {
    return (
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'rgba(0,0,0,0.45)',
        WebkitMaskImage: `url(${custom.maskSrc}), linear-gradient(white, white)`,
        WebkitMaskComposite: 'xor' as React.CSSProperties['WebkitMaskComposite'],
        WebkitMaskSize: 'contain, 100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
      } as React.CSSProperties} />
    )
  }

  if (shape === 'circle') {
    const r = Math.min(w, h) / 2
    return (
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <defs>
          <mask id="crop-preview-mask">
            <rect width={w} height={h} fill="white" />
            <circle cx={w / 2} cy={h / 2} r={r} fill="black" />
          </mask>
        </defs>
        <rect width={w} height={h} fill="rgba(0,0,0,0.5)" mask="url(#crop-preview-mask)" />
      </svg>
    )
  }

  return null
}

export default function CropModal({
  src, frameW, frameH, initialShape, initialBorderRadius = 0,
  customShapes, onConfirm, onAddCustomShape, onCancel,
}: Props): JSX.Element {
  const aspect = frameW / frameH
  const previewW = aspect >= 1 ? PREVIEW_MAX : Math.round(PREVIEW_MAX * aspect)
  const previewH = aspect >= 1 ? Math.round(PREVIEW_MAX / aspect) : PREVIEW_MAX

  const [imgX, setImgX] = useState(0)
  const [imgY, setImgY] = useState(0)
  const [scale, setScale] = useState(1)

  const [freeImgLayout, setFreeImgLayout] = useState({ left: 0, top: 0, w: 0, h: 0 })
  const [freeRect, setFreeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const freeDragging = useRef(false)
  const freeStart = useRef<{ x: number; y: number } | null>(null)

  const [selectedShape, setSelectedShape] = useState(initialShape)
  const [borderRadius, setBorderRadius] = useState(initialBorderRadius)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [bgHexInput, setBgHexInput] = useState('#ffffff')
  const [favColors, setFavColors] = useState<string[]>([])
  const [showAddShape, setShowAddShape] = useState(false)
  const [newShapeName, setNewShapeName] = useState('')
  const [pendingMaskSrc, setPendingMaskSrc] = useState<string | null>(null)

  const isFree = selectedShape === 'free'

  useEffect(() => {
    api.settings.get('favBgColors').then(raw => {
      if (raw) try { setFavColors(JSON.parse(raw)) } catch {}
    }).catch(() => {})
  }, [])

  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const baseScale = useRef(1)

  const computeFitLayout = (img: HTMLImageElement) => {
    const fitScale = Math.min(previewW / img.naturalWidth, previewH / img.naturalHeight)
    const fw = img.naturalWidth * fitScale
    const fh = img.naturalHeight * fitScale
    return { left: (previewW - fw) / 2, top: (previewH - fh) / 2, w: fw, h: fh, fitScale }
  }

  const initNormalMode = (img: HTMLImageElement) => {
    const bs = Math.max(previewW / img.naturalWidth, previewH / img.naturalHeight)
    baseScale.current = bs
    const dw = img.naturalWidth * bs
    const dh = img.naturalHeight * bs
    setImgX((previewW - dw) / 2)
    setImgY((previewH - dh) / 2)
    setScale(1)
  }

  const initFreeMode = (img: HTMLImageElement) => {
    const { left, top, w, h, fitScale } = computeFitLayout(img)
    baseScale.current = fitScale
    setFreeImgLayout({ left, top, w, h })
    setFreeRect(null)
  }

  const onImgLoad = () => {
    const img = imgRef.current!
    if (isFree) initFreeMode(img)
    else initNormalMode(img)
  }

  useEffect(() => {
    const img = imgRef.current
    if (!img || !img.complete || !img.naturalWidth) return
    if (isFree) initFreeMode(img)
    else initNormalMode(img)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFree])

  const getDisplaySize = () => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return { w: previewW, h: previewH }
    const bs = baseScale.current * scale
    return { w: img.naturalWidth * bs, h: img.naturalHeight * bs }
  }

  const clampPos = (x: number, y: number, dw: number, dh: number) => {
    const minX = dw >= previewW ? previewW - dw : 0
    const maxX = dw >= previewW ? 0 : previewW - dw
    const minY = dh >= previewH ? previewH - dh : 0
    const maxY = dh >= previewH ? 0 : previewH - dh
    return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (isFree) {
      const container = containerRef.current
      if (!container || !imgRef.current?.naturalWidth) return
      const rect = container.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const fi = freeImgLayout
      const cx = Math.max(fi.left, Math.min(fi.left + fi.w, px))
      const cy = Math.max(fi.top, Math.min(fi.top + fi.h, py))
      freeStart.current = { x: cx, y: cy }
      setFreeRect({ x: cx, y: cy, w: 0, h: 0 })
      freeDragging.current = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: imgX, oy: imgY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (isFree) {
      if (!freeDragging.current || !freeStart.current) return
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const fi = freeImgLayout
      const cx = Math.max(fi.left, Math.min(fi.left + fi.w, px))
      const cy = Math.max(fi.top, Math.min(fi.top + fi.h, py))
      const start = freeStart.current
      setFreeRect({
        x: Math.min(start.x, cx), y: Math.min(start.y, cy),
        w: Math.abs(cx - start.x), h: Math.abs(cy - start.y),
      })
      return
    }
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.sx
    const dy = e.clientY - dragRef.current.sy
    const { w: dw, h: dh } = getDisplaySize()
    const { x, y } = clampPos(dragRef.current.ox + dx, dragRef.current.oy + dy, dw, dh)
    setImgX(x); setImgY(y)
  }

  const onPointerUp = () => {
    dragRef.current = null
    freeDragging.current = false
    freeStart.current = null
  }

  const onWheel = (e: React.WheelEvent) => {
    if (isFree) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.3, Math.min(5, scale * delta))
    const img = imgRef.current
    if (!img) return
    const bs = baseScale.current
    const newDw = img.naturalWidth * bs * newScale
    const newDh = img.naturalHeight * bs * newScale
    const zx = (previewW / 2 - imgX) / (img.naturalWidth * bs * scale)
    const zy = (previewH / 2 - imgY) / (img.naturalHeight * bs * scale)
    const { x, y } = clampPos(previewW / 2 - zx * newDw, previewH / 2 - zy * newDh, newDw, newDh)
    setScale(newScale); setImgX(x); setImgY(y)
  }

  const handleConfirm = async () => {
    const img = imgRef.current
    if (!img) return

    if (isFree) {
      const fi = freeImgLayout
      if (!fi.w) return
      const hasSelection = freeRect && freeRect.w > 2 && freeRect.h > 2
      const selX = hasSelection ? freeRect!.x : fi.left
      const selY = hasSelection ? freeRect!.y : fi.top
      const selW = hasSelection ? freeRect!.w : fi.w
      const selH = hasSelection ? freeRect!.h : fi.h

      const fitScale = fi.w / img.naturalWidth
      const srcX = (selX - fi.left) / fitScale
      const srcY = (selY - fi.top) / fitScale
      const srcW = selW / fitScale
      const srcH = selH / fitScale

      let outW = Math.round(srcW), outH = Math.round(srcH)
      if (outW > MAX_OUT || outH > MAX_OUT) {
        const s = Math.min(MAX_OUT / outW, MAX_OUT / outH)
        outW = Math.round(outW * s); outH = Math.round(outH * s)
      }

      const canvas = document.createElement('canvas')
      canvas.width = outW; canvas.height = outH
      canvas.getContext('2d')!.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH)
      onConfirm(canvas.toDataURL('image/png'), 'none', { w: outW, h: outH }, borderRadius)
      return
    }

    const bs = baseScale.current * scale
    const dw = img.naturalWidth * bs
    const dh = img.naturalHeight * bs
    const visX = Math.max(0, imgX)
    const visY = Math.max(0, imgY)
    const visW = Math.max(0, Math.min(previewW, imgX + dw) - visX)
    const visH = Math.max(0, Math.min(previewH, imgY + dh) - visY)
    const out = getOutputSize(frameW, frameH)

    const drawToCtx = (ctx: CanvasRenderingContext2D, outW: number, outH: number) => {
      if (visW <= 0 || visH <= 0) return
      const scaleX = img.naturalWidth / dw, scaleY = img.naturalHeight / dh
      ctx.drawImage(img,
        (visX - imgX) * scaleX, (visY - imgY) * scaleY, visW * scaleX, visH * scaleY,
        visX * (outW / previewW), visY * (outH / previewH), visW * (outW / previewW), visH * (outH / previewH),
      )
    }

    const custom = customShapes.find(c => c.id === selectedShape)
    if (custom?.maskSrc) {
      const maskImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const m = new Image(); m.onload = () => resolve(m); m.onerror = reject; m.src = custom.maskSrc!
      })
      const mScale = Math.min(out.w / maskImg.naturalWidth, out.h / maskImg.naturalHeight)
      const mW = maskImg.naturalWidth * mScale, mH = maskImg.naturalHeight * mScale
      const mX = (out.w - mW) / 2, mY = (out.h - mH) / 2

      const canvasA = document.createElement('canvas')
      canvasA.width = out.w; canvasA.height = out.h
      const ctxA = canvasA.getContext('2d')!
      drawToCtx(ctxA, out.w, out.h)
      ctxA.globalCompositeOperation = 'destination-in'
      ctxA.drawImage(maskImg, mX, mY, mW, mH)

      const canvas = document.createElement('canvas')
      canvas.width = out.w; canvas.height = out.h
      const ctx = canvas.getContext('2d')!
      if (bgColor !== 'transparent') {
        ctx.fillStyle = bgColor; ctx.fillRect(0, 0, out.w, out.h)
        ctx.globalCompositeOperation = 'destination-in'
        ctx.drawImage(maskImg, mX, mY, mW, mH)
        ctx.globalCompositeOperation = 'source-over'
      }
      ctx.drawImage(canvasA, 0, 0)
      onConfirm(canvas.toDataURL('image/png'), 'none', undefined, 0)
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = out.w; canvas.height = out.h
    const ctx = canvas.getContext('2d')!
    if (bgColor !== 'transparent') { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, out.w, out.h) }
    drawToCtx(ctx, out.w, out.h)
    onConfirm(canvas.toDataURL('image/png'), selectedShape, undefined, selectedShape === 'none' ? borderRadius : 0)
  }

  const handlePngSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPendingMaskSrc(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleAddPng = () => {
    if (!newShapeName.trim() || !pendingMaskSrc) return
    const shape: CustomShape = { id: `custom_${Date.now()}`, label: newShapeName.trim(), maskSrc: pendingMaskSrc }
    onAddCustomShape(shape)
    setSelectedShape(shape.id)
    setShowAddShape(false); setNewShapeName(''); setPendingMaskSrc(null)
  }

  const applyBgColor = (c: string) => { setBgColor(c); setBgHexInput(c) }

  const saveFavColor = () => {
    if (!bgColor || bgColor === 'transparent') return
    setFavColors(prev => {
      const next = [...prev.filter(c => c !== bgColor), bgColor].slice(-5)
      api.settings.set('favBgColors', JSON.stringify(next)).catch(() => {})
      return next
    })
  }

  const imgStyle: React.CSSProperties = isFree
    ? { position: 'absolute', left: freeImgLayout.left, top: freeImgLayout.top, width: freeImgLayout.w, height: freeImgLayout.h, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }
    : { position: 'absolute', left: imgX, top: imgY, width: getDisplaySize().w, height: getDisplaySize().h, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }

  const showRadiusSlider = selectedShape === 'none' || selectedShape === 'free'
  const previewRadius = showRadiusSlider ? radiusPx(previewW, previewH, borderRadius) : 8
  const outputRadius = radiusPx(frameW, frameH, borderRadius)

  return (
    <div className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 99000, background: 'rgba(0,0,0,0.65)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="flex flex-col gap-3 p-5 rounded-2xl shadow-2xl"
        style={{ background: '#fff', maxWidth: '90vw' }}>

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>크롭 / 모양 편집</h3>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {isFree ? '드래그해서 자를 영역 선택' : '드래그하거나 스크롤로 조정'}
          </p>
        </div>

        {/* Shape selector */}
        <div className="flex items-center gap-1 flex-wrap">
          {BUILTIN.map(s => (
            <button key={s.id} onClick={() => setSelectedShape(s.id)}
              className={`text-sm h-8 rounded hover:opacity-70 ${s.id === 'free' ? 'px-2 text-xs' : 'w-8'}`}
              style={{
                background: selectedShape === s.id ? 'var(--color-primary)' : 'transparent',
                color: selectedShape === s.id ? '#fff' : 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
              }}>
              {s.label}
            </button>
          ))}
          {customShapes.map(s => (
            <button key={s.id} onClick={() => setSelectedShape(s.id)}
              className="text-xs px-2 h-8 rounded hover:opacity-70 max-w-[72px] truncate"
              style={{
                background: selectedShape === s.id ? 'var(--color-primary)' : 'transparent',
                color: selectedShape === s.id ? '#fff' : 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
              }}
              title={s.label}>
              {s.label}
            </button>
          ))}
          <button onClick={() => setShowAddShape(v => !v)}
            className="text-sm w-8 h-8 rounded hover:opacity-70"
            style={{
              background: showAddShape ? 'var(--color-primary-light)' : 'transparent',
              color: 'var(--color-primary-dark)',
              border: '1px dashed var(--color-primary)',
            }}>+</button>
        </div>

        {/* Add custom shape (PNG only) */}
        {showAddShape && (
          <div className="flex flex-col gap-2 p-3 rounded-lg"
            style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-primary)' }}>
            <input type="text" placeholder="모양 이름" value={newShapeName}
              onChange={e => setNewShapeName(e.target.value)}
              className="text-xs px-2 py-1 rounded outline-none"
              style={{ border: '1px solid var(--color-border)' }} />
            <div className="flex items-center gap-2">
              <button onClick={() => fileInputRef.current?.click()}
                className="text-xs px-3 py-1 rounded-full hover:opacity-80"
                style={{ background: 'var(--color-primary)', color: '#fff' }}>
                PNG 선택
              </button>
              <input ref={fileInputRef} type="file" accept="image/png" className="hidden" onChange={handlePngSelect} />
              {pendingMaskSrc && (
                <div className="flex items-center gap-1">
                  <img src={pendingMaskSrc} alt="" style={{ width: 32, height: 32, objectFit: 'contain', border: '1px solid var(--color-border)', borderRadius: 4, background: '#000' }} />
                  <span className="text-xs" style={{ color: 'var(--color-primary-dark)' }}>선택됨 ✓</span>
                </div>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              투명 배경 PNG 사용 권장 (투명한 부분이 잘려나가요)
            </p>
            <div className="flex gap-2">
              <button onClick={handleAddPng}
                className="text-xs px-3 py-1 rounded-full font-medium hover:opacity-80"
                style={{ background: 'var(--color-primary)', color: '#fff' }}>추가</button>
              <button onClick={() => { setShowAddShape(false); setPendingMaskSrc(null) }}
                className="text-xs px-3 py-1 rounded-full hover:opacity-70"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>취소</button>
            </div>
          </div>
        )}

        {/* Preview */}
        <div ref={containerRef}
          style={{
            width: previewW, height: previewH, overflow: 'hidden', position: 'relative',
            cursor: isFree ? 'crosshair' : 'move',
            borderRadius: previewRadius, border: '2px solid var(--color-primary)',
            background: isFree ? '#e8e8e8' : bgColor,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}>
          <img ref={imgRef} src={src} alt="" onLoad={onImgLoad} draggable={false} style={imgStyle} />

          {isFree && freeRect && freeRect.w > 0 && freeRect.h > 0 && (
            <div style={{
              position: 'absolute',
              left: freeRect.x, top: freeRect.y,
              width: freeRect.w, height: freeRect.h,
              border: '2px dashed #fff',
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
              pointerEvents: 'none',
            }} />
          )}

          <ShapeMask shape={selectedShape} w={previewW} h={previewH} customShapes={customShapes} />
        </div>

        {/* Border radius slider */}
        {showRadiusSlider && (
          <div className="flex items-center gap-3">
            <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>모서리 둥글게</span>
            <input type="range" min={0} max={50} value={borderRadius}
              onChange={e => setBorderRadius(Number(e.target.value))}
              className="flex-1 cursor-pointer" />
            <span className="text-xs w-10 text-right" style={{ color: 'var(--color-primary-dark)' }}>{outputRadius}px</span>
          </div>
        )}

        {/* Background color (not in free mode) */}
        {!isFree && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>배경색</span>
              {['transparent','#ffffff','#000000','#FFF8F0','#FDE8F0','#E8F4E8','#E8F0FF','#FFFACD','#FFE4E1','#D0E8FF'].map(c => (
                <button key={c} onClick={() => applyBgColor(c)}
                  className="w-5 h-5 rounded-full shrink-0"
                  style={{
                    background: c === 'transparent'
                      ? 'linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),linear-gradient(45deg,#ccc 25%,#fff 25%,#fff 75%,#ccc 75%)'
                      : c,
                    backgroundSize: c === 'transparent' ? '6px 6px' : undefined,
                    backgroundPosition: c === 'transparent' ? '0 0,3px 3px' : undefined,
                    border: `2px solid ${bgColor === c ? 'var(--color-primary-dark)' : 'var(--color-border)'}`,
                    transform: bgColor === c ? 'scale(1.3)' : 'scale(1)',
                  }} />
              ))}
              <input type="text" value={bgHexInput} placeholder="#ffffff"
                onChange={e => { setBgHexInput(e.target.value); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setBgColor(e.target.value) }}
                className="text-xs px-1.5 py-0.5 rounded outline-none w-20"
                style={{ border: '1px solid var(--color-border)' }} />
              <button onClick={saveFavColor} title="즐겨찾기에 저장"
                className="text-xs px-2 py-0.5 rounded hover:opacity-70"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-primary-dark)' }}>☆ 저장</button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>즐겨찾기</span>
              {Array.from({ length: 5 }).map((_, i) => {
                const fav = favColors[i]
                return (
                  <button key={i} onClick={() => fav && applyBgColor(fav)}
                    className="w-5 h-5 rounded-full shrink-0"
                    style={{
                      background: fav ?? 'transparent',
                      border: `2px solid ${fav && bgColor === fav ? 'var(--color-primary-dark)' : 'var(--color-border)'}`,
                      backgroundImage: fav ? undefined : 'repeating-linear-gradient(45deg,#ddd 0,#ddd 2px,transparent 0,transparent 50%)',
                      backgroundSize: fav ? undefined : '6px 6px',
                      cursor: fav ? 'pointer' : 'default',
                    }} />
                )
              })}
            </div>
          </div>
        )}

        {/* Scale slider (not in free mode) */}
        {!isFree && (
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>축소</span>
            <input type="range" min={30} max={500} value={Math.round(scale * 100)}
              onChange={e => {
                const newScale = Number(e.target.value) / 100
                const img = imgRef.current
                if (!img) return
                const bs = baseScale.current
                const newDw = img.naturalWidth * bs * newScale
                const newDh = img.naturalHeight * bs * newScale
                const { x, y } = clampPos(imgX, imgY, newDw, newDh)
                setScale(newScale); setImgX(x); setImgY(y)
              }}
              className="flex-1 cursor-pointer" />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>확대</span>
            <span className="text-xs w-10 text-right" style={{ color: 'var(--color-primary-dark)' }}>{Math.round(scale * 100)}%</span>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="text-sm px-4 py-1.5 rounded-full hover:opacity-70"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>취소</button>
          <button onClick={handleConfirm}
            className="text-sm px-4 py-1.5 rounded-full font-medium hover:opacity-80"
            style={{ background: 'var(--color-primary)', color: '#fff' }}>확인</button>
        </div>
      </div>
    </div>
  )
}
