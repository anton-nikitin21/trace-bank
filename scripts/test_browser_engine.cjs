// Exercise the actual inline browser engine, not a copied implementation.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '../website/demo.html'), 'utf8');
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
const fixtures = blocks.find(code => code.startsWith('window.INITIAL_PACKET='));
const engine = blocks.find(code => code.includes('async function localApi('));
assert.ok(fixtures && engine, 'Browser fixtures and adapter must be present');
const context = vm.createContext({window:{}, crypto:webcrypto, TextEncoder, structuredClone});
vm.runInContext(fixtures, context);
vm.runInContext(engine, context);
(async () => {
  const initial = await vm.runInContext("localApi('/api/analyze', window.INITIAL_PACKET)",context);
  const corrected = await vm.runInContext("localApi('/api/analyze', window.CORRECTED_PACKET)",context);
  assert.equal(initial.issue_count,4);
  assert.equal(corrected.issue_count,0);
  assert.equal(corrected.rows.filter(row=>row.status==='complete').length,3);
  await assert.rejects(vm.runInContext(`localApi('/api/approve',{revision:${JSON.stringify(initial.revision)},comment:'Reviewed synthetic packet'})`,context),/замечания/);
  const wrong = structuredClone(context.window.INITIAL_PACKET);
  wrong.profile='unknown-profile'; context.wrong=wrong;
  await assert.rejects(vm.runInContext("localApi('/api/analyze', wrong)",context));
  console.log('PASS: actual browser engine, initial/corrected packets, approval guard, invalid profile');
})().catch(error=>{ console.error(error); process.exitCode=1; });
