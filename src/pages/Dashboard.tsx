import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { CanvasEl, DailyData } from './DailyView'

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
  categories: string[]
  category: string
  createRequest: number
  onCreateRequestHandled: () => void
  onSelectCategory: (category: string) => void
  onAddCategory: (name: string) => void
  onRenameCategory: (oldName: string, newName: string) => void
  onMoveCategory: (name: string, direction: -1 | 1) => void
  onDeleteCategory: (name: string) => void
}

type SortMode = 'updated' | 'created' | 'title'

const DEFAULT_CATEGORIES = ['수업', '학급 운영', '행사', '개인', '기타']
const ACCENTS = ['#7564e8', '#3b91c9', '#e47a68', '#58a47a', '#d29a42']

function relativeDate(date: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000))
  if (days === 0) return '오늘 사용'
  if (days === 1) return '어제 사용'
  if (days < 30) return `${days}일 전 사용`
  return new Date(date).toLocaleDateString('ko-KR')
}

function PreviewElement({ element }: { element: CanvasEl }): JSX.Element {
  const style: React.CSSProperties = {
    left: `${element.x / 16}%`,
    top: `${element.y / 9}%`,
    width: `${element.w / 16}%`,
    height: `${element.h / 9}%`,
    zIndex: element.z,
    opacity: element.opacity / 100,
    transform: `rotate(${element.rotation}deg)`,
    borderRadius: element.photoRadius ? `${element.photoRadius}%` : undefined,
  }

  if (element.type === 'photo' || element.type === 'sticker') {
    return <img className={`preview-element ${element.type}`} style={style} src={element.content} alt="" />
  }

  if (element.type === 'video') {
    return <span className="preview-element preview-video" style={style}>▶</span>
  }

  return (
    <span
      className="preview-element preview-text"
      style={{
        ...style,
        color: element.color,
        background: element.bgOpacity > 0 ? element.bgColor : 'transparent',
        fontWeight: element.bold ? 800 : 500,
        fontStyle: element.italic ? 'italic' : undefined,
        textAlign: element.align,
      }}
    >
      {element.content.replace(/[#*_>`]/g, '')}
    </span>
  )
}

function BoardPreview({ board, data }: { board: BoardInfo; data?: DailyData | null }): JSX.Element {
  const elements = data?.elements?.slice().sort((a, b) => a.z - b.z).slice(-30) ?? []
  return (
    <div className="board-preview" style={{ background: data?.bg ?? board.accent }}>
      {data?.bgImage && <img className="preview-background" src={data.bgImage} alt="" />}
      {elements.length > 0
        ? elements.map(element => <PreviewElement key={element.id} element={element} />)
        : <div className="preview-placeholder"><strong>{board.title.slice(0, 1)}</strong><span>PanDeckI</span></div>}
    </div>
  )
}

export default function Dashboard({ boards, onCreate, onOpen, onDelete, categories, category, createRequest, onCreateRequestHandled, onSelectCategory, onAddCategory, onRenameCategory, onMoveCategory, onDeleteCategory }: Props): JSX.Element {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [newCategory, setNewCategory] = useState(categories[0] ?? DEFAULT_CATEGORIES[0])
  const [accent, setAccent] = useState(ACCENTS[0])
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('updated')
  const [previews, setPreviews] = useState<Record<string, DailyData | null>>({})
  const [categoryDraft, setCategoryDraft] = useState('')
  const [editingCategory, setEditingCategory] = useState<string | null>(null)

  useEffect(() => {
    if (!categories.includes(newCategory)) setNewCategory(categories[0] ?? DEFAULT_CATEGORIES[0])
  }, [categories, newCategory])

  useEffect(() => {
    if (createRequest > 0) { openCreate(); onCreateRequestHandled() }
  }, [createRequest, onCreateRequestHandled])

  useEffect(() => {
    let alive = true
    Promise.all(boards.map(async board => {
      const data = await api.entry.get(`board_${board.id}`).catch(() => null)
      return [board.id, data as DailyData | null] as const
    })).then(entries => {
      if (alive) setPreviews(Object.fromEntries(entries))
    })
    return () => { alive = false }
  }, [boards])

  const counts = useMemo(() => {
    const result: Record<string, number> = { 전체: boards.length }
    categories.forEach(item => { result[item] = boards.filter(board => board.category === item).length })
    return result
  }, [boards, categories])

  const filteredBoards = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ko-KR')
    return boards
      .filter(board => category === '전체' || board.category === category)
      .filter(board => !needle || board.title.toLocaleLowerCase('ko-KR').includes(needle))
      .sort((a, b) => {
        if (sortMode === 'title') return a.title.localeCompare(b.title, 'ko-KR')
        return new Date(sortMode === 'created' ? b.createdAt : b.updatedAt).getTime()
          - new Date(sortMode === 'created' ? a.createdAt : a.updatedAt).getTime()
      })
  }, [boards, category, query, sortMode])

  const groups = useMemo(() => {
    const names = category === '전체'
      ? [...categories, ...new Set(filteredBoards.map(board => board.category).filter(item => !categories.includes(item)))]
      : [category]
    const result = names.map(name => ({ name, boards: filteredBoards.filter(board => board.category === name) }))
    return query.trim() ? result.filter(group => group.boards.length > 0) : result
  }, [category, filteredBoards, categories, query])

  const openCreate = (targetCategory = category === '전체' ? (categories[0] ?? DEFAULT_CATEGORIES[0]) : category) => {
    setNewCategory(targetCategory)
    setCreating(true)
  }

  const create = () => {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    onCreate(cleanTitle, newCategory, accent)
    setTitle('')
    setCreating(false)
  }

  const submitCategory = () => {
    const clean = categoryDraft.trim()
    if (!clean || clean === '전체') { setEditingCategory(null); setCategoryDraft(''); return }
    if (editingCategory === '__new__') onAddCategory(clean)
    else if (editingCategory && clean !== editingCategory) onRenameCategory(editingCategory, clean)
    setEditingCategory(null); setCategoryDraft('')
  }

  return (
    <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p>대시보드</p>
            <h1>{category === '전체' ? '모든 판' : category}</h1>
          </div>
          <div className="dashboard-tools">
            <label className="dashboard-search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="판 검색" />{query && <button onClick={() => setQuery('')}>×</button>}</label>
            <select value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)}>
              <option value="updated">최근 사용순</option>
              <option value="created">최근 생성순</option>
              <option value="title">이름순</option>
            </select>
            <button className="header-create-button" onClick={() => openCreate()}>+ 새 판</button>
          </div>
        </header>

        <section className="dashboard-category-bar">
          <button className={category === '전체' ? 'active' : ''} onClick={() => onSelectCategory('전체')}>전체 <small>{boards.length}</small></button>
          {categories.map(item => <button key={item} className={category === item ? 'active' : ''} onClick={() => onSelectCategory(item)}>{item} <small>{counts[item] ?? 0}</small></button>)}
          {editingCategory === '__new__' ? <input autoFocus value={categoryDraft} placeholder="새 카테고리" onChange={event => setCategoryDraft(event.target.value)} onBlur={submitCategory} onKeyDown={event => { if (event.key === 'Enter') submitCategory(); if (event.key === 'Escape') setEditingCategory(null) }} /> : <button className="category-add-chip" onClick={() => { setEditingCategory('__new__'); setCategoryDraft('') }}>+ 카테고리</button>}
        </section>

        {groups.length > 0 ? (
          <div className="board-groups">
            {groups.map(group => (
              <section className="board-group" key={group.name}>
                <header>
                  <div className="board-group-title">
                    {editingCategory === group.name
                      ? <input autoFocus value={categoryDraft} onChange={event => setCategoryDraft(event.target.value)} onBlur={submitCategory} onKeyDown={event => { if (event.key === 'Enter') submitCategory(); if (event.key === 'Escape') { setEditingCategory(null); setCategoryDraft('') } }} />
                      : <h2>{group.name}</h2>}
                    <span>{group.boards.length}개</span>
                  </div>
                  <div className="board-group-actions">
                    {categories.includes(group.name) && <>
                      <button title="카테고리 이름 변경" onClick={() => { setEditingCategory(group.name); setCategoryDraft(group.name) }}>이름 변경</button>
                      <button className="order-button" title="위로 이동" disabled={categories.indexOf(group.name) === 0} onClick={() => onMoveCategory(group.name, -1)}>↑</button>
                      <button className="order-button" title="아래로 이동" disabled={categories.indexOf(group.name) === categories.length - 1} onClick={() => onMoveCategory(group.name, 1)}>↓</button>
                      <button className="delete-category-button" title="카테고리 삭제" disabled={categories.length <= 1} onClick={() => onDeleteCategory(group.name)}>삭제</button>
                    </>}
                  </div>
                </header>
                <div className="board-grid">
                  {group.boards.map(board => (
                    <article key={board.id} className="board-card" onClick={() => onOpen(board)}>
                      <BoardPreview board={board} data={previews[board.id]} />
                      <div className="board-card-info">
                        <div><h3>{board.title}</h3><p>{relativeDate(board.updatedAt)}</p></div>
                        <button title="판 삭제" onClick={event => { event.stopPropagation(); onDelete(board) }}>×</button>
                      </div>
                    </article>
                  ))}
                  <button className="board-card add-card" onClick={() => openCreate(group.name)}><span>+</span><strong>새 판</strong></button>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="empty-dashboard">
            <span>+</span><h2>{query ? '검색 결과가 없어요' : '아직 판이 없어요'}</h2>
            <p>{query ? '다른 검색어를 입력해보세요.' : '수업과 학급 운영에 필요한 첫 판을 만들어보세요.'}</p>
            {!query && <button onClick={() => openCreate()}>새 판 만들기</button>}
          </section>
        )}


      {creating && (
        <div className="create-board-backdrop" onClick={() => setCreating(false)}>
          <section className="create-board-modal" onClick={event => event.stopPropagation()}>
            <header><div><small>새로 만들기</small><h2>새 판</h2></div><button onClick={() => setCreating(false)}>×</button></header>
            <label>판 이름<input autoFocus value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') create() }} placeholder="예: 3학년 2반 아침 활동" /></label>
            <label>카테고리<select value={newCategory} onChange={event => setNewCategory(event.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
            <div className="accent-picker"><span>대표 색상</span><div>{ACCENTS.map(color => <button key={color} className={accent === color ? 'active' : ''} style={{ background: color }} onClick={() => setAccent(color)} />)}</div></div>
            <footer><button onClick={() => setCreating(false)}>취소</button><button className="primary" disabled={!title.trim()} onClick={create}>판 만들기</button></footer>
          </section>
        </div>
      )}
    </main>
  )
}
