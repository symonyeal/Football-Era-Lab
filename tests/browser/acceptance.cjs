/* Browser acceptance: every control a player uses, on desktop, tablet and phone, through a real browser.
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
const runtime = path.join(path.resolve(out), 'runtime'); fs.mkdirSync(runtime, { recursive: true });
process.env.TEMP = process.env.TMP = runtime;
const base = arg('--url') || 'http://127.0.0.1:8765/';
const raw = fs.readFileSync(path.resolve(__dirname, '../../data/game.json'));
const G = JSON.parse(raw);
const KEY = 'football-era-lab-v2', checks = [], errors = [];
const VP = { desktop: { width: 1440, height: 900 }, tablet: { width: 768, height: 1024 }, mobile: { width: 390, height: 844 } };
const ok = n => { checks.push(n); process.stdout.write(`ok  ${n}\n`); };
const st = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const settle = p => p.waitForFunction(() => document.body.getAttribute('aria-busy') !== 'true' && !document.querySelector('.loading'));
// A sound screen: no horizontal scroll and no repeated element id.
const sound = async (p, n) => {
  const layout = await p.evaluate(() => {
    const width = document.documentElement.clientWidth, scrollWidth = document.documentElement.scrollWidth;
    const nodes = scrollWidth > width ? [...document.querySelectorAll('body *')].flatMap(e => {
      const r = e.getBoundingClientRect();
      return r.width && r.right > width + 1 ? [{ tag: e.tagName, id: e.id, class: String(e.className), right: r.right }] : [];
    }) : [];
    return { width, scrollWidth, nodes };
  });
  assert.equal(layout.scrollWidth <= layout.width, true, `${n}: page wider than the viewport: ${JSON.stringify(layout)}`);
  assert.equal(await p.evaluate(() => { const I = [...document.querySelectorAll('[id]')].map(e => e.id); return I.length === new Set(I).size; }), true, `${n}: repeated element id`);
};
const inView = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].every(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1; }), sel);
const view = async (p, kind, v) => { if (kind === 'mobile') { await p.click(`.seg2 [data-view="${v}"]`); await settle(p); } };

async function page(kind, o = {}) {
  const b = await chromium.launch({ headless: true, channel: arg('--channel'), downloadsPath: path.join(out, 'downloads') });
  const ctx = await b.newContext({ viewport: VP[kind], acceptDownloads: true, hasTouch: kind !== 'desktop', ...o });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${kind}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`${kind}: ${m.text()}`); });
  p.on('response', r => { if (r.status() >= 400) errors.push(`${kind}: HTTP ${r.status()} ${r.url()}`); });
  await p.goto(base); await settle(p); await p.evaluate(() => localStorage.clear()); await p.reload(); await settle(p);
  return { b, p };
}

async function legal(p) {
  return p.evaluate(async key => {
    const { can } = await import(new URL('./app/draft.js', location.href));
    const g = await (await fetch(new URL('./data/game.json', location.href))).json(), s = JSON.parse(localStorage.getItem(key));
    return g.cards[s.combo].filter(c => can(g, s, c.p)).map(c => c.p);
  }, KEY);
}

// One pick: the best legal card for an open place in his listed position, else a bench place.
async function pick(p, kind) {
  const s = await st(p), I = new Set(s.slots.filter(Boolean).map(c => c.p)), L = await legal(p);
  const S = G.formations[s.f].slots.map(x => x[0]), open = s.slots.map((c, i) => (c ? null : i)).filter(i => i !== null);
  const pool = G.cards[s.combo].filter(c => L.includes(c.p)).sort((a, b) => b.r - a.r);
  assert.ok(pool.length, 'the revealed club must offer a legal pick');
  let c = null, i = null;
  for (const x of pool) { const j = open.find(j => j < 11 && x.pos.includes(S[j])); if (j !== undefined) { c = x; i = j; break; } }
  if (!c) { c = pool[0]; i = open.find(j => j >= 11) ?? open[0]; }
  await p.click(`[data-player="${c.p}"]`); await settle(p);
  assert.equal((await st(p)).slots.filter(Boolean).length, I.size, 'selecting must not place');
  assert.equal(await p.locator(`[data-player="${c.p}"]`).getAttribute('aria-pressed'), 'true');
  if (kind === 'mobile') {
    assert.equal(await p.locator('#sheet').isVisible(), true, 'a selection opens the placement sheet');
    await p.click(`#sheet [data-target="${i}"]`); await settle(p);
    assert.equal(await inView(p, '#sheet [data-target], #place-confirm'), true, 'every place and the confirm button fit the phone screen');
    assert.match(await p.locator('#place-confirm').innerText(), /Place at/);
    await p.click('#place-confirm');
  } else {
    assert.match(await p.locator('#lineup-instruction').innerText(), /base.*links/);
    if (i < 11) assert.match(await p.locator(`[data-slot="${i}"]`).getAttribute('aria-label'), /links.*Squad overall/);
    await p.click(`[data-slot="${i}"]`);
  }
  await settle(p);
  assert.equal((await st(p)).slots[i].p, c.p);
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
        assert.equal(await row.getAttribute('aria-disabled'), 'true', 'a full tier must block every card in it');
        assert.match(await row.textContent(), /places full|In squad/);
        assert.equal(await row.evaluate(e => e.tagName === 'BUTTON' && !e.disabled), true, 'a blocked card stays focusable so its reason can be read');
      }
    }
  }
  return n;
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
      const { restore } = await import('./app/save.js');
      localStorage.setItem(key, JSON.stringify(restore(g, { ...draft, mode: { ...draft.mode, run: s } })));
      return s;
    }
    throw new Error(`No real ${target} fixture found.`);
  }, { key: KEY, target });
  await p.reload(); await settle(p); await p.click('[data-tab="more"]'); await settle(p);
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
  await sound(p, 'transfers'); await p.click('#run-hop'); await settle(p);
  s = (await st(p)).mode.run; assert.equal(s.ph, 'repo');
  assert.deepEqual(h.out.map(i => s.slots[i].p), h.people);
  const f0 = s.f, f1 = f0 === '3-5-2' ? '4-4-2' : '3-5-2';
  await p.selectOption('#run-form', f1); await p.click('#run-form-apply'); await settle(p);
  const t = (await st(p)).mode.run;
  assert.equal(t.f, f1); assert.deepEqual(t.slots.slice(11), s.slots.slice(11), 'a formation change keeps the bench');
  assert.deepEqual(t.slots.map(c => c.p).sort(), s.slots.map(c => c.p).sort(), 'a formation change keeps every card');
  ok(`${kind}: between decades the Gauntlet changes formation and keeps every card and the bench`);
  await p.selectOption('#run-swap-a', '0'); await p.selectOption('#run-swap-b', '11'); await p.click('#run-swap'); await settle(p);
  assert.equal((await st(p)).mode.run.slots[11].p, t.slots[0].p);
  await p.click('#run-next'); await settle(p);
  assert.equal((await st(p)).mode.run.act, 1); assert.equal((await st(p)).mode.run.ph, 'rd'); assert.equal((await st(p)).mode.run.f, f1);
  await p.reload(); await settle(p); await p.click('[data-tab="more"]'); await settle(p);
  assert.equal(await p.locator('#run-round').count(), 1);
  ok(`${kind}: four transfers, a lineup swap and the next decade survive a reload`);
}

// A formation change after pick 1 of a batch: preview, apply, undo, redo, finish the batch, reload.
async function formChange(p, kind) {
  const s0 = await st(p);
  assert.equal(s0.picked, 1);
  await view(p, kind, 'lineup');
  const f1 = s0.f === '3-5-2' ? '4-4-2' : '3-5-2';
  await p.selectOption('#form-pick', f1); await settle(p);
  assert.equal(await p.locator('#form-status').count(), 1, 'choosing a formation previews it');
  assert.equal((await st(p)).f, s0.f, 'a preview changes nothing');
  await p.click('#form-apply'); await settle(p);
  const s1 = await st(p);
  assert.equal(s1.f, f1);
  for (const k of ['picked', 'combo', 'spin', 'history', 'squadReroll', 'seed']) assert.deepEqual(s1[k], s0[k], k);
  assert.deepEqual(s1.slots.slice(11), s0.slots.slice(11));
  assert.deepEqual(s1.slots.filter(Boolean).map(c => c.p).sort(), s0.slots.filter(Boolean).map(c => c.p).sort());
  await p.click('#undo'); await settle(p);
  const s3 = await st(p);
  for (const k of ['f', 'slots', 'picked', 'combo', 'spin', 'history', 'squadReroll', 'seed', 'manager']) assert.deepEqual(s3[k], s0[k], `undo restores ${k} exactly`);
  await p.click('#redo'); await settle(p);
  assert.equal((await st(p)).f, f1);
  await view(p, kind, 'squad');
  while ((await st(p)).picked) await pick(p, kind);
  const s2 = await st(p);
  await p.reload(); await settle(p);
  assert.deepEqual(await st(p), s2);
  assert.equal(await p.locator('#undo').isDisabled(), true, 'a pick ends the lineup undo history');
  ok(`${kind}: a formation change mid-batch keeps picks, bench and counters, undoes exactly and survives a reload`);
}

async function full(kind) {
  const { b, p } = await page(kind);
  try {
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
    await p.fill('#seed', '-1'); await p.click('#start-form button[type=submit]');
    assert.equal(await p.locator('#start-form').count(), 1); assert.match(await p.locator('#notice').innerText(), /seed/i);
    ok(`${kind}: an invalid seed keeps the start screen and explains why`);
    await p.click('[data-era="1990"]'); await p.fill('#seed', '424242'); await p.click('#start-form button[type=submit]'); await settle(p);
    assert.equal(await p.locator('[data-manager]').count(), 5);
    const o = await p.evaluate(async key => { const D = await import('./app/draft.js'); const g = await (await fetch('./data/game.json')).json(); return D.opts(g, JSON.parse(localStorage.getItem(key))); }, KEY);
    assert.equal(new Set(o.map(x => x.nm)).size, 5);
    await p.click('#manager-reroll'); await settle(p); await p.click('#manager-reroll'); await settle(p);
    assert.equal(await p.locator('#manager-reroll').isDisabled(), true);
    ok(`${kind}: five manager-club options and exactly two re-spins`);
    await p.click('[data-inspect="2"]'); await settle(p); await sound(p, 'teams');
    const opt = await p.evaluate(async key => { const D = await import('./app/draft.js'); const g = await (await fetch('./data/game.json')).json(); const s = JSON.parse(localStorage.getItem(key)); const o = D.opts(g, s)[2]; return { o, rest: Object.keys(g.formations).filter(f => !g.managers.find(m => m.nm === o.nm).f.includes(f)) }; }, KEY);
    await p.selectOption('#start-formation', opt.rest[0]); await settle(p);
    assert.equal(await p.locator('#start-shape').getAttribute('data-formation'), opt.rest[0]);
    assert.equal(await p.locator('#start-shape .tk').count(), 11, 'selected unrecorded formations redraw every pitch place');
    await p.click('[data-manager="2"]'); await settle(p);
    let s = await st(p);
    assert.deepEqual(s.manager, { nm: opt.o.nm, q: opt.o.q, a: opt.o.a }); assert.equal(s.f, opt.rest[0], 'a team can start in a formation he never recorded');
    ok(`${kind}: the inspected team starts in the chosen formation, recorded or not`);
    await p.click('#squad-spin'); await settle(p);
    await capState(p);
    s = await st(p);
    assert.equal(await p.locator('.player-row').count(), G.cards[s.combo].length);
    await p.fill('#roster-search', 'zzzz-no-such-player'); assert.equal(await p.locator('.player-row').count(), 0);
    await p.fill('#roster-search', ''); await p.selectOption('#roster-sort', 'name');
    await p.click('#squad-reroll'); await settle(p);
    assert.notEqual((await st(p)).combo, s.combo); assert.equal(await p.locator('#squad-reroll').isDisabled(), true);
    ok(`${kind}: the whole squad is listed, searchable and sortable, with one re-spin`);
    if (kind === 'desktop') {
      assert.equal(await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true, 'the draft fits one screen');
      assert.equal(await inView(p, '#roster-list, .lineup [data-slot], [data-cap-tier], .fbar, .cnt'), true, 'roster, every place, cap, formation bar and counters are in view');
      ok(`${kind}: roster, all fifteen places, cap, formation control and counters share one 1440 × 900 screen`);
      const first = p.locator('#roster-list .pr:not([aria-disabled])').first(), fp = await first.getAttribute('data-player');
      await first.focus(); await p.keyboard.press('Enter'); await settle(p);
      assert.notEqual(await p.evaluate(() => document.activeElement.dataset.slot), undefined, 'Enter on a player moves focus to his best place');
      await sound(p, 'selection');
      await p.keyboard.press('Escape'); await settle(p);
      assert.equal(await p.evaluate(() => document.activeElement.dataset.player), fp, 'Escape returns focus to the player');
      await p.keyboard.press('Enter'); await settle(p); await p.keyboard.press('Enter'); await settle(p);
      assert.equal((await st(p)).slots.filter(Boolean).length, 1, 'Enter places the player');
      assert.notEqual(await p.evaluate(() => document.activeElement.tagName), 'BODY', 'focus never falls to the page body');
      ok(`${kind}: the keyboard selects, places and cancels without losing focus`);
    } else { await pick(p, kind); await p.click(`[data-player="${(await legal(p))[0]}"]`); await settle(p); await sound(p, 'sheet'); await p.click('#sheet-close'); await settle(p); }
    await p.reload(); await settle(p);
    s = await st(p); assert.equal(s.slots.filter(Boolean).length, 1); await capState(p);
    ok(`${kind}: a placed player and the whole-squad cap survive a reload`);
    await formChange(p, kind);
    let blocked = false;
    for (let n = 0; n < 5; n++) {
      if (!(await st(p)).combo && (await st(p)).phase === 'draft') { await p.click('#squad-spin'); await settle(p); }
      while ((await st(p)).picked < 3 && (await st(p)).phase === 'draft' && (await st(p)).combo) {
        await capState(p);
        blocked ||= await p.locator('.player-row--blocked').count() > 0;
        await pick(p, kind);
      }
    }
    s = await st(p); assert.equal(s.phase, 'review'); assert.equal(new Set(s.slots.map(c => c.p)).size, 15);
    assert.deepEqual(await capState(p), { S: 2, A: 4, B: 4, C: 3, D: 2 });
    assert.equal(blocked, true, 'a capped draft must explain blocked cards while keeping them visible');
    assert.equal(new Set(s.history.map(k => k.split(':')[0])).size, 5);
    ok(`${kind}: all fifteen obey 2 S, 4 A, 4 B, 3 C and 2 D, with five distinct clubs and visible blocked cards`);
    await view(p, kind, 'lineup');
    const a = s.slots[0].p, z = s.slots[12].p;
    await p.click('[data-slot="0"]'); await p.click('[data-slot="12"]'); await settle(p);
    s = await st(p); assert.equal(s.slots[0].p, z); assert.equal(s.slots[12].p, a);
    await p.click('[data-slot="0"]'); await p.click('[data-slot="12"]'); await settle(p);
    ok(`${kind}: fifteen placements across five squads, and any two places swap`);
    if (kind === 'desktop') assert.equal(await p.locator('.tm').evaluate(e => { const a = e.getBoundingClientRect(); return [...e.children].every(x => { const b = x.getBoundingClientRect(); return b.top >= a.top && b.bottom <= a.bottom; }); }), true, 'the manager name, club spell and grades must not be clipped');
    await sound(p, 'review'); await p.screenshot({ path: path.join(out, `${kind}-review.png`), fullPage: true });
    await view(p, kind, 'squad');
    const f0 = (await st(p)).f;
    await p.click('#simulate'); await p.waitForSelector('.result-hero'); await settle(p);
    const career0 = (await st(p)).mode.career;
    assert.equal(await p.locator('[data-club]').count(), career0.S.ord.length);
    assert.equal(career0.years.length, 10); assert.equal(career0.ph, 'half');
    assert.match(await p.locator('.rh-team').innerText(), /Board objective/);
    assert.equal((await st(p)).f, f0);
    await p.click('#career-half'); await settle(p);
    assert.equal((await st(p)).mode.career.half, 1);
    await p.reload(); await settle(p);
    assert.equal((await st(p)).mode.career.half, 1, 'winter resumes without replaying fixtures');
    while ((await st(p)).mode.career.ph === 'node') {
      const rest = p.locator('[data-career-rest]');
      if (await rest.count()) await rest.click();
      else await p.locator('[data-career-take]:not([disabled])').first().click();
      await settle(p);
    }
    assert.equal((await st(p)).mode.career.ph, 'repo');
    await p.click('#career-next'); await settle(p);
    assert.equal((await st(p)).mode.career.y, 0);
    await p.click('#career-half'); await settle(p);
    const full = (await st(p)).mode.career;
    assert.equal(full.half, 2); assert.equal(full.history.length, 1);
    await p.click('[data-tab="fixtures"]'); await settle(p); assert.equal(await p.locator('.fixture[data-comp="L"]').count(), 2 * (career0.S.ord.length - 1));
    await p.click('[data-tab="cup"]'); await settle(p); assert.ok(await p.locator('.career-bracket').count() >= 1);
    await p.click('[data-tab="stats"]'); await settle(p); await p.click('[data-tab="lineup"]'); await settle(p);
    assert.equal(await p.locator('#result-panel .tk').count(), 11);
    await p.click('[data-tab="history"]'); await settle(p); assert.match(await p.locator('#result-panel').innerText(), /Season history/i);
    ok(`${kind}: a real club season plays two halves around winter, resumes exactly, and records tables, cups, fixtures and history`);
    const replay = path.join(out, `${kind}-replay.json`);
    const [download] = await Promise.all([p.waitForEvent('download'), p.click('#download')]);
    await download.saveAs(replay);
    const saved = JSON.parse(fs.readFileSync(replay, 'utf8'));
    assert.equal(saved.game, 'Football Era Lab'); assert.equal(saved.draft.seed, 424242); assert.equal(saved.draft.cap, true); assert.equal(saved.draft.v, 4);
    assert.match(saved.result, /Salary cap/); assert.match(saved.result, /Season 1 \/ 10/); assert.match(saved.result, new RegExp(saved.draft.f));
    assert.deepEqual(saved.draft.slots, (await st(p)).slots);
    const [card] = await Promise.all([p.waitForEvent('download'), p.click('#result-card')]);
    const png = path.join(out, `${kind}-result-card.png`); await card.saveAs(png);
    assert.deepEqual([...fs.readFileSync(png).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    ok(`${kind}: replay and result image downloads contain the completed team`);
    await sound(p, 'results'); await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: path.join(out, `${kind}-results.png`), fullPage: true });
    await p.click('[data-tab="more"]'); await settle(p);
    assert.equal(await p.locator('#run-map option').count(), 4);
    await p.selectOption('#run-map', 'original'); await p.click('#run-start'); await settle(p);
    assert.equal((await st(p)).mode.run.map, 'original'); assert.equal((await st(p)).mode.run.f, f0);
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
    await p.reload(); await settle(p); await p.click('[data-tab="more"]'); await settle(p);
    assert.deepEqual((await st(p)).mode.run.log.length, r.log.length);
    ok(`${kind}: a selected Gauntlet map plays four rounds, rewards and a two-legged boss, and survives a reload`);
    await sound(p, 'gauntlet'); await p.screenshot({ path: path.join(out, `${kind}-gauntlet.png`), fullPage: true });
    await runControls(p, kind);
    await p.click('[data-tab="more"]'); await settle(p);
    await p.selectOption('#circuit-events', '10'); await p.click('#circuit-start'); await settle(p);
    assert.equal(await p.locator('#circuit-events').inputValue(), '10'); assert.ok(await p.locator('.mode-event').count() >= 10);
    assert.equal(await p.locator('[aria-label="Circuit awards"] .stat-card').count(), 4);
    assert.match(await p.locator('[aria-label="Circuit awards"]').innerText(), /Circuit top scorer/i);
    ok(`${kind}: circuit completion shows scorer, assist, keeper and player awards`);
    const c = await p.locator('#my-code').inputValue(), z0 = JSON.parse(Buffer.from(c, 'base64url').toString());
    assert.equal(z0.v, 2); assert.equal(z0.f, f0); assert.deepEqual(z0.m, saved.draft.manager);
    const classic = { ...z0, cap: false };
    await p.fill('#their-code', Buffer.from(JSON.stringify(classic)).toString('base64url')); await p.click('#h2h-play'); await settle(p);
    assert.equal(await p.locator('.cup-tie--yours').count(), 0);
    assert.match(await p.locator('#notice').innerText(), /matching Salary cap team code/i);
    ok(`${kind}: head to head rejects a Classic code against a capped team and explains the matching rules`);
    await p.fill('#their-code', c); await p.click('#h2h-play'); await settle(p);
    assert.equal(await p.locator('.cup-tie--yours').count(), 1);
    ok(`${kind}: the team code carries the club spell and formation, and plays head to head`);
    await sound(p, 'more modes');
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
    assert.deepEqual((await st(p)).mode.career, saved.draft.mode.career);
    assert.equal((await st(p)).phase, 'results'); assert.equal((await st(p)).cap, true);
    ok(`${kind}: invalid replays are rejected and a downloaded replay restores exact placements`);
    const v2 = { ...saved, draft: { ...saved.draft, v: 2, manager: { nm: 'legacy' } } };
    await p.click('#reset-open'); await p.click('#reset-confirm'); await settle(p);
    await p.setInputFiles('#import-replay', { name: 'v2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v2)) });
    await p.waitForFunction(() => document.querySelector('#notice').textContent.includes('could not be restored'));
    await p.goto(`${base}?seed=77&era=2000&cap=0`); await settle(p);
    assert.equal(await p.locator('#draft-classic').isChecked(), true);
    assert.equal(await p.locator('#seed').inputValue(), '77');
    await p.click('#start-form button[type=submit]'); await settle(p);
    assert.equal((await st(p)).cap, false);
    await p.click('#reset-open'); await p.click('#reset-confirm'); await settle(p);
    ok(`${kind}: a Classic replay link selects and starts its original rules`);
    await p.click('#weekly'); await settle(p);
    s = await st(p); assert.match(s.wk, /^\d{4}-W\d{2}$/); assert.equal(await p.locator('[data-manager]').count(), 5); assert.equal(s.cap, true);
    ok(`${kind}: the weekly challenge starts a shared-seed Salary cap draft even after choosing Classic`);
  } finally { await b.close(); }
}

// Tablet: roster and pitch side by side; the inspector sheet never covers a place on the pitch or bench.
async function tablet(fallback = false) {
  const { b, p } = await page('tablet');
  try {
    if (fallback) await p.addStyleTag({ content: ':root{--fd:sans-serif;--fu:sans-serif}' });
    await p.click('[data-era="2000"]'); await p.fill('#seed', '447'); await p.click('#start-form button[type=submit]'); await settle(p);
    await p.click('[data-manager="0"]'); await settle(p); await p.click('#squad-spin'); await settle(p);
    const r = p.locator('#roster-list .pr:not([aria-disabled])').first(), id = await r.getAttribute('data-player');
    await r.click(); await settle(p);
    assert.equal(await p.locator('#sheet').isVisible(), true);
    const clash = await p.evaluate(() => { const s = document.querySelector('#sheet').getBoundingClientRect(); return [...document.querySelectorAll('.lineup [data-slot]')].some(e => { const r = e.getBoundingClientRect(); return r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top; }); });
    assert.equal(clash, false, 'the sheet must not cover a place');
    await p.screenshot({ path: path.join(out, `tablet${fallback ? '-fallback' : ''}-sheet.png`), fullPage: true });
    await sound(p, 'tablet sheet');
    assert.equal(await inView(p, '.bar-tools button:not([hidden])'), true, 'tablet header controls stay visible');
    await p.click('#sheet-best'); await settle(p);
    assert.equal((await st(p)).slots.filter(Boolean)[0].p, id);
    ok(`tablet${fallback ? ' with fallback fonts' : ''}: roster and pitch side by side, and the sheet places a player without covering a place`);
  } finally { await b.close(); }
}

// Reduced motion: the reveal and the pitch carry no animation.
async function motion() {
  const { b, p } = await page('desktop', { reducedMotion: 'reduce' });
  try {
    const a = await p.evaluate(() => { const d = document.createElement('div'); d.className = 'reveal landed'; d.innerHTML = '<p class="rv-club">X</p>'; document.body.append(d); return getComputedStyle(d.firstChild).animationName; });
    assert.equal(a, 'none');
    await p.click('[data-era="2000"]'); await p.click('#start-form button[type=submit]'); await settle(p);
    await p.click('[data-manager="0"]'); await settle(p); await p.click('#squad-spin');
    await p.waitForSelector('#roster-list', { timeout: 300 });
    ok('reduced motion: the reveal appears at once and carries no animation');
  } finally { await b.close(); }
}

async function careerControls() {
  const { b, p } = await page('desktop', { reducedMotion: 'reduce' });
  try {
    const seed = await p.locator('#seed').inputValue();
    await p.click('#seed-reroll'); assert.notEqual(await p.locator('#seed').inputValue(), seed);
    await p.click('#random-decade'); assert.equal(await p.locator('#random-decade').getAttribute('aria-pressed'), 'true');
    ok('compact random-decade and seed re-roll controls update their actual settings');
    await p.setInputFiles('#import-replay', path.join(out, 'desktop-replay.json')); await p.waitForSelector('.career-hero'); await settle(p);
    const up = await p.evaluate(async key => {
      const C = await import('./app/career.js'), g = await (await fetch('./data/game.json')).json(), s = JSON.parse(localStorage.getItem(key)).mode.career;
      const O = C.careerOffers(g, s), j = O.findIndex(o => o.id === 'upg');
      if (j < 0) throw new Error('The completed desktop season must offer its free prime upgrade.');
      return { j, pick: 0, ...O[j].list[0] };
    }, KEY);
    await p.selectOption(`#career-up-${up.j}`, String(up.pick)); await p.click(`[data-career-take="${up.j}"]`); await settle(p);
    let s = (await st(p)).mode.career;
    assert.equal(s.slots[up.i].k, up.to.k); assert.equal(s.slots[up.i].p, up.from.p); assert.equal(s.up[up.from.p], up.from.k);
    await p.click('[data-career-respin="scout"]'); await settle(p);
    assert.equal((await st(p)).mode.career.fa, 1); assert.equal(await p.locator('[data-career-respin]').count(), 0);
    const deal = await p.evaluate(async key => {
      const C = await import('./app/career.js'), { fits, GCAP } = await import('./app/cap.js');
      const g = await (await fetch('./data/game.json')).json(), s = JSON.parse(localStorage.getItem(key)).mode.career, O = C.careerOffers(g, s), j = O.findIndex(o => o.kind === 'market');
      for (let pick = 0; pick < O[j].list.length; pick++) for (let slot = 0; slot < 15; slot++) {
        const f = O[j].list[pick], cost = C.careerPrice(g, s, f, slot);
        if (s.pat > cost && fits(g, C.careerBill(g, s), slot, f, GCAP)) return { j, pick, slot, cost, p: f.p };
      }
      throw new Error('No affordable career signing.');
    }, KEY);
    await p.selectOption(`#career-fa-${deal.j}`, String(deal.pick)); await p.selectOption(`#career-out-${deal.j}`, String(deal.slot));
    assert.match(await p.locator(`#career-price-${deal.j}`).innerText(), new RegExp(`Costs ${deal.cost} patience`));
    await p.click(`[data-career-take="${deal.j}"]`); await settle(p);
    assert.equal((await st(p)).mode.career.slots[deal.slot].p, deal.p);
    ok('career prime upgrades keep the person and tier charge; scouting and quoted signings apply to the chosen place');
    s = (await st(p)).mode.career; assert.equal(s.ph, 'hop');
    await p.click('#career-hop'); await settle(p); assert.equal((await st(p)).mode.career.ph, 'hop');
    const transfers = await p.evaluate(async key => {
      const C = await import('./app/career.js'), g = await (await fetch('./data/game.json')).json(), s = JSON.parse(localStorage.getItem(key)).mode.career, H = C.careerHopPools(g, s);
      for (let old = 0; old < H.old.length; old++) for (let neu = 0; neu < H.neu.length; neu++)
        for (let a = 0; a < 15; a++) for (let b = a + 1; b < 15; b++) {
          const sel = { old: [old], neu: [neu], out: [a, b] };
          try { return { ...sel, slots: C.careerHop(g, s, sel).slots }; } catch { /* another legal pair */ }
        }
      throw new Error('No legal summer transfer pair.');
    }, KEY);
    for (const [j, k] of ['old', 'neu'].entries()) {
      const i = transfers[k][0]; await p.check(`[data-career-hop-pick="${k}"][value="${i}"]`);
      await p.selectOption(`#career-hop-out-${k}-${i}`, String(transfers.out[j]));
    }
    await p.click('#career-hop'); await settle(p); s = (await st(p)).mode.career;
    assert.equal(s.ph, 'repo'); assert.deepEqual(s.slots, transfers.slots);
    const f = s.f === '3-5-2' ? '4-4-2' : '3-5-2';
    await p.selectOption('#career-form', f); await p.click('#career-form-apply'); await settle(p);
    const next = (await st(p)).mode.career; assert.equal(next.f, f); assert.deepEqual(next.slots.slice(11), s.slots.slice(11));
    await p.selectOption('#career-swap-a', '0'); await p.selectOption('#career-swap-b', '12'); await p.click('#career-swap'); await settle(p);
    assert.equal((await st(p)).mode.career.slots[12].p, next.slots[0].p);
    await p.click('#career-next'); await settle(p); s = (await st(p)).mode.career;
    assert.equal(s.y, 1); assert.equal(s.half, 0); assert.equal(s.S.s, s.years[1]);
    await p.reload(); await settle(p); assert.deepEqual((await st(p)).mode.career, s);
    await sound(p, 'next club season'); await p.evaluate(() => scrollTo(0, 0));
    await p.screenshot({ path: path.join(out, 'desktop-next-season.png'), fullPage: true });
    ok('two summer transfers, formation changes, lineup swaps and the next real club season survive a reload');
  } finally { await b.close(); }
}

