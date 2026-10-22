import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let Tabs;

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: 'custom',
  });
  ({ Tabs } = await server.ssrLoadModule('/src/tabs.ts'));
});

after(async () => { await server?.close(); });

function fixture() {
  let focused = null;
  class Element extends EventTarget {
    attributes = new Map();
    hidden = false;
    tabIndex = 0;
    constructor(id) {
      super();
      this.id = id;
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    focus() { focused = this; }
  }
  const tabs = Array.from({ length: 3 }, (_, i) => {
    const tab = new Element(`tab-${i}`);
    tab.setAttribute('aria-controls', `panel-${i}`);
    return tab;
  });
  const panels = tabs.map((_, i) => {
    const panel = new Element(`panel-${i}`);
    panel.setAttribute('role', 'tabpanel');
    return panel;
  });
  const root = {
    querySelector: () => ({ querySelectorAll: () => tabs }),
    ownerDocument: { getElementById: (id) => panels.find((panel) => panel.id === id) ?? null },
    contains: (node) => panels.includes(node),
  };
  return { root, tabs, panels, focused: () => focused };
}

function checkSelected({ tabs, panels }, index) {
  tabs.forEach((tab, i) => {
    assert.equal(tab.getAttribute('aria-selected'), String(i === index));
    assert.equal(tab.tabIndex, i === index ? 0 : -1);
    assert.equal(panels[i].hidden, i !== index);
    assert.equal(panels[i].getAttribute('aria-labelledby'), tab.id);
  });
}

test('defaults to the first tab and initializes ARIA relationships and roving focus', () => {
  const dom = fixture();
  new Tabs(dom.root);
  checkSelected(dom, 0);
  assert.equal(dom.focused(), null);
});

test('supports clicking and programmatic selection', () => {
  const dom = fixture();
  const tabs = new Tabs(dom.root);
  checkSelected(dom, 0);
  dom.tabs[2].dispatchEvent(new Event('click'));
  checkSelected(dom, 2);
  tabs.select('panel-1');
  checkSelected(dom, 1);
  assert.throws(() => tabs.select('missing'), /Unknown tab panel/);
  checkSelected(dom, 1);
});

test('arrow keys wrap and Home/End select and focus their destination', () => {
  const dom = fixture();
  new Tabs(dom.root);
  for (const [from, key, to] of [
    [0, 'ArrowLeft', 2], [2, 'ArrowRight', 0],
    [0, 'ArrowRight', 1], [1, 'End', 2], [2, 'Home', 0],
  ]) {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperty(event, 'key', { value: key });
    dom.tabs[from].dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(dom.focused(), dom.tabs[to]);
    checkSelected(dom, to);
  }
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value: 'Tab' });
  dom.tabs[0].dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
  checkSelected(dom, 0);
});

test('reports missing tablists, tabs, and invalid panel relationships', () => {
  assert.throws(() => new Tabs({ querySelector: () => null }), /require a tablist/);
  const empty = fixture();
  empty.tabs.length = 0;
  assert.throws(() => new Tabs(empty.root), /at least one tab/);
  const missing = fixture();
  missing.tabs[0].setAttribute('aria-controls', 'missing');
  assert.throws(() => new Tabs(missing.root), /Invalid tab panel/);
});
