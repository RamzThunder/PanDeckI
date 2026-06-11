import React, { useMemo, useState } from 'react'

export type BoardInfo = {
  id: string
  title: string
  category: string
  createdAt: string
  updatedAt: string
  accent: string
}

interface Props {
  boards: BoardInfo[]
  onCreate: (title: string, category: string, accent: string) => void
  onOpen: (board: BoardInfo) => void
  onDelete: (board: BoardInfo) => void
}

const CATEGORIES = ['수업', '학급 운영', '행사', '개인', '기타']
const ACCENTS = ['#7564e8', '#3b91c9', '#e47a68', '#58a47a', '#d29a42']

export default function Dashboard({ boards, onCreate, onOpen, onDelete }: Props): JSX.Element {
  const [category, setCategory] = useState('전체')
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [newCategory, setNewCategory] = useState(CATEGORIES[0])
  const [accent, setAccent] = useState(ACCENTS[0])

  const visibleBoards = useMemo(
    () => category === '전체' ? boards : boards.filter(board => board.category === category),
    [boards, category],
  )

  const counts = useMemo(() => {
    const result: Record<string, number> = { 전체: boards.length }
    CATEGORIES.forEach(item => { result[item] = boards.filter(board => board.category === item).length })
    return result
  }, [boards])

  const create = () => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    onCreate(cleanTitle, newCategory, accent)
    setTitle('')
    setCreating(false)
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <span>P</span>
          <div><strong>PanDeckI</strong><small>나의 판떼기</small></div>
        </div>
        <button className="new-board-button" onClick={() => setCreating(true)}>+ 새 판떼기</button>
        <nav className="category-nav">
          {['전체', ...CATEGORIES].map(item => (
            <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
              <span>{item}</span><small>{counts[item] ?? 0}</small>
            </button>
          ))}
        </nav>
        <p className="dashboard-note">판떼기를 열면 Dida의 캔버스와 객체 편집 도구를 그대로 사용할 수 있어요.</p>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p>대시보드</p>
            <h1>{category === '전체' ? '모든 판떼기' : category}</h1>
          </div>
          <button onClick={() => setCreating(true)}>새 판떼기 만들기</button>
        </header>

        {visibleBoards.length > 0 ? (
          <section className="board-grid">
            {visibleBoards.map(board => (
              <article key={board.id} className="board-card" onClick={() => onOpen(board)}>
                <div className="board-preview" style={{ background: `linear-gradient(145deg, ${board.accent}, ${board.accent}99)` }}>
                  <span>PanDeckI</span>
                  <strong>{board.title.slice(0, 1)}</strong>
                </div>
                <div className="board-card-info">
                  <div>
                    <small>{board.category}</small>
                    <h2>{board.title}</h2>
                    <p>{new Date(board.updatedAt).toLocaleDateString('ko-KR')} 수정</p>
                  </div>
                  <button
                    title="판떼기 삭제"
                    onClick={event => { event.stopPropagation(); onDelete(board) }}
                  >×</button>
                </div>
              </article>
            ))}
            <button className="board-card add-card" onClick={() => setCreating(true)}>
              <span>+</span><strong>새 판떼기 만들기</strong>
            </button>
          </section>
        ) : (
          <section className="empty-dashboard">
            <span>+</span>
            <h2>아직 판떼기가 없어요</h2>
            <p>수업과 학급 운영에 필요한 첫 판떼기를 만들어보세요.</p>
            <button onClick={() => setCreating(true)}>새 판떼기 만들기</button>
          </section>
        )}
      </main>

      {creating && (
        <div className="create-board-backdrop" onClick={() => setCreating(false)}>
          <section className="create-board-modal" onClick={event => event.stopPropagation()}>
            <header><div><small>새로 만들기</small><h2>새 판떼기</h2></div><button onClick={() => setCreating(false)}>×</button></header>
            <label>판떼기 이름<input autoFocus value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') create() }} placeholder="예: 3학년 2반 아침 활동" /></label>
            <label>카테고리<select value={newCategory} onChange={event => setNewCategory(event.target.value)}>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
            <div className="accent-picker"><span>대표 색상</span><div>{ACCENTS.map(color => <button key={color} className={accent === color ? 'active' : ''} style={{ background: color }} onClick={() => setAccent(color)} />)}</div></div>
            <footer><button onClick={() => setCreating(false)}>취소</button><button className="primary" disabled={!title.trim()} onClick={create}>판떼기 만들기</button></footer>
          </section>
        </div>
      )}
    </div>
  )
}
