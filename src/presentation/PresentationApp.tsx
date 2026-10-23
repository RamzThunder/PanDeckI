import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import DailyView from '../pages/DailyView'
import type { BoardInfo } from '../pages/Dashboard'
import type { StudentList } from '../pages/StudentLists'
import { BoardScope, startReceiver, useRemoteValue } from './sync'

export interface PresentationMeta {
  board: BoardInfo | null
  studentLists: StudentList[]
  rootStyle: string
}
const EMPTY: PresentationMeta = { board: null, studentLists: [], rootStyle: '' }
export default function PresentationApp() {
  const meta = useRemoteValue('app:meta', EMPTY)
  const [viewport, setViewport] = useState({ width: innerWidth, height: innerHeight })
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined
    startReceiver().then(fn => { if (disposed) fn(); else cleanup = fn }).catch(() => setError('발표 화면 연결에 실패했습니다. 발표를 종료한 뒤 다시 시작해주세요.'))
    const resize = () => setViewport({ width: innerWidth, height: innerHeight })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'F11' || (event.metaKey && event.ctrlKey && event.key.toLowerCase() === 'f')) {
        event.preventDefault()
        void invoke('stop_presentation').catch(() => setError('발표 화면을 닫지 못했습니다. 창 닫기를 사용해주세요.'))
      }
    }
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', keydown)
    document.documentElement.classList.add('is-fullscreen')
    return () => { disposed = true; cleanup?.(); window.removeEventListener('resize', resize); window.removeEventListener('keydown', keydown) }
  }, [])
  useEffect(() => { document.documentElement.style.cssText = meta.rootStyle }, [meta.rootStyle])
  const width = 1744, height = 1012
  const scale = Math.min(viewport.width / width, viewport.height / height)
  return <>
    <div className="fullscreen-exit-zone"><button className="fullscreen-exit-button" onClick={() => void invoke('stop_presentation').catch(() => setError('발표 종료에 실패했습니다.'))} title="발표 끝내기 (Esc)">✕</button></div>
    <div className="presentation-stage" style={{ width, height, transformOrigin: 'top left', transform: `translate(${(viewport.width - width * scale) / 2}px, ${(viewport.height - height * scale) / 2}px) scale(${scale})` }}>
      {meta.board ? <BoardScope.Provider value={`board_${meta.board.id}`}><DailyView key={meta.board.id} boardKey={`board_${meta.board.id}`} boardTitle={meta.board.title} systemFonts={[]} studentLists={meta.studentLists} /></BoardScope.Provider>
        : <div className="presentation-waiting">{error || '판을 선택하면 이 화면에 표시됩니다.'}</div>}
      {error && meta.board && <div role="alert">{error}</div>}
    </div>
  </>
}