async function stageDraft(p, n) {
  await p.evaluate(async ({ key, n }) => {
    const D = await import(new URL('./app/draft.js', location.href));
    const g = await (await fetch(new URL('./data/game.json', location.href))).json();
    let s = D.choose(g, D.start(447, 2000, true), 0);
    for (let i = 0; i < n; i++) {
      if (!s.combo) s = D.spin(g, s);
      const c = g.cards[s.combo].find(c => D.can(g, s, c.p));
      s = D.place(g, s, c.p, i);
    }
    localStorage.setItem(key, JSON.stringify(s));
  }, { key: KEY, n });
  await p.reload(); await settle(p);
}

async function pendingFormation() {
  const { b, p } = await page('desktop');
  try {
    await stageDraft(p, 15);
    const s = await st(p), f = s.f === '3-5-2' ? '4-4-2' : '3-5-2';
    await p.selectOption('#form-pick', f); await settle(p);
    assert.equal(await p.locator('#simulate').isDisabled(), true, 'resolve the formation preview before kick-off');
    assert.equal(await p.locator('[data-act="simulate"]').isDisabled(), true, 'the phone kick-off also requires resolving the preview');
    await p.locator('#simulate').evaluate(e => { e.disabled = false; e.click(); }); await settle(p);
    assert.deepEqual(await st(p), s, 'kick-off during a preview leaves the draft unchanged');
    await p.click('#form-cancel'); await settle(p);
    assert.equal(await p.locator('#simulate').isDisabled(), false);
    await p.selectOption('#form-pick', f); await settle(p); await p.click('#form-apply'); await settle(p);
    assert.equal((await st(p)).f, f);
    assert.equal(await p.locator('#simulate').isDisabled(), false);
    ok('a formation preview must be applied or cancelled before kick-off');
  } finally { await b.close(); }
}

