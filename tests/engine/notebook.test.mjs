// q notebook settings; p Node bridge process; R returned game result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const run = q => spawnSync(process.execPath, [fileURLToPath(new URL('../../notebooks/engine_bridge.mjs', import.meta.url))],
  { input: JSON.stringify(q), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });

test('the notebook capped demonstration completes the same fifteen-tier budget', () => {
  const p = run({ seed: 20261006, decade: 1990, cap: true });
  assert.equal(p.status, 0, p.stderr);
  const R = JSON.parse(p.stdout);
  assert.equal(R.cap, true);
  assert.deepEqual(R.tier_counts, { S: 2, A: 4, B: 4, C: 3, D: 2 });
  assert.equal(new Set(R.draft_club_decades.map(k => k.split(':')[0])).size, 5);
});

test('the notebook rejects a non-boolean cap rather than treating it as Classic', () => {
  const p = run({ cap: 'yes' });
  assert.equal(p.status, 1);
  assert.match(p.stderr, /cap/i);
});

test("the notebook plays the named formation and reports the manager's club spell", () => {
  const p = run({ seed: 20261006, decade: 1990, cap: true, formation: '3-5-2' });
  assert.equal(p.status, 0, p.stderr);
  const R = JSON.parse(p.stdout);
  assert.equal(R.formation, '3-5-2');
  assert.deepEqual(R.starters.map(x => x.slot), ['GK', 'CB', 'CB', 'CB', 'LWB', 'CDM', 'CM', 'CM', 'RWB', 'ST', 'ST']);
  assert.ok(R.manager.t.some(([q, a]) => q === R.team.q && a === R.team.a));
});

test("without a formation setting the notebook starts in the manager's first recorded formation", () => {
  const p = run({ seed: 20261006, decade: 1990, cap: true });
  assert.equal(p.status, 0, p.stderr);
  const R = JSON.parse(p.stdout);
  assert.equal(R.formation, R.manager.f[0]);
});
