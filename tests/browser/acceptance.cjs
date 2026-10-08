/* Browser acceptance: every control a player uses, on desktop and mobile, through a real browser.
   node tests/browser/acceptance.cjs --output <folder> [--url http://127.0.0.1:8765/] [--playwright <path>] [--channel msedge]
   Serve the repository root first (python -m http.server 8765). Writes acceptance.json and screenshots. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const arg = k => { const i = process.argv.indexOf(k); return i < 0 ? undefined : process.argv[i + 1]; };
const { chromium } = require(arg('--playwright') || 'playwright');
const out = arg('--output');
if (!out) throw new Error('Pass --output pointing to a folder for screenshots and the report.');
fs.mkdirSync(out, { recursive: true });
const base = arg('--url') || 'http://127.0.0.1:8765/';
const raw = fs.readFileSync(path.resolve(__dirname, '../../data/game.json'));
const G = JSON.parse(raw);
const KEY = 'football-era-lab-v2', checks = [], errors = [];
const ok = n => { checks.push(n); process.stdout.write(`ok  ${n}\n`); };
const st = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const settle = p => p.waitForFunction(() => document.body.getAttribute('aria-busy') !== 'true' && !document.querySelector('.loading'));
const wide = async (p, n) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${n}: page wider than the viewport`);

async function page(kind) {
  const b = await chromium.launch({ headless: true, channel: arg('--channel'), downloadsPath: path.join(out, 'downloads') });
  const ctx = await b.newContext({ viewport: kind === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${kind}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`${kind}: ${m.text()}`); });
  p.on('response', r => { if (r.status() >= 400) errors.push(`${kind}: HTTP ${r.status()} ${r.url()}`); });
  await p.goto(base); await settle(p); await p.evaluate(() => localStorage.clear()); await p.reload(); await settle(p);
  await p.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 2 })), KEY);
  await p.reload(); await settle(p);
  assert.equal(await p.locator('#start-form').count(), 1);
  assert.match(await p.locator('#notice').innerText(), /could not be resumed/i);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await settle(p);
  assert.equal(await p.locator('#draft-cap').isChecked(), true);
  await p.check('#draft-classic'); await p.click('[data-era="1990"]');
  assert.equal(await p.locator('#draft-classic').isChecked(), true, 'changing era must keep the rules choice');
  await p.check('#draft-cap');
  ok(`${kind}: Salary cap is the default and the rules choice survives an era change`);
  ok(`${kind}: a corrupt save explains the failure and allows a fresh draft`);
  return { b, p };
}

async function pick(p, prefer) {
  const s = await st(p), I = new Set(s.slots.filter(Boolean).map(c => c.p));
  const legal = await p.evaluate(async key => {
    const { can } = await import(new URL('./app/draft.js', location.href));
    const g = await (await fetch(new URL('./data/game.json', location.href))).json();
    const state = JSON.parse(localStorage.getItem(key));
    return g.cards[state.combo].filter(c => can(g, state, c.p)).map(c => c.p);
  }, KEY);
  const S = G.formations[s.manager.f].slots.map(x => x[0]);
  const open = s.slots.map((c, i) => (c ? null : i)).filter(i => i !== null);
  const pool = G.cards[s.combo].filter(c => legal.includes(c.p)).sort((a, b) => b.r - a.r);
  assert.ok(pool.length, 'the revealed club must offer a legal pick');
  let c = null, i = null;
  for (const x of pool) { const j = open.find(j => j < 11 && x.pos.includes(S[j])); if (j !== undefined) { c = x; i = j; break; } }
  if (!c) { c = pool[0]; i = open.find(j => j >= 11) ?? open[0]; }
  if (prefer !== undefined && open.includes(prefer)) i = prefer;
  await p.click(`[data-player="${c.p}"]`);
  assert.equal((await st(p)).slots.filter(Boolean).length, I.size, 'selecting must not place');
  assert.match(await p.locator('#lineup-instruction').innerText(), /base.*links/);
  if (i < 11) assert.match(await p.locator(`[data-slot="${i}"]`).getAttribute('aria-label'), /links.*Squad overall/);
  await p.click(`[data-slot="${i}"]`); await settle(p);
  assert.equal((await st(p)).slots[i].p, c.p);
}

async function stageRun(p, target) {
  const a = await p.evaluate(async ({ key, target }) => {
    const R = await import(new URL('./app/run.js', location.href)), D = await import(new URL('./app/draft.js', location.href));
    const { fields } = await import(new URL('./app/data.js', location.href));
    const g = await (await fetch(new URL('./data/game.json', location.href))).json(), F = fields(g), draft = JSON.parse(localStorage.getItem(key));
    for (let seed = 1; seed <= 100; seed++) {
      let s = { ...R.runNew(seed, draft), pat: 20 };
      if (target === 'hop') {
        for (let rd = 0; rd < 4; rd++) {
          s = R.runRound(g, F, s);
          const O = R.offers(g, F, s), rest = O.findIndex(o => o.kind === 'rest');
          const j = rest >= 0 ? rest : O.findIndex(o => o.kind === 'dev' && o.id !== 'upg' && s.pat > o.cost);
          if (j < 0) break;
          s = R.take(g, F, s, j);
        }
        if (s.ph !== 'boss') continue;
        s = R.runPlayBoss(g, F, s);
        if (s.ph !== 'hop') continue;
      } else {
        s = R.runRound(g, F, s);
        if (!R.offers(g, F, s).some(o => target === 'upg' ? o.id === 'upg' && o.list.some(u => u.cost < s.pat) : o.kind === 'market')) continue;
      }
      localStorage.setItem(key, JSON.stringify(D.valid(g, { ...draft, mode: { run: s } })));
      return s;
    }
    throw new Error(`No real ${target} fixture found.`);
  }, { key: KEY, target });
  await p.reload(); await settle(p); await p.click('[data-tab="gauntlet"]'); await settle(p);
  return a;
}

async function runControls(p, kind) {
  let s = await stageRun(p, 'market');
  await p.click('[data-respin="scout"]'); await settle(p);
  s = (await st(p)).mode.run;
  assert.equal(s.fa, 1); assert.equal(await p.locator('[data-respin]').count(), 0);
  const f = await p.evaluate(async key => {
    const R = await import('./app/run.js'), { fits } = await import('./app/cap.js');
    const g = await (await fetch('./data/game.json')).json(), s = JSON.parse(localStorage.getItem(key)).mode.run, O = R.offers(g, {}, s);
    const j = O.findIndex(o => o.kind === 'market');
    for (let pick = 0; pick < O[j].list.length; pick++) for (let slot = 0; slot < 15; slot++) {
      const f = O[j].list[pick];
      if (s.pat > R.price(g, s, f, slot) && fits(g, R.bill(g, s), slot, f, R.GCAP)) return { j, pick, slot, p: f.p };
    }
    throw new Error('No affordable signing.');
  }, KEY);
  await p.selectOption(`#fa-pick-${f.j}`, String(f.pick)); await p.selectOption(`#fa-slot-${f.j}`, String(f.slot));
  assert.match(await p.locator(`#fa-price-${f.j}`).innerText(), /Costs.*patience/);
  await p.click(`[data-take="${f.j}"]`); await settle(p);
  assert.equal((await st(p)).mode.run.slots[f.slot].p, f.p);
  ok(`${kind}: scouting changes the market once and a quoted signing replaces the selected player`);
  s = await stageRun(p, 'upg');
  const up = await p.evaluate(async key => {
    const R = await import('./app/run.js'), g = await (await fetch('./data/game.json')).json(), s = JSON.parse(localStorage.getItem(key)).mode.run;
    const O = R.offers(g, {}, s), j = O.findIndex(o => o.id === 'upg'), pick = O[j].list.findIndex(u => u.cost < s.pat);
    return { j, pick, ...O[j].list[pick] };
  }, KEY);
  await p.selectOption(`#up-pick-${up.j}`, String(up.pick)); await p.click(`[data-take="${up.j}"]`); await settle(p);
  s = (await st(p)).mode.run;
  assert.equal(s.slots[up.i].k, up.to.k); assert.equal(s.up[up.to.p], up.from.k);
  ok(`${kind}: a selected prime upgrade changes the card and preserves its original cap charge`);
  s = await stageRun(p, 'hop');
  assert.equal(await p.locator('[data-hop-pick]').count(), 10);
  await p.click('#run-hop'); await settle(p);
  assert.equal((await st(p)).mode.run.ph, 'hop', 'incomplete transfers must preserve the run');
  const h = await p.evaluate(async key => {
    const R = await import('./app/run.js'), { ct, TI } = await import('./app/cap.js'), { hydrate } = await import('./app/draft.js');
    const g = await (await fetch('./data/game.json')).json(), s = JSON.parse(localStorage.getItem(key)).mode.run, H = R.hopPools(g, s);
    const low = L => L.map((f, i) => i).sort((i, j) => L[i].r - L[j].r).slice(0, 2), old = low(H.old), neu = low(H.neu);
    const ins = [...old.map(i => H.old[i]), ...neu.map(i => H.neu[i])], Q = R.bill(g, s), C = ct(g, Q), out = [];
    for (const t of ['S', 'A']) out.push(...Q.map((f, i) => i).filter(i => TI(hydrate(g, Q[i]).r) === t).slice(0, Math.max(0, C[t] + ins.filter(f => TI(f.r) === t).length - R.GCAP[t])));
    out.push(...Q.map((f, i) => i).filter(i => !out.includes(i)).slice(0, 4 - out.length));
    return { old, neu, out, people: ins.map(f => f.p) };
  }, KEY);
  let n = 0;
  for (const k of ['old', 'neu']) for (const i of h[k]) {
    await p.check(`[data-hop-pick="${k}"][value="${i}"]`); await p.selectOption(`#hop-out-${k}-${i}`, String(h.out[n++]));
  }
  await wide(p, 'transfers'); await p.click('#run-hop'); await settle(p);
  s = (await st(p)).mode.run; assert.equal(s.ph, 'repo');
  assert.deepEqual(h.out.map(i => s.slots[i].p), h.people);
  await p.selectOption('#run-swap-a', '0'); await p.selectOption('#run-swap-b', '11'); await p.click('#run-swap'); await settle(p);
  assert.equal((await st(p)).mode.run.slots[11].p, s.slots[0].p);
  await p.click('#run-next'); await settle(p);
  assert.equal((await st(p)).mode.run.act, 1); assert.equal((await st(p)).mode.run.ph, 'rd');
  await p.reload(); await settle(p); await p.click('[data-tab="gauntlet"]'); await settle(p);
  assert.equal(await p.locator('#run-round').count(), 1);
  ok(`${kind}: four transfers, a lineup swap and the next decade survive a reload`);
}

async function capState(p) {
  const s = await st(p), n = { S: 0, A: 0, B: 0, C: 0, D: 0 }, lim = { S: 2, A: 4, B: 4, C: 3, D: 2 };
  assert.equal(s.cap, true);
  const tier = r => r >= 90 ? 'S' : r >= 85 ? 'A' : r >= 80 ? 'B' : r >= 75 ? 'C' : 'D';
  for (const ref of s.slots.filter(Boolean)) n[tier(G.cards[ref.k].find(c => c.p === ref.p).r)]++;
  for (const t of Object.keys(lim)) {
    assert.ok(n[t] <= lim[t], `${t} tier exceeds its whole-squad limit`);
    assert.equal(await p.locator(`[data-cap-tier="${t}"]`).getAttribute('data-left'), String(lim[t] - n[t]));
  }
  if (s.combo) {
    for (const c of G.cards[s.combo]) {
      const row = p.locator(`[data-player="${c.p}"]`);
      assert.equal(await row.getAttribute('data-tier'), tier(c.r));
      if (n[tier(c.r)] === lim[tier(c.r)]) {
        assert.equal(await row.isDisabled(), true, 'a full tier must block every card in it');
        assert.match(await row.innerText(), /places full|Already in your squad/);
      }
    }
  }
  return n;
}

async function full(kind) {
  const { b, p } = await page(kind);
  try {
    await p.fill('#seed', '-1'); await p.click('#start-form button');
    assert.equal(await p.locator('#start-form').count(), 1); assert.match(await p.locator('#notice').innerText(), /seed/i);
    ok(`${kind}: an invalid seed keeps the start screen and explains why`);
    await p.click('[data-era="1990"]'); await p.fill('#seed', '424242'); await p.click('#start-form button'); await settle(p);
    assert.equal(await p.locator('[data-manager]').count(), 5);
    await p.click('#manager-reroll'); await settle(p); await p.click('#manager-reroll'); await settle(p);
    assert.equal(await p.locator('#manager-reroll').isDisabled(), true);
    ok(`${kind}: five manager options and exactly two re-spins`);
    await p.click('[data-manager="2"]'); await settle(p);
    await p.click('#squad-spin'); await settle(p);
    await capState(p);
    let s = await st(p);
    assert.equal(await p.locator('.player-row').count(), G.cards[s.combo].length);
    await p.fill('#roster-search', 'zzzz-no-such-player'); assert.equal(await p.locator('.player-row').count(), 0);
    await p.fill('#roster-search', ''); await p.selectOption('#roster-sort', 'name');
    await p.click('#squad-reroll'); await settle(p);
    assert.notEqual((await st(p)).combo, s.combo); assert.equal(await p.locator('#squad-reroll').isDisabled(), true);
    ok(`${kind}: the whole squad is listed, searchable and sortable, with one re-spin`);
    await pick(p);
    await p.reload(); await settle(p);
    s = await st(p); assert.equal(s.slots.filter(Boolean).length, 1); await capState(p);
    ok(`${kind}: a placed player and the whole-squad cap survive a reload`);
    let blocked = false;
    for (let n = 0; n < 5; n++) {
      if (!(await st(p)).combo) { await p.click('#squad-spin'); await settle(p); }
      while ((await st(p)).picked < 3 && (await st(p)).phase === 'draft' && (await st(p)).combo) {
        await capState(p);
        blocked ||= await p.locator('.player-row--blocked:not([title="Already in your squad"])').count() > 0;
        await pick(p);
      }
    }
    s = await st(p); assert.equal(s.phase, 'review'); assert.equal(new Set(s.slots.map(c => c.p)).size, 15);
    assert.deepEqual(await capState(p), { S: 2, A: 4, B: 4, C: 3, D: 2 });
    assert.equal(blocked, true, 'a capped draft must explain blocked cards while keeping them visible');
    assert.equal(new Set(s.history.map(k => k.split(':')[0])).size, 5);
    ok(`${kind}: all fifteen obey 2 S, 4 A, 4 B, 3 C and 2 D, with five distinct clubs and visible blocked cards`);
    const a = s.slots[0].p, z = s.slots[12].p;
    await p.click('[data-slot="0"]'); await p.click('[data-slot="12"]'); await settle(p);
    s = await st(p); assert.equal(s.slots[0].p, z); assert.equal(s.slots[12].p, a);
    await p.click('[data-slot="0"]'); await p.click('[data-slot="12"]'); await settle(p);
    ok(`${kind}: fifteen placements across five squads, and any two slots swap`);
    await wide(p, 'review'); await p.screenshot({ path: path.join(out, `${kind}-review.png`), fullPage: true });
    await p.click('#simulate'); await p.waitForSelector('.result-hero'); await settle(p);
    assert.equal(await p.locator('tbody tr').count(), 20);
    await p.click('[data-tab="fixtures"]'); await settle(p); assert.equal(await p.locator('.fixture').count(), 38);
    await p.click('[data-tab="cup"]'); await settle(p); assert.ok(await p.locator('.cup-tie').count() >= 15);
    await p.click('[data-tab="stats"]'); await settle(p); await p.click('[data-tab="lineup"]'); await settle(p);
    ok(`${kind}: the season shows 20 clubs, 38 fixtures and the Cup`);
    const replay = path.join(out, `${kind}-replay.json`);
    const [download] = await Promise.all([p.waitForEvent('download'), p.click('#download')]);
    await download.saveAs(replay);
    const saved = JSON.parse(fs.readFileSync(replay, 'utf8'));
    assert.equal(saved.game, 'Football Era Lab'); assert.equal(saved.draft.seed, 424242); assert.equal(saved.draft.cap, true);
    assert.match(saved.result, /Salary cap/); assert.match(saved.result, /cap=1/);
    assert.deepEqual(saved.draft.slots, (await st(p)).slots);
    const [card] = await Promise.all([p.waitForEvent('download'), p.click('#result-card')]);
    const png = path.join(out, `${kind}-result-card.png`); await card.saveAs(png);
    assert.deepEqual([...fs.readFileSync(png).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    ok(`${kind}: replay and result image downloads contain the completed team`);
    await wide(p, 'results'); await p.screenshot({ path: path.join(out, `${kind}-results.png`), fullPage: true });
    await p.click('[data-tab="gauntlet"]'); await settle(p);
    assert.equal(await p.locator('#run-map option').count(), 4);
    await p.selectOption('#run-map', 'original'); await p.click('#run-start'); await settle(p);
    assert.equal((await st(p)).mode.run.map, 'original');
    assert.equal(await p.locator('#run-round').count(), 1);
    for (let k = 0; k < 9; k++) {
      const r = (await st(p)).mode.run;
      if (r.ph === 'rd') await p.click('#run-round');
      else if (r.ph === 'node') {
        const rest = p.locator('[data-rest]');
        if (await rest.count()) await rest.click();
        else await p.locator('[data-take]:not([disabled])').first().click();
      }
      else if (r.ph === 'boss') await p.click('#run-boss');
      else break;
      await settle(p);
    }
    const r = (await st(p)).mode.run;
    assert.equal(r.cap, true); assert.equal(await p.locator('.run [data-cap-tier]').count(), 5);
    assert.ok(r.log.some(e => e.t === 'seg') && r.log.some(e => e.t === 'boss'), 'the run must reach a boss');
    await p.reload(); await settle(p); await p.click('[data-tab="gauntlet"]'); await settle(p);
    assert.deepEqual((await st(p)).mode.run.log.length, r.log.length);
    ok(`${kind}: a selected Gauntlet map plays four rounds, rewards and a two-legged boss, and survives a reload`);
    await wide(p, 'gauntlet'); await p.screenshot({ path: path.join(out, `${kind}-gauntlet.png`), fullPage: true });
    await runControls(p, kind);
    await p.click('[data-tab="more"]'); await settle(p);
    await p.selectOption('#circuit-events', '10'); await p.click('#circuit-start'); await settle(p);
    assert.equal(await p.locator('#circuit-events').inputValue(), '10'); assert.ok(await p.locator('.mode-event').count() >= 10);
    assert.equal(await p.locator('[aria-label="Circuit awards"] .stat-card').count(), 4);
    assert.match(await p.locator('[aria-label="Circuit awards"]').innerText(), /Circuit top scorer/i);
    ok(`${kind}: circuit completion shows scorer, assist, keeper and player awards`);
    const c = await p.locator('#my-code').inputValue();
    const classic = JSON.parse(Buffer.from(c, 'base64url').toString()); classic.cap = false;
    await p.fill('#their-code', Buffer.from(JSON.stringify(classic)).toString('base64url')); await p.click('#h2h-play'); await settle(p);
    assert.equal(await p.locator('.cup-tie--yours').count(), 0);
    assert.match(await p.locator('#notice').innerText(), /matching Salary cap team code/i);
    ok(`${kind}: head to head rejects a Classic code against a capped team and explains the matching rules`);
    await p.fill('#their-code', c); await p.click('#h2h-play'); await settle(p);
    assert.equal(await p.locator('.cup-tie--yours').count(), 1);
    ok(`${kind}: the circuit runs ten events and a team code plays head to head`);
    await wide(p, 'more modes');
    await p.click('#replay'); await settle(p);
    assert.equal((await st(p)).cap, true); assert.equal((await st(p)).seed, 424242);
    ok(`${kind}: replaying a seed preserves Salary cap rules`);
    await p.click('#reset-open'); await p.click('#reset-confirm'); await settle(p);
    await p.setInputFiles('#import-replay', { name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"game":"other"}') });
    assert.equal(await p.locator('#start-form').count(), 1);
    await p.waitForFunction(() => document.querySelector('#notice').textContent.includes('could not be restored'));
    const broken = { ...saved, draft: { ...saved.draft, mode: { run: { ...r, m: null } } } };
    await p.setInputFiles('#import-replay', { name: 'broken-gauntlet.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(broken)) });
    await p.waitForFunction(() => document.querySelector('#notice').textContent.includes('saved Gauntlet'));
    assert.equal(await st(p), null, 'a rejected Gauntlet replay must not replace browser storage');
    await p.reload(); await settle(p);
    assert.equal(await p.locator('#start-form').count(), 1);
    ok(`${kind}: a malformed Gauntlet replay is rejected without changing the browser save`);
    await p.setInputFiles('#import-replay', replay); await p.waitForSelector('.result-hero'); await settle(p);
    assert.deepEqual((await st(p)).slots, saved.draft.slots);
    assert.equal((await st(p)).phase, 'results');
    assert.equal((await st(p)).cap, true);
    ok(`${kind}: invalid replays are rejected and a downloaded replay restores exact placements`);
    await p.click('#reset-open'); await p.click('#reset-confirm'); await settle(p);
    await p.goto(`${base}?seed=77&era=2000&cap=0`); await settle(p);
    assert.equal(await p.locator('#draft-classic').isChecked(), true);
    assert.equal(await p.locator('#seed').inputValue(), '77');
    await p.click('#start-form button'); await settle(p);
    assert.equal((await st(p)).cap, false);
    await p.click('#reset-open'); await p.click('#reset-confirm'); await settle(p);
    ok(`${kind}: a Classic replay link selects and starts its original rules`);
    await p.click('#weekly'); await settle(p);
    s = await st(p); assert.match(s.wk, /^\d{4}-W\d{2}$/); assert.equal(await p.locator('[data-manager]').count(), 5); assert.equal(s.cap, true);
    ok(`${kind}: the weekly challenge starts a shared-seed Salary cap draft even after choosing Classic`);
  } finally { await b.close(); }
}

(async () => {
  let failure = null;
  try { await full('desktop'); await full('mobile'); assert.deepEqual(errors, [], 'console or page errors'); }
  catch (e) { failure = String(e.stack || e); }
  const rep = { passed: !failure && !errors.length, url: base, data_build: G.meta.v,
    data_sha256: createHash('sha256').update(raw).digest('hex'), checks, errors, failure };
  fs.writeFileSync(path.join(out, 'acceptance.json'), JSON.stringify(rep, null, 2));
  process.stdout.write(`${rep.passed ? 'PASSED' : 'FAILED'} (${checks.length} checks)\n`);
  if (!rep.passed) { process.stdout.write(`${failure || ''}\n${errors.join('\n')}\n`); process.exit(1); }
})();
