import React, { useEffect, useState, useRef } from 'react'
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

  useEffect(() => {
    api.sticker.listPacks().then(p => {
      setPacks(p)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const changeDir = async () => {
    const dir = await api.sticker.pickDir().catch(() => null)
    if (dir) {
      setLoading(true)
      const p = await api.sticker.listPacks().catch(() => [] as StickerPack[])
      setPacks(p)
      setActivePack(0)
      setLoading(false)
    }
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
          <button key={p.name} onClick={() => setActivePack(i)}
            className="text-xs px-3 py-2 whitespace-nowrap shrink-0 transition-colors"
            style={{
              background: activePack === i ? 'var(--color-primary)' : 'transparent',
              color: activePack === i ? '#fff' : 'var(--color-text-muted)',
              borderBottom: activePack === i ? '2px solid var(--color-primary-dark)' : '2px solid transparent',
            }}>
            {p.name.normalize('NFC')}
          </button>
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
