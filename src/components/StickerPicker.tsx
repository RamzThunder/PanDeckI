import React, { useEffect, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { api } from '../api'

interface StickerPack { name: string; files: string[] }

interface Props {
  onSelect: (base64: string) => void
  onClose: () => void
}

export default function StickerPicker({ onSelect, onClose }: Props): JSX.Element {
  const [packs, setPacks] = useState<StickerPack[]>([])
  const [activePack, setActivePack] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingSticker, setLoadingSticker] = useState<string | null>(null)
  const [dragPack, setDragPack] = useState<string | null>(null)

  const applyPackOrder = (nextPacks: StickerPack[], order: string[]): StickerPack[] => {
    const index = new Map(order.map((name, i) => [name, i]))
    return [...nextPacks].sort((a, b) => {
      const ai = index.get(a.name)
      const bi = index.get(b.name)
      if (ai !== undefined && bi !== undefined) return ai - bi
      if (ai !== undefined) return -1
      if (bi !== undefined) return 1
      return a.name.localeCompare(b.name)
    })
  }

  const loadPacks = async (activeName?: string) => {
    setLoading(true)
    try {
      const [nextPacks, rawOrder] = await Promise.all([
        api.sticker.listPacks().catch(() => [] as StickerPack[]),
        api.settings.get('sticker_pack_order').catch(() => null),
      ])
      let order: string[] = []
      if (rawOrder) {
        try { order = JSON.parse(rawOrder) } catch {}
      }
      const ordered = applyPackOrder(nextPacks, order)
      setPacks(ordered)
      const nextActive = activeName ? ordered.findIndex(p => p.name === activeName) : 0
      setActivePack(Math.max(0, nextActive))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPacks()
  }, [])

  const changeDir = async () => {
    const dir = await api.sticker.pickDir().catch(() => null)
    if (dir) {
      await loadPacks()
    }
  }

  const reorderPack = (fromName: string, toName: string) => {
    if (fromName === toName) return
    setPacks(prev => {
      const from = prev.findIndex(p => p.name === fromName)
      const to = prev.findIndex(p => p.name === toName)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      api.settings.set('sticker_pack_order', JSON.stringify(next.map(p => p.name))).catch(() => {})
      setActivePack(next.findIndex(p => p.name === fromName))
      return next
    })
  }

  const movePack = (index: number, dir: -1 | 1) => {
    setPacks(prev => {
      const to = index + dir
      if (to < 0 || to >= prev.length) return prev
      const activeName = prev[activePack]?.name
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(to, 0, moved)
      api.settings.set('sticker_pack_order', JSON.stringify(next.map(p => p.name))).catch(() => {})
      setActivePack(Math.max(0, next.findIndex(p => p.name === activeName)))
      return next
    })
  }

  const selectSticker = async (path: string) => {
    setLoadingSticker(path)
    try {
      const b64 = await api.file.readFileB64(path)
      onSelect(b64)
    } catch {}
    setLoadingSticker(null)
  }

  const currentPack = packs[activePack]

  return (
    <div className="absolute top-10 left-0 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
      style={{ width: 320, maxHeight: 420, background: '#fff', border: '1px solid var(--color-border)' }}
      onClick={e => e.stopPropagation()}>

      {/* Pack tabs */}
      <div className="flex items-center gap-0 overflow-x-auto shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-primary-light)' }}>
        {packs.map((p, i) => (
          <div key={p.name}
            draggable
            onDragStart={e => { setDragPack(p.name); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.name) }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
            onDrop={e => { e.preventDefault(); reorderPack(e.dataTransfer.getData('text/plain') || dragPack || '', p.name); setDragPack(null) }}
            onDragEnd={() => setDragPack(null)}
            className="flex items-center whitespace-nowrap shrink-0 transition-colors"
            style={{
              background: activePack === i ? 'var(--color-primary)' : 'transparent',
              color: activePack === i ? '#fff' : 'var(--color-text-muted)',
              borderBottom: activePack === i ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
              opacity: dragPack === p.name ? 0.45 : 1,
              cursor: 'grab',
            }}>
            <button
              onClick={e => { e.stopPropagation(); movePack(i, -1) }}
              disabled={i === 0}
              className="text-xs px-1.5 py-2"
              style={{ color: activePack === i ? '#fff' : 'var(--color-text-muted)', opacity: i === 0 ? 0.25 : 0.75, cursor: i === 0 ? 'default' : 'pointer' }}
              title="왼쪽으로 이동">‹</button>
            <button
              onClick={() => setActivePack(i)}
              className="text-xs px-1 py-2"
              style={{ color: 'inherit', cursor: 'pointer' }}>
              {p.name.normalize('NFC')}
            </button>
            <button
              onClick={e => { e.stopPropagation(); movePack(i, 1) }}
              disabled={i === packs.length - 1}
              className="text-xs px-1.5 py-2"
              style={{ color: activePack === i ? '#fff' : 'var(--color-text-muted)', opacity: i === packs.length - 1 ? 0.25 : 0.75, cursor: i === packs.length - 1 ? 'default' : 'pointer' }}
              title="오른쪽으로 이동">›</button>
          </div>
        ))}
        <div className="flex-1" />
        <button onClick={changeDir}
          className="text-xs px-2 py-2 shrink-0 hover:opacity-70"
          style={{ color: 'var(--color-text-muted)' }} title="스티커 폴더 변경">📁</button>
      </div>

      {/* Sticker grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            로딩 중...
          </div>
        ) : !currentPack || currentPack.files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
              스티커 폴더를 설정해주세요
            </p>
            <button onClick={changeDir}
              className="text-xs px-3 py-1 rounded-full"
              style={{ background: 'var(--color-primary)', color: '#fff' }}>
              폴더 선택
            </button>
          </div>
        ) : (
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {currentPack.files.map(file => (
              <button key={file}
                onClick={() => selectSticker(file)}
                disabled={loadingSticker === file}
                className="aspect-square rounded-xl overflow-hidden hover:opacity-80 transition-opacity relative"
                style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-border)' }}>
                <img
                  src={convertFileSrc(file)}
                  alt=""
                  className="w-full h-full object-contain p-1"
                  loading="lazy"
                />
                {loadingSticker === file && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.7)' }}>
                    <span className="text-xs">...</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
