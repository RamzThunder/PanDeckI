import React, { useEffect, useState } from 'react'

export interface StudentList {
  id: string
  title: string
  students: string[]
}

interface Props {
  lists: StudentList[]
  onSave: (list: StudentList) => void
  onDelete: (list: StudentList) => void
}

function parseStudents(value: string): string[] {
  return value.split(/\r?\n/).map(name => name.trim()).filter(Boolean)
}

export default function StudentLists({ lists, onSave, onDelete }: Props): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(lists[0]?.id ?? null)
  const selected = lists.find(list => list.id === selectedId) ?? null
  const [title, setTitle] = useState('')
  const [studentText, setStudentText] = useState('')
  const students = parseStudents(studentText)

  useEffect(() => {
    if (selectedId && !lists.some(list => list.id === selectedId)) setSelectedId(lists[0]?.id ?? null)
  }, [lists, selectedId])

  useEffect(() => {
    setTitle(selected?.title ?? '')
    setStudentText(selected?.students.join('\n') ?? '')
  }, [selected])

  const createList = () => {
    const list: StudentList = { id: crypto.randomUUID(), title: '새 학생 목록', students: [] }
    onSave(list)
    setSelectedId(list.id)
  }

  const save = () => {
    if (!selected) return
    onSave({ ...selected, title: title.trim() || '이름 없는 목록', students })
  }

  return (
    <main className="student-lists-main">
      <header className="student-lists-header">
        <div><p>수업 도구</p><h1>학생 목록</h1><span>학생 이름을 한 줄에 한 명씩 입력해 저장하세요.</span></div>
        <button onClick={createList}>+ 새 목록</button>
      </header>

      <div className="student-lists-layout">
        <aside className="student-list-menu">
          <header><strong>저장된 목록</strong><small>{lists.length}개</small></header>
          {lists.length > 0 ? lists.map(list => (
            <button key={list.id} className={selectedId === list.id ? 'active' : ''} onClick={() => setSelectedId(list.id)}>
              <span>{list.title}</span><small>{list.students.length}명</small>
            </button>
          )) : <p>아직 저장된 목록이 없어요.</p>}
        </aside>

        <section className="student-list-editor">
          {selected ? <>
            <header>
              <label>목록 이름<input value={title} onChange={event => setTitle(event.target.value)} placeholder="예: 3학년 2반" /></label>
              <button className="student-list-delete" onClick={() => onDelete(selected)}>목록 삭제</button>
            </header>
            <div className="student-list-workspace">
              <label className="student-list-input">
                <span>학생 입력 <small>줄별로 학생 데이터로 인식됩니다.</small></span>
                <textarea value={studentText} onChange={event => setStudentText(event.target.value)} placeholder={'김하늘\n이바다\n박새봄'} />
              </label>
              <section className="student-list-preview">
                <header><strong>학생 데이터</strong><span>{students.length}명</span></header>
                {students.length > 0
                  ? <ol>{students.map((student, index) => <li key={`${student}-${index}`}><span>{index + 1}</span><strong>{student}</strong></li>)}</ol>
                  : <p>왼쪽에 학생 이름을 입력하면 여기에 표시됩니다.</p>}
              </section>
            </div>
            <footer><span>{students.length}명의 학생을 저장합니다.</span><button onClick={save}>저장</button></footer>
          </> : (
            <div className="student-list-empty"><span>+</span><h2>학생 목록을 만들어보세요</h2><p>수업 중 사용할 학생 이름을 간편하게 보관할 수 있어요.</p><button onClick={createList}>새 목록 만들기</button></div>
          )}
        </section>
      </div>
    </main>
  )
}
