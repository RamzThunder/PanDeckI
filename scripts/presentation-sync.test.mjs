import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(fs.readFileSync(new URL('../src/presentation/sync.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const wait = () => new Promise(resolve => setTimeout(resolve, 90))
function harness() {
  const listeners = new Map()
  const messages = []
  let failNext = false
  function window(label) {
    const exports = {}
    const react = {
      createContext: value => ({ value }), useContext: context => context.value,
      useState: initial => [typeof initial === 'function' ? initial() : initial, () => { throw Error('audience changed local state') }],
      useEffect: fn => fn(), useSyncExternalStore: (_subscribe, get) => get(),
    }
    const events = {
      listen: async (event, callback) => {
        const key = `${label}:${event}`
        listeners.set(key, callback)
        return () => listeners.delete(key)
      },
      emitTo: async (target, event, payload) => {
        if (failNext && event === 'presentation-state') { failNext = false; throw Error('simulated delivery failure') }
        messages.push({ target, event, payload })
        listeners.get(`${target}:${event}`)?.({ payload: JSON.parse(JSON.stringify(payload ?? null)) })
      },
    }
    vm.runInNewContext(source, {
      exports, require: name => name === 'react' ? react : events,
      location: { search: label === 'presentation' ? '?presentation=1' : '' },
      URLSearchParams, setTimeout, clearTimeout, console: { error() {} },
    })
    return exports
  }
  return { window, messages, fail: () => { failNext = true } }
}

test('late audience joins with current unsaved state; image assets are reused in updates', async () => {
  const h = harness(), editor = h.window('main'), audience = h.window('presentation')
  await editor.startPublisher()
  const image = 'data:image/png;base64,' + 'x'.repeat(4096)
  editor.publish('board:data', { elements: [{ id: 'photo', content: image, x: 10 }] })
  await audience.startReceiver()
  await wait()
  assert.equal(audience.useRemoteValue('board:data', null).elements[0].content, image)
  editor.publish('board:data', { elements: [{ id: 'photo', content: image, x: 90 }] })
  editor.publish('board:picker:rollingName', '민수')
  await wait()
  assert.equal(audience.useRemoteValue('board:data', null).elements[0].x, 90)
  assert.equal(audience.useRemoteValue('board:picker:rollingName', ''), '민수')
  const packets = h.messages.filter(x => x.event === 'presentation-state')
  assert.equal(packets[0].payload.assets.length, 1)
  assert.equal(packets[1].payload.assets.length, 0)
  assert.ok(packets[1].payload.json.length < 300)
  editor.setPresentationActive(false)
})

test('reopening restores full assets and latest edits made while presentation was closed', async () => {
  const h = harness(), editor = h.window('main')
  await editor.startPublisher()
  const image = 'data:image/png;base64,' + 'y'.repeat(2000)
  editor.publish('app:meta', { board: 'first' })
  editor.publish('board:data', { image, text: '처음' })
  const close = await h.window('presentation').startReceiver()
  await wait()
  editor.setPresentationActive(false)
  close()
  editor.publish('app:meta', { board: 'second' })
  editor.publish('board:data', { image, text: '수정됨' })
  const reopened = h.window('presentation')
  await reopened.startReceiver()
  await wait()
  assert.equal(reopened.useRemoteValue('app:meta', null).board, 'second')
  assert.equal(reopened.useRemoteValue('board:data', null).text, '수정됨')
  assert.equal(reopened.useRemoteValue('board:data', null).image, image)
  editor.setPresentationActive(false)
})

test('a failed delivery recovers with a complete snapshot including assets', async () => {
  const h = harness(), editor = h.window('main'), audience = h.window('presentation')
  await editor.startPublisher()
  const image = 'data:image/png;base64,' + 'z'.repeat(2000)
  editor.publish('board:data', { image })
  h.fail()
  await audience.startReceiver()
  await wait()
  assert.equal(audience.useRemoteValue('board:data', null).image, image)
  editor.setPresentationActive(false)
})

test('audience state setters and editor effects cannot write or run editing code', () => {
  const audience = harness().window('presentation')
  let edited = false
  audience.useEditorEffect(() => { edited = true }, [])
  const [value, setValue] = audience.useBoardState('data', 'unchanged')
  setValue('changed')
  assert.equal(value, 'unchanged')
  assert.equal(edited, false)
})
