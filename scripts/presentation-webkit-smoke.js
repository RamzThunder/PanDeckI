// Injected only by the macOS smoke-test harness; no real database is accessed.
(() => {
  const callbacks = new Map(), listeners = new Map(), calls = [], errors = [];
  let id = 0;
  window.addEventListener('error', event => errors.push(event.message));
  window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
  const board = { id: 'smoke', title: '발표 테스트', category: '수업', createdAt: '', updatedAt: '', accent: '#aaa' };
  const meta = { board, studentLists: [{ id: 'students', title: '우리 반', students: ['가람', '나래'] }], rootStyle: '--global-font: sans-serif;' };
  const text = { id: 'text', type: 'text', x: 100, y: 80, w: 400, h: 120, z: 1, rotation: 0, opacity: 100,
    content: '발표 화면 확인', fontSize: 30, color: '#123456', bold: false, italic: false, fontFamily: 'sans-serif',
    bgColor: '#fff', bgOpacity: 0, align: 'left', alignV: 'top', textRadius: 0, borderWidth: 0, borderColor: '#333', clipShape: 'none', photoRadius: 0 };
  const data = { bg: '#abcdef', elements: [text] };
  const send = (entries, reset = false) => callbacks.get(listeners.get('presentation-state'))?.({ payload: { reset, assets: [], json: JSON.stringify(entries) } });
  window.__TAURI_INTERNALS__ = {
    transformCallback: fn => { callbacks.set(++id, fn); return id; },
    unregisterCallback: key => callbacks.delete(key),
    convertFileSrc: value => value,
    invoke: async (command, args) => {
      calls.push(command);
      if (command === 'plugin:event|listen') { listeners.set(args.event, args.handler); return args.handler; }
      if (command === 'plugin:event|emit_to' && args.event === 'presentation-ready') {
        setTimeout(() => send([
          ['app:meta', meta], ['board_smoke:data', data], ['board_smoke:showRandomPicker', true],
          ['board_smoke:picker:listId', 'students'], ['board_smoke:picker:resultIndices', [1]],
          ['board_smoke:showGroupMaker', true], ['board_smoke:group:listId', 'students'], ['board_smoke:group:groups', [[0], [1]]],
        ], true), 30);
        return;
      }
      if (command === 'stop_presentation' || command === 'plugin:event|unlisten') return;
      throw Error(`Unexpected audience command: ${command}`);
    },
  };
  const assert = (value, message) => { if (!value) throw Error(message); };
  window.presentationSmoke = phase => {
    assert(errors.length === 0, errors.join('; '));
    const el = document.querySelector('[data-id="text"]');
    if (phase === 1) {
      assert(el?.textContent === text.content, 'board text missing');
      assert(getComputedStyle(document.querySelector('.board-dock')).display === 'none', 'editing dock visible');
      assert(document.querySelector('[inert]'), 'audience must be inert');
      assert(!document.querySelector('[contenteditable="true"]'), 'audience has editor');
      assert(document.querySelector('.random-picker-winners')?.textContent === '나래', 'picker result missing');
      assert(document.querySelectorAll('.random-picker-group-name').length === 2, 'groups missing');
      assert(!document.querySelector('.random-picker-toolbar'), 'widget toolbar visible');
      assert(document.querySelector('.presentation-stage').getBoundingClientRect().width <= innerWidth + 1, 'stage exceeds viewport');
      send([['board_smoke:data', { ...data, elements: [{ ...text, content: '실시간 수정', x: 350 }] }], ['board_smoke:picker:resultIndices', [0]]]);
    } else if (phase === 2) {
      assert(el?.textContent === '실시간 수정' && el.style.left === '350px', 'live edit not reflected');
      assert(document.querySelector('.random-picker-winners')?.textContent === '가람', 'live picker result missing');
      send([['board_smoke:geometry', { text: { left: '500px', top: '150px' } }]]);
    } else if (phase === 3) {
      assert(el.style.left === '500px' && el.style.top === '150px', 'drag preview missing');
      send([['app:meta', { ...meta, board: null }]]);
    } else if (phase === 4) {
      assert(document.querySelector('.presentation-waiting'), 'waiting screen missing');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert(calls.includes('stop_presentation'), 'Escape did not close presentation');
      assert(calls.every(command => command.startsWith('plugin:event|') || command === 'stop_presentation'), 'audience accessed data backend');
    }
    return `PASS ${phase}`;
  };
})();
