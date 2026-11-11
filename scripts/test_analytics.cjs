const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'website', 'analytics.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'website', 'assets', 'analytics.js'), 'utf8');
const model = JSON.parse(fs.readFileSync(path.join(root, 'website', 'analytics-data.json'), 'utf8'));
const benchmark = JSON.parse(fs.readFileSync(path.join(root, 'website', 'benchmark-summary.json'), 'utf8'));

class FakeClassList {
  values = new Set();
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force);
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this._value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.style = {};
    this.classList = new FakeClassList();
    this.parentElement = { classList: new FakeClassList() };
    this.listeners = new Map();
  }
  get value() { return this._value; }
  set value(value) { this._value = String(value ?? ''); }
  addEventListener(name, callback) {
    const callbacks = this.listeners.get(name) || [];
    callbacks.push(callback);
    this.listeners.set(name, callbacks);
  }
  dispatch(name, event = {}) {
    for (const callback of this.listeners.get(name) || []) callback(event);
  }
  replaceChildren() { this.innerHTML = ''; this.children = []; }
  prepend(element) { this.children = [element, ...(this.children || [])]; }
}

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const references = new Set([...source.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]));
const missingIds = [...references].filter((id) => !ids.has(id));
assert.deepEqual(missingIds, [], `Analytics script references missing HTML ids: ${missingIds.join(', ')}`);

const elements = new Map([...ids].map((id) => [id, new FakeElement(id)]));
const document = {
  readyState: 'complete',
  getElementById(id) { return elements.get(id) || null; },
  querySelector(selector) { return selector === '.analytics-main' ? new FakeElement('analytics-root') : null; },
  createElement(tag) { return new FakeElement(tag); },
  addEventListener() {}
};

global.document = document;
global.fetch = async (input) => {
  const key = String(input).split('/').pop();
  const body = key === 'analytics-data.json' ? model : key === 'benchmark-summary.json' ? benchmark : null;
  return { ok: Boolean(body), json: async () => body };
};

require(path.join(root, 'website', 'assets', 'analytics.js'));

async function tick() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  await tick();
  assert.equal(elements.get('benchmark-match').textContent, '200 / 200');
  assert.equal(elements.get('snapshot-interviews').textContent, '0');
  assert.equal(elements.get('fin-net').textContent, '-66 000 ₽');
  assert.equal(elements.get('fin-payback').textContent, 'Не достигается');
  assert.equal(elements.get('finance-validation').hidden, true);

  elements.get('fin-cases').value = '120000';
  elements.get('finance-form').dispatch('input');
  assert.equal(elements.get('fin-net').textContent, '1,1 млн ₽');
  assert.equal(elements.get('fin-payback').textContent, '27 мес.');

  elements.get('fin-cases').value = '';
  elements.get('finance-form').dispatch('input');
  assert.equal(elements.get('fin-net').textContent, '—');
  assert.equal(elements.get('finance-validation').hidden, false);
  assert.match(elements.get('finance-validation').textContent, /Объём кейсов/);

  elements.get('fin-cases').value = '60000';
  elements.get('finance-form').dispatch('input');
  elements.get('time-control').value = '20';
  elements.get('time-trace').value = '15';
  elements.get('time-control').dispatch('input');
  assert.equal(elements.get('out-time').textContent, '+25%');

  elements.get('repeat-control').value = '18 / 120';
  elements.get('repeat-trace').value = '12 / 120';
  elements.get('repeat-control').dispatch('input');
  assert.equal(elements.get('out-repeat').textContent, '+33,3%');

  elements.get('quality-tp').value = '160';
  elements.get('quality-fp').value = '10';
  elements.get('quality-fn').value = '8';
  elements.get('quality-tp').dispatch('input');
  assert.match(elements.get('out-quality').textContent, /94,1% \/ 95,2%/);

  elements.get('quality-false').value = '1 / 300';
  elements.get('quality-false').dispatch('input');
  assert.equal(elements.get('out-false').textContent, '0,3%');

  ['qual-process', 'qual-gap', 'qual-integration', 'qual-owner'].forEach((id, index) => {
    elements.get(id).value = ['100', '60', '30', '20'][index];
    elements.get(id).dispatch('input');
  });
  assert.equal(elements.get('qualified-count').textContent, '20 из 300');
  assert.ok(elements.get('competitor-rows').innerHTML.includes('ITFB EasyDoc 4.0'));
  assert.ok(elements.get('metric-targets').innerHTML.includes('медиана активного времени'));

  console.log('PASS: analytics page IDs, data rendering, finance validation, scenario math and pilot calculators');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
