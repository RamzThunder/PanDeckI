import React, { useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

// 앱 시작 직후 렌더링/DB 로딩과 겹치지 않도록 잠시 뒤에 확인
const CHECK_DELAY_MS = 3000

type Status = 'idle' | 'available' | 'downloading' | 'error'

export default function UpdateNotice(): JSX.Element | null {
  const [update, setUpdate] = useState<Update | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      check()
        .then(found => {
          if (cancelled || !found) return
          setUpdate(found)
          setStatus('available')
        })
        .catch(() => {})
    }, CHECK_DELAY_MS)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [])

  const install = async () => {
    if (!update) return
    setStatus('downloading')
    setProgress(0)
    let total = 0
    let received = 0
    try {
      await update.downloadAndInstall(event => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0
        else if (event.event === 'Progress') {
          received += event.data.chunkLength
          if (total > 0) setProgress(Math.min(100, Math.round((received / total) * 100)))
        }
      })
      await relaunch()
    } catch {
      setStatus('error')
    }
  }

  if (status === 'idle' || !update) return null

  return (
    <div className="update-notice" role="status">
      {status === 'available' && (
        <>
          <div className="update-notice-text">
            <strong>새 버전 {update.version}</strong>
            <span>지금 업데이트하면 앱이 다시 시작돼요.</span>
          </div>
          <div className="update-notice-actions">
            <button onClick={() => setStatus('idle')}>나중에</button>
            <button className="primary" onClick={install}>업데이트</button>
          </div>
        </>
      )}
      {status === 'downloading' && (
        <div className="update-notice-text">
          <strong>업데이트 다운로드 중… {progress > 0 ? `${progress}%` : ''}</strong>
          <div className="update-notice-bar"><div style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      {status === 'error' && (
        <>
          <div className="update-notice-text">
            <strong>업데이트에 실패했어요</strong>
            <span>설정 → 정보에서 다시 시도할 수 있어요.</span>
          </div>
          <div className="update-notice-actions">
            <button onClick={() => setStatus('idle')}>닫기</button>
          </div>
        </>
      )}
    </div>
  )
}
