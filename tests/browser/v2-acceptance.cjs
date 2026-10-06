/* Real browser controls: no draft mutation or automatic game-player selection. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const arg = key => { const i = process.argv.indexOf(key); return i < 0 ? undefined : process.argv[i + 1]; };
const { chromium } = require(arg('--playwright') || process.env.ERA_ELEVEN_PLAYWRIGHT || 'playwright');
const out = arg('--output') || process.env.ERA_ELEVEN_TEST_OUTPUT;
if (!out) throw new Error('Pass --output pointing to a persistent project work folder.');
fs.mkdirSync(out, { recursive: true });
const base = arg('--url') || process.env.ERA_ELEVEN_URL || 'http://127.0.0.1:8775';
const G = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../data/game.json'), 'utf8'));
const log = [], errors = [];
const note = (name, data) => { log.push({ name, data, passed: true }); process.stdout.write(`${name}\n`); };
const state = p => p.evaluate(() => JSON.parse(localStorage.getItem('football-era-lab-v2')));
const width = async p => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, 'Page overflows viewport');
const settle = async p => p.waitForFunction(() => document.body.getAttribute('aria-busy') !== 'true' && !document.querySelector('.loading'));
async function click(p, s) { await p.locator(s).click(); await settle(p); }
async function open(kind, viewport) {
  const ctx = await chromium.launchPersistentContext(path.join(out, `profile-${kind}`), { headless: true,
    channel: process.env.ERA_ELEVEN_BROWSER_CHANNEL || undefined, viewport, reducedMotion: 'reduce',
    acceptDownloads: true, downloadsPath: path.join(out, 'downloads'), timezoneId: 'America/Whitehorse' });
  const p = ctx.pages()[0] || await ctx.newPage();
  p.on('pageerror', e => errors.push(`${kind}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`${kind}: ${m.text()}`); });
  await p.goto(base); await settle(p); await p.evaluate(() => localStorage.clear()); await p.reload(); await settle(p);
  return { ctx, p };
}
async function begin(p, D, s) {
  await click(p, `[data-era="${D}"]`); await p.locator('#seed').fill(String(s)); await p.locator('#start-form button').click(); await settle(p);
  assert.equal(await p.locator('[data-manager]').count(), 5); assert.equal((await state(p)).slots.filter(Boolean).length, 0);
}
async function pick(p, slot, preferred) {
  const s = await state(p), I = new Set(s.slots.filter(Boolean).map(c => c.p));
  const Q = G.cards[s.combo].filter(c => !I.has(c.p));
  const c = Q.find(c => c.pos.includes(preferred)) || Q[0];
  await click(p, `[data-player="${c.p}"]`);
  assert.equal((await state(p)).slots.filter(Boolean).length, I.size, 'Selecting a player must not place it');
  assert.equal(await p.locator(`[data-slot="${slot}"]`).getAttribute('class').then(x => x.includes('preview')), true);
  await click(p, `[data-slot="${slot}"]`);
  assert.equal((await state(p)).slots[slot].p, c.p);
}
async function draft(p, partial = false) {
  const s = await state(p), m = G.managers.find(m => m.nm === s.manager.nm), formation = G.formations[s.manager.f];
  const S = (Array.isArray(formation) ? formation : formation.slots).map(c => Array.isArray(c) ? c[0] : c.s);
  for (let n = s.spin; n < 5; n++) {
    if (!(await state(p)).combo) await click(p, '#squad-spin');
    const q = await state(p);
    assert.equal(await p.locator('.player-row').count(), G.cards[q.combo].length, 'Roster must show all archive cards');
    assert.equal(q.slots.filter(Boolean).length, n * 3, 'Spinning must never choose players');
    for (let j = 0; j < 3; j++) {
      const i = n * 3 + j; await pick(p, i, S[i] || 'GK');
      if (partial && n === 0 && j === 0) return;
    }
  }
  const t = await state(p); assert.equal(t.phase, 'review'); assert.equal(t.slots.filter(Boolean).length, 15);
  assert.equal(new Set(t.slots.filter(Boolean).map(c => c.p)).size, 15);
}

async function run() {
  let desktop, mobile;
  try {
    desktop = await open('desktop', { width: 1440, height: 1000 }); const p = desktop.p;
    await width(p); await p.screenshot({ path: path.join(out, 'v2-desktop-start.png'), fullPage: true });
    await p.locator('#seed').fill('-1'); await p.locator('#start-form button').click();
    assert.equal(await p.locator('#notice').isVisible(), true); assert.match(await p.locator('#notice').textContent(), /whole seed/);
    assert.equal(await state(p), null); note('Invalid seed stays on setup with a visible error');
    await begin(p, 1980, 20261006);
    await click(p, '#manager-reroll'); await click(p, '#manager-reroll');
    assert.equal(await p.locator('#manager-reroll').isDisabled(), true); await width(p);
    await p.screenshot({ path: path.join(out, 'v2-desktop-managers.png'), fullPage: true });
    await click(p, '[data-manager="2"]'); assert.equal((await state(p)).slots.filter(Boolean).length, 0);
    note('Five manager choices, exactly two re-spins, and no automatic player choices');
    await click(p, '#squad-spin'); const before = await state(p);
    await click(p, '#squad-reroll'); const after = await state(p);
    assert.notEqual(after.combo, before.combo); assert.equal(after.squadReroll, 1); assert.equal(await p.locator('#squad-reroll').isDisabled(), true);
    const nm = G.people[G.cards[after.combo][0].p].nm;
    await p.locator('#roster-search').fill(nm); assert.ok(await p.locator('.player-row').count() >= 1);
    await p.locator('#roster-search').fill(''); await p.locator('#roster-sort').selectOption('name');
    const names = await p.locator('.player-name').allTextContents(); assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b)));
    await p.locator('#roster-sort').selectOption('rating');
    note('Complete available roster, search, sort, and the single pre-pick squad retry');
    await pick(p, 0, 'GK'); const retained = await state(p); await p.reload(); await settle(p); assert.deepEqual(await state(p), retained);
    assert.equal(await p.locator('#squad-reroll').isDisabled(), true); note('A manually placed player and draft counters survive reload');
    // Complete the already-started first spin without altering state.
    const f = G.formations[retained.manager.f], slots = (Array.isArray(f) ? f : f.slots).map(s => Array.isArray(s) ? s[0] : s.s);
    await pick(p, 1, slots[1]); await pick(p, 2, slots[2]); await draft(p);
    const t = await state(p), a = t.slots[0].p, b = t.slots[11].p;
    await click(p, '[data-slot="0"]'); await click(p, '[data-slot="11"]');
    assert.equal((await state(p)).slots[0].p, b); assert.equal((await state(p)).slots[11].p, a);
    await click(p, '[data-slot="0"]'); await click(p, '[data-slot="11"]');
    assert.equal((await state(p)).slots[0].p, a); await width(p);
    await p.screenshot({ path: path.join(out, 'v2-desktop-lineup.png'), fullPage: true });
    note('Fifteen manual placements across five squads; any pitch/bench pair can swap');
    await click(p, '#simulate'); await p.waitForSelector('.result-hero');
    assert.equal((await state(p)).phase, 'results'); assert.equal(await p.locator('#result-panel tbody tr').count(), 20);
    assert.ok((await p.locator('.your-row').textContent()).includes('38'));
    await width(p); await p.screenshot({ path: path.join(out, 'v2-desktop-results.png'), fullPage: true });
    await click(p, '[data-tab="fixtures"]'); assert.equal(await p.locator('.fixture').count(), 38);
    await click(p, '[data-tab="cup"]'); assert.equal(await p.locator('.cup-tie').count(), 15);
    await click(p, '[data-tab="stats"]'); assert.ok(await p.locator('#result-panel tbody tr').count() > 100);
    note('Actual engine season displays all twenty clubs, thirty-eight user fixtures, Cup bracket and event statistics');
    await click(p, '[data-tab="challenges"]'); await click(p, '#gauntlet-start'); await click(p, '#gauntlet-attempt');
    assert.equal(await p.locator('.mode-event').count(), 1); const g = await state(p); assert.equal(g.mode.ga, 1);
    await p.locator('#circuit-events').selectOption('10'); await click(p, '#circuit-start');
    assert.equal((await state(p)).mode.ci, 10); assert.equal(await p.locator('.mode-event').count(), 11);
    await width(p); await p.screenshot({ path: path.join(out, 'v2-desktop-modes.png'), fullPage: true });
    await p.reload(); await settle(p); await click(p, '[data-tab="challenges"]'); assert.equal(await p.locator('.mode-event').count(), 11);
    note('Gauntlet attempt and ten-event circuit run through the engine and survive reload');
    const dp = p.waitForEvent('download'); await click(p, '#download'); const d = await dp;
    const file = path.join(out, 'v2-replay.json'); await d.saveAs(file);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).draft.slots.length, 15);
    const cp = p.waitForEvent('download'); await click(p, '#result-card'); const cd = await cp;
    const png = path.join(out, 'v2-result.png'); await cd.saveAs(png);
    assert.equal(fs.readFileSync(png).subarray(1, 4).toString('ascii'), 'PNG');
    await click(p, '#replay'); assert.equal((await state(p)).seed, 20261006); assert.equal((await state(p)).phase, 'manager');
    note('Replay download preserves choices and replay control starts the identical seed');

    mobile = await open('mobile', { width: 390, height: 844 }); const q = mobile.p;
    await width(q); await q.screenshot({ path: path.join(out, 'v2-mobile-start.png'), fullPage: true });
    await begin(q, 1950, 77); await click(q, '[data-manager="0"]'); await click(q, '#squad-spin');
    await width(q); await q.screenshot({ path: path.join(out, 'v2-mobile-roster.png'), fullPage: true });
    await draft(q); await width(q); await click(q, '#simulate'); await width(q);
    await q.screenshot({ path: path.join(out, 'v2-mobile-results.png'), fullPage: true });
    for (const t of ['fixtures', 'cup', 'stats', 'lineup', 'challenges']) { await click(q, `[data-tab="${t}"]`); await width(q); }
    note('A second full draft and actual season work at 390px without horizontal overflow');
    await click(q, '#reset-open'); await click(q, '#reset-confirm');
    await q.locator('#import-replay').setInputFiles(file); await q.waitForSelector('.result-hero');
    assert.equal((await state(q)).seed, 20261006); note('Downloaded replay restores the final squad through the visible import control');
    await q.evaluate(() => localStorage.setItem('football-era-lab-v2', JSON.stringify({ v: 2, phase: 'results', seed: 5 })));
    await q.reload(); await settle(q); assert.equal(await q.locator('#start-form').isVisible(), true);
    assert.match(await q.locator('#notice').textContent(), /could not be resumed/); note('Corrupt localStorage is rejected with a recoverable new-draft screen');
    for (const D of [1960, 1970, 1990, 2000, 2010, 2020]) {
      if (await q.locator('#reset-open').isVisible()) { await click(q, '#reset-open'); await click(q, '#reset-confirm'); }
      await begin(q, D, D + 100); await click(q, '[data-manager="0"]'); await draft(q); await click(q, '#simulate');
      assert.equal((await state(q)).D, D); assert.equal(await q.locator('#result-panel tbody tr').count(), 20);
      await click(q, '[data-tab="fixtures"]'); assert.equal(await q.locator('.fixture').count(), 38); await width(q);
      note(`${D}s complete draft and real-opponent season render through browser controls`);
    }
    assert.deepEqual(errors, []); note('No browser JavaScript or console errors');
    fs.writeFileSync(path.join(out, 'v2-acceptance.json'), JSON.stringify({ passed: true, checks: log, errors }, null, 2));
  } finally { await desktop?.ctx.close(); await mobile?.ctx.close(); }
}
run().catch(e => { process.stderr.write(e.stack + '\n'); fs.writeFileSync(path.join(out, 'v2-acceptance.json'), JSON.stringify({ passed: false, checks: log, errors, failure: e.stack }, null, 2)); process.exitCode = 1; });
