import { createContext, useContext, useEffect, useState, useSyncExternalStore, type Dispatch, type SetStateAction, type EffectCallback, type DependencyList } from 'react'
import { emitTo, listen } from '@tauri-apps/api/event'

export const isPresentation = new URLSearchParams(location.search).get('presentation') === '1'
export const BoardScope = createContext('app')
const values = new Map<string, unknown>()
const subscribers = new Set<() => void>()
const pending = new Map<string, unknown>()
let active = false
let timer: ReturnType<typeof setTimeout> | undefined
let sending = false
let fullSnapshot = false
// Large images are sent once per presentation connection, not on every drag/text edit.
const assetIds = new Map<string, number>()
const assets = new Map<number, string>()
let nextAsset = 1
const subscribe = (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn) } }

export function publish(key: string, value: unknown) {
  values.set(key, value)
  if (!active || isPresentation) return
  pending.set(key, value)
  schedule()
}
function schedule() {
  if (!timer && !sending) timer = setTimeout(() => { timer = undefined; void flush() }, 32)
}
async function flush() {
  if (!active || sending) return
  sending = true
  const reset = fullSnapshot
  fullSnapshot = false
  if (reset) assetIds.clear()
  const entries = reset ? [...values] : [...pending]
  pending.clear()
  const added: [number, string][] = []
  const json = JSON.stringify(entries, (_key, value) => {
    if (typeof value !== 'string' || !value.startsWith('data:') || value.length < 1024) return value
    let id = assetIds.get(value)
    if (id === undefined) { id = nextAsset++; assetIds.set(value, id); added.push([id, value]) }
    return { __presentationAsset: id }
  })
  try {
    await emitTo('presentation', 'presentation-state', { reset, assets: added, json })
  } catch (error) {
    console.error('발표 화면 동기화 실패', error)
    fullSnapshot = true
  } finally {
    sending = false
    if (active && (pending.size || fullSnapshot)) schedule()
  }
}
export function setPresentationActive(value: boolean) {
  active = value
  if (!value) { pending.clear(); assetIds.clear(); if (timer) clearTimeout(timer); timer = undefined }
}
export async function startPublisher() {
  return listen('presentation-ready', () => {
    active = true
    fullSnapshot = true
    schedule()
  })
}
export async function startReceiver() {
  const unlisten = await listen<{ reset: boolean; assets: [number, string][]; json: string }>('presentation-state', ({ payload }) => {
    if (payload.reset) { values.clear(); assets.clear() }
    payload.assets.forEach(([id, value]) => assets.set(id, value))
    const entries: [string, unknown][] = JSON.parse(payload.json, (_key, value) =>
      value && typeof value === 'object' && '__presentationAsset' in value ? assets.get(value.__presentationAsset) : value)
    entries.forEach(([key, value]) => values.set(key, value))
    subscribers.forEach(fn => fn())
  })
  try { await emitTo('main', 'presentation-ready') } catch (error) { unlisten(); throw error }
  return unlisten
}
export function useRemoteValue<T>(key: string, fallback: T): T {
  return useSyncExternalStore(subscribe, () => values.has(key) ? values.get(key) as T : fallback)
}
export function useBoardState<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const key = `${useContext(BoardScope)}:${name}`
  const [local, setLocal] = useState(initial)
  const remote = useRemoteValue(key, local)
  useEffect(() => {
    if (isPresentation) return
    publish(key, local)
    return () => { values.delete(key) }
  }, [key, local])
  return [isPresentation ? remote : local, isPresentation ? () => {} : setLocal]
}
// The audience view never loads/saves data or installs editing shortcuts.
export function useEditorEffect(effect: EffectCallback, deps?: DependencyList) {
  useEffect(() => { if (!isPresentation) return effect() }, deps)
}