async function benchKeyboard() {
  const { b, p } = await page('mobile');
  try {
    await stageDraft(p, 11);
    const ids = await legal(p);
    const r = p.locator('#roster-list .pr:not([aria-disabled])').first(), id = await r.getAttribute('data-player');
    await r.focus(); await p.keyboard.press('Enter'); await settle(p);
    assert.equal(await p.evaluate(() => document.activeElement.closest('#sheet')?.id), 'sheet', 'keyboard selection enters the sheet');
    assert.equal(await p.evaluate(() => document.activeElement.dataset.target), '11', 'keyboard selection targets the first empty bench place');
    await p.keyboard.press('Escape'); await settle(p);
    await p.check('#fit-only'); await settle(p);
    assert.equal(await p.locator('#roster-list .pr:not([aria-disabled])').count(), ids.length, 'every legal card fits the empty bench');
    await r.focus(); await p.keyboard.press('Enter'); await settle(p);
    await p.keyboard.press('Enter'); await settle(p);
    assert.equal(await p.evaluate(() => document.activeElement.id), 'place-confirm');
    await p.keyboard.press('Enter'); await settle(p);
    assert.equal((await st(p)).slots[11].p, id);
    ok('a phone keyboard can draft onto an empty bench after every pitch place is filled');
  } finally { await b.close(); }
}

(async () => {
  let failure = null;
  try { await pendingFormation(); await benchKeyboard(); await full('desktop'); await full('mobile'); await careerControls(); await tablet(); await tablet(true); await motion(); assert.deepEqual(errors, [], 'console or page errors'); }
  catch (e) { failure = String(e.stack || e); }
  const rep = { passed: !failure && !errors.length, url: base, data_build: G.meta.v,
    data_sha256: createHash('sha256').update(raw).digest('hex'), checks, errors, failure };
  fs.writeFileSync(path.join(out, 'acceptance.json'), JSON.stringify(rep, null, 2));
  process.stdout.write(`${rep.passed ? 'PASSED' : 'FAILED'} (${checks.length} checks)\n`);
  if (!rep.passed) { process.stdout.write(`${failure || ''}\n${errors.join('\n')}\n`); process.exit(1); }
})();
