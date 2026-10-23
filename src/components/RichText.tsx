import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'

// 텍스트 박스의 글자별 서식. 값이 없는 속성은 박스 기본값(CanvasEl의 같은 이름 필드)을 따른다.
export interface TextRun {
  text: string
  color?: string
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
}
export type RunStyle = Omit<TextRun, 'text'>
export type RunStyleKey = keyof RunStyle
export const RUN_STYLE_KEYS: RunStyleKey[] = ['color', 'fontFamily', 'fontSize', 'bold', 'italic', 'underline', 'strikethrough']

/** 박스 기본 서식 (CanvasEl에서 필요한 필드만) */
export interface TextDefaults {
  color: string
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline?: boolean
  strikethrough?: boolean
}

type Resolved = Required<RunStyle>

export function runsOf(el: { content: string; runs?: TextRun[] }): TextRun[] {
  return el.runs && el.runs.length > 0 ? el.runs : [{ text: el.content }]
}

export function plainText(runs: TextRun[]): string {
  return runs.map(run => run.text).join('')
}

/** 글꼴 비교용 정규화: 따옴표·공백·대소문자 차이 무시 */
function fontKey(fontFamily: string): string {
  return fontFamily.replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().toLowerCase()
}

/** 저장/HTML 속성에 넣기 안전하도록 큰따옴표를 작은따옴표로 */
function canonicalFont(fontFamily: string): string {
  return fontFamily.replace(/"/g, "'")
}

function resolve(run: RunStyle, d: TextDefaults): Resolved {
  return {
    color: (run.color ?? d.color).toLowerCase(),
    fontFamily: fontKey(run.fontFamily ?? d.fontFamily),
    fontSize: run.fontSize ?? d.fontSize,
    bold: run.bold ?? d.bold,
    italic: run.italic ?? d.italic,
    underline: run.underline ?? !!d.underline,
    strikethrough: run.strikethrough ?? !!d.strikethrough,
  }
}

function sameStyle(a: RunStyle, b: RunStyle): boolean {
  return RUN_STYLE_KEYS.every(key => key === 'fontFamily'
    ? (a.fontFamily === undefined ? b.fontFamily === undefined : b.fontFamily !== undefined && fontKey(a.fontFamily) === fontKey(b.fontFamily))
    : a[key] === b[key])
}

/** 빈 구간 제거, 기본값과 같은 속성 제거, 같은 서식의 인접 구간 병합. 서식이 하나도 없으면 undefined */
export function normalizeRuns(runs: TextRun[], d: TextDefaults): TextRun[] | undefined {
  const out: TextRun[] = []
  for (const run of runs) {
    if (!run.text) continue
    const clean: TextRun = { text: run.text }
    const base = resolve({}, d)
    for (const key of RUN_STYLE_KEYS) {
      const value = key === 'color' && run.color ? run.color.toLowerCase() : run[key]
      if (value === undefined) continue
      if (key === 'fontFamily') {
        if (fontKey(value as string) !== base.fontFamily) clean.fontFamily = canonicalFont(value as string)
      } else if (value !== base[key]) (clean as unknown as Record<string, unknown>)[key] = value
    }
    const last = out[out.length - 1]
    if (last && sameStyle(last, clean)) last.text += clean.text
    else out.push(clean)
  }
  return out.some(run => RUN_STYLE_KEYS.some(key => run[key] !== undefined)) ? out : undefined
}

/** [start, end) 경계에서 구간을 쪼갠다 */
function splitAt(runs: TextRun[], start: number, end: number): TextRun[] {
  const out: TextRun[] = []
  let pos = 0
  for (const run of runs) {
    const runEnd = pos + run.text.length
    const cuts = [start, end].filter(c => c > pos && c < runEnd).map(c => c - pos)
    let prev = 0
    for (const cut of [...cuts, run.text.length]) {
      if (cut > prev) out.push({ ...run, text: run.text.slice(prev, cut) })
      prev = cut
    }
    pos = runEnd
  }
  return out
}

export function applyStyleToRange(runs: TextRun[], start: number, end: number, patch: RunStyle): TextRun[] {
  let pos = 0
  return splitAt(runs, start, end).map(run => {
    const inRange = pos >= start && pos < end
    pos += run.text.length
    return inRange ? { ...run, ...patch } : run
  })
}

export function clearStyleKeys(runs: TextRun[], keys: RunStyleKey[]): TextRun[] {
  return runs.map(run => {
    const next = { ...run }
    for (const key of keys) delete next[key]
    return next
  })
}

/** 범위 안 글자들의 서식. 값이 서로 다르면 해당 속성은 undefined (섞임) */
export function rangeStyle(runs: TextRun[], start: number, end: number, d: TextDefaults): Partial<Resolved> {
  let pos = 0
  let result: Partial<Resolved> | null = null
  for (const run of runs) {
    const runEnd = pos + run.text.length
    if (runEnd > start && pos < end) {
      const r = resolve(run, d)
      if (!result) result = { ...r }
      else for (const key of RUN_STYLE_KEYS) if (result[key] !== r[key]) delete result[key]
    }
    pos = runEnd
  }
  return result ?? resolve({}, d)
}

function decoration(r: Resolved): string {
  return [r.underline && 'underline', r.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none'
}

/** 구간 span 스타일: 색/크기/굵기/기울임은 기본값과 다를 때만, 밑줄·취소선은 항상 명시
 *  (부모의 text-decoration은 자식에서 끌 수 없으므로 컨테이너에는 두지 않는다) */
function runCss(run: RunStyle, d: TextDefaults): React.CSSProperties {
  const r = resolve(run, d)
  return {
    color: run.color,
    fontFamily: run.fontFamily,
    fontSize: run.fontSize !== undefined ? `${run.fontSize}px` : undefined,
    fontWeight: run.bold !== undefined ? (run.bold ? 'bold' : 'normal') : undefined,
    fontStyle: run.italic !== undefined ? (run.italic ? 'italic' : 'normal') : undefined,
    textDecoration: decoration(r),
  }
}

export function RichTextContent({ runs, defaults }: { runs: TextRun[]; defaults: TextDefaults }): JSX.Element {
  return <>{runs.map((run, i) => <span key={i} style={runCss(run, defaults)}>{run.text}</span>)}</>
}

// ── 편집기 ──────────────────────────────────────────────────────────────────

const SENTINEL = 'data-sentinel'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cssText(style: React.CSSProperties): string {
  const map: Record<string, string | undefined> = {
    color: style.color as string | undefined,
    'font-family': style.fontFamily ? escapeHtml(canonicalFont(style.fontFamily as string)) : undefined,
    'font-size': style.fontSize as string | undefined,
    'font-weight': style.fontWeight as string | undefined,
    'font-style': style.fontStyle as string | undefined,
    'text-decoration': style.textDecoration as string | undefined,
  }
  return Object.entries(map).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}:${v}`).join(';')
}

function renderHtml(runs: TextRun[], d: TextDefaults): string {
  const html = runs.filter(run => run.text).map(run => `<span style="${cssText(runCss(run, d))}">${escapeHtml(run.text)}</span>`).join('')
  // 마지막이 줄바꿈이거나 비어 있으면 커서가 놓일 줄을 만들기 위한 보조 <br> (내용으로 치지 않음)
  const text = plainText(runs)
  return html + (text === '' || text.endsWith('\n') ? `<br ${SENTINEL}="1">` : '')
}

function toHex(color: string): string {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return color
  return '#' + m.slice(1, 4).map(v => Number(v).toString(16).padStart(2, '0')).join('')
}

/** 실제 적용된 스타일을 읽어 구간 서식으로 변환 (브라우저가 <b>, <font>, <div> 등을 끼워 넣어도 동작) */
function styleOf(el: Element, root: HTMLElement): RunStyle {
  const cs = getComputedStyle(el)
  let underline = false
  let strikethrough = false
  for (let node: Element | null = el; node && node !== root.parentElement; node = node.parentElement) {
    const line = getComputedStyle(node).textDecorationLine
    if (line.includes('underline')) underline = true
    if (line.includes('line-through')) strikethrough = true
    if (node === root) break
  }
  return {
    color: toHex(cs.color),
    fontFamily: canonicalFont(cs.fontFamily),
    fontSize: Math.round(parseFloat(cs.fontSize) * 10) / 10,
    bold: (parseInt(cs.fontWeight, 10) || 400) >= 600,
    italic: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique',
    underline,
    strikethrough,
  }
}

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI'])

/** DOM(또는 Range 조각)을 구간 목록으로 직렬화. styleRoot가 없으면 글자 수 계산용 */
function serialize(node: Node, root: HTMLElement | null, out: TextRun[], ctx: { started: boolean }) {
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child as Text).data
      if (!text) return
      out.push({ text, ...(root && child.parentElement ? styleOf(child.parentElement, root) : {}) })
      ctx.started = true
    } else if (child instanceof Element) {
      if (child.tagName === 'BR') {
        if (child.hasAttribute(SENTINEL)) return
        out.push({ text: '\n', ...(root && child.parentElement ? styleOf(child.parentElement, root) : {}) })
        ctx.started = true
      } else {
        if (BLOCK_TAGS.has(child.tagName) && ctx.started) out.push({ text: '\n' })
        serialize(child, root, out, ctx)
      }
    }
  })
}

function readRuns(root: HTMLElement): TextRun[] {
  const out: TextRun[] = []
  serialize(root, root, out, { started: false })
  return out
}

function offsetOf(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(container, offset)
  const out: TextRun[] = []
  serialize(range.cloneContents(), null, out, { started: false })
  return plainText(out).length
}

/** 직접 렌더링한 DOM(span + 텍스트)에서 글자 위치 → DOM 위치 */
function pointAt(root: HTMLElement, target: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let pos = 0
  let last: Text | null = null
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (target <= pos + node.data.length) return [node, target - pos]
    pos += node.data.length
    last = node
  }
  if (last) return [last, last.data.length]
  return [root, 0]
}

export interface RichTextEditorHandle {
  /** 현재 선택 범위 (글자 위치). 편집기에 선택이 없으면 마지막으로 기억한 범위 */
  getSelection(): { start: number; end: number }
  /** 구간을 다시 그리고 선택 범위를 복원. focus=false면 툴바 입력칸 포커스를 뺏지 않도록 화면만 갱신 */
  setRuns(runs: TextRun[], defaults: TextDefaults, opts?: { selection?: { start: number; end: number }; focus?: boolean }): void
  readRuns(): TextRun[]
}

interface EditorProps {
  initialRuns: TextRun[]
  defaults: TextDefaults
  style: React.CSSProperties
  onInput: (runs: TextRun[]) => void
  onSelectionChange: (selection: { start: number; end: number }) => void
  onBlur: (event: React.FocusEvent<HTMLDivElement>) => void
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, EditorProps>(function RichTextEditor(
  { initialRuns, defaults, style, onInput, onSelectionChange, onBlur }, ref,
) {
  const rootRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef({ start: 0, end: 0 })
  const composingRef = useRef(false)
  const callbacksRef = useRef({ onInput, onSelectionChange })
  callbacksRef.current = { onInput, onSelectionChange }

  const restore = (sel: { start: number; end: number }) => {
    const root = rootRef.current
    if (!root) return
    const [sn, so] = pointAt(root, sel.start)
    const [en, eo] = pointAt(root, sel.end)
    const range = document.createRange()
    range.setStart(sn, so)
    range.setEnd(en, eo)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const emitInput = () => {
    const root = rootRef.current
    if (!root) return
    // 줄바꿈으로 끝나면 커서용 보조 <br> 유지
    const text = plainText(readRuns(root))
    const hasSentinel = root.lastChild instanceof Element && root.lastChild.hasAttribute(SENTINEL)
    if ((text === '' || text.endsWith('\n')) && !hasSentinel) {
      const br = document.createElement('br')
      br.setAttribute(SENTINEL, '1')
      root.appendChild(br)
    }
    callbacksRef.current.onInput(readRuns(root))
  }

  useImperativeHandle(ref, () => ({
    getSelection: () => selectionRef.current,
    readRuns: () => (rootRef.current ? readRuns(rootRef.current) : []),
    setRuns: (runs, d, opts = {}) => {
      const root = rootRef.current
      if (!root) return
      root.innerHTML = renderHtml(runs, d)
      const sel = opts.selection ?? selectionRef.current
      selectionRef.current = sel
      if (opts.focus === false) return
      root.focus({ preventScroll: true })
      restore(sel)
    },
  }))

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.innerHTML = renderHtml(initialRuns, defaults)
    root.focus({ preventScroll: true })
    // 기존 textarea처럼 편집 시작 시 전체 선택
    const range = document.createRange()
    range.selectNodeContents(root)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    const length = plainText(initialRuns).length
    selectionRef.current = { start: 0, end: length }
    callbacksRef.current.onSelectionChange(selectionRef.current)

    const onSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return
      const range = selection.getRangeAt(0)
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return
      const start = offsetOf(root, range.startContainer, range.startOffset)
      const end = offsetOf(root, range.endContainer, range.endOffset)
      selectionRef.current = { start, end }
      callbacksRef.current.onSelectionChange(selectionRef.current)
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
    // 마운트 시 한 번만 초기화 (이후 DOM은 사용자가 직접 편집)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 선택 위치에 일반 텍스트 삽입 (줄바꿈, 붙여넣기). 커서가 글자 안에 있으면 그 글자 서식을 이어받음 */
  const insertPlain = (text: string) => {
    const root = rootRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    let node = range.startContainer
    let offset = range.startOffset
    if (node.nodeType !== Node.TEXT_NODE) {
      // 요소 사이에 커서가 있으면 앞쪽 텍스트 끝에 붙여 서식을 이어받음
      const prev = node.childNodes[offset - 1]
      if (prev && prev.nodeType === Node.TEXT_NODE) { node = prev; offset = (prev as Text).data.length }
      else if (prev instanceof Element && prev.lastChild?.nodeType === Node.TEXT_NODE) { node = prev.lastChild; offset = (prev.lastChild as Text).data.length }
    }
    if (node.nodeType === Node.TEXT_NODE) {
      (node as Text).insertData(offset, text)
      range.setStart(node, offset + text.length)
    } else {
      const textNode = document.createTextNode(text)
      range.insertNode(textNode)
      range.setStart(textNode, text.length)
    }
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    emitInput()
  }

  return (
    <div ref={rootRef} contentEditable suppressContentEditableWarning spellCheck={false}
      style={{ ...style, whiteSpace: 'pre-wrap', wordBreak: 'break-word', textDecoration: 'none' }}
      onInput={() => { if (!composingRef.current) emitInput() }}
      onCompositionStart={() => { composingRef.current = true }}
      onCompositionEnd={() => { composingRef.current = false; emitInput() }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && !composingRef.current) {
          e.preventDefault()
          insertPlain('\n')
        }
      }}
      onPaste={e => {
        e.preventDefault()
        insertPlain(e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'))
      }}
      onDrop={e => e.preventDefault()}
      onBlur={onBlur}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()} />
  )
})
