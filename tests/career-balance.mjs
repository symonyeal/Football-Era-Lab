// Bounded career balance measurement; this is a policy experiment, not a unit test.
// node tests/career-balance.mjs [drafts per decade=4] [cap|classic|both] [keep=5] [free]
//   [--decade 1950|...|2020] [--output persistent-json-path]
// G archive; N drafts per decade and rule set; D decade; s draft/career; Q current charged cards;
// R rated current squad; O rewards; H summer pools; keep patience retained after a paid prime upgrade;
// free initial formation maximizes overall; q sample quantile; dp owner delta; rows individual careers.
// Draft policy matches tests/balance.mjs: strongest manager grades, then the best legal card/slot by
// fit, era and nearby club links. Rewards prefer an affordable prime upgrade retaining keep patience,
// otherwise rest, then development. Summer choices minimize lost starter strength before improving
// the bench, with lower-rated offers breaking ties; legal cap charges include earned upgrades.
// Summer lineup uses the best assignment within the current formation, retaining every player.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../app/engine/index.js';
import * as Dr from '../app/draft.js';
import * as C from '../app/career.js';
import { ct, TI, GCAP, fits } from '../app/cap.js';

const raw = readFileSync(new URL('../data/game.json', import.meta.url)), G = JSON.parse(raw);
if (G.params) E.cfg(G.params);
const args = process.argv.slice(2), opts = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) {
  if (!['--decade', '--output'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Use --decade YEAR or --output PATH.');
  opts[args[i].slice(2)] = args[i + 1]; args.splice(i, 2); i--;
}
const N = Number(args[0] || 4), mode = args[1] || 'both', keep = Number(args[2] || 5), free = args.includes('free');
if (!Number.isInteger(N) || N < 1 || N > 100 || !['cap', 'classic', 'both'].includes(mode) || !Number.isInteger(keep) || keep < 1 || keep > 20) throw new Error('Use 1–100 drafts, cap/classic/both, and 1–20 retained patience.');
const DS = opts.decade ? [Number(opts.decade)] : Dr.DECADES;
if (DS.some(D => !Dr.DECADES.includes(D))) throw new Error('Choose a supported decade.');
const output = resolve(opts.output || fileURLToPath(new URL('../../../../Claude Func Folder/football-v2/league-mode-20261008/career balance.json', import.meta.url)));
const GR = { S: 0.04, A: 0.03, B: 0.015, C: 0, D: -0.015, F: -0.03 };
const q = (a, f = 0.5) => a.length ? a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))] : null;
const hist = a => a.reduce((h, x) => { h[x] = (h[x] || 0) + 1; return h; }, {});

function draft(seed, D, cap) {
  const s0 = Dr.start(seed, D, cap), M = Dr.opts(G, s0).map((o, i) => {
    const m = G.managers.find(m => m.nm === o.nm); return [GR[m.ga] + GR[m.gd], i];
  });
  let s = Dr.choose(G, s0, M.sort((a, b) => b[0] - a[0] || a[1] - b[1])[0][1]);
  const S = Dr.shape(G, s.f);
  for (let n = 0; n < 5; n++) {
    s = Dr.spin(G, s);
    for (let j = 0; j < 3; j++) {
      const open = s.slots.map((c, i) => c ? -1 : i).filter(i => i >= 0); let b = null;
      for (const c of G.cards[s.combo].filter(c => Dr.can(G, s, c.p))) {
        const h = Dr.hydrate(G, { k: s.combo, p: c.p });
        for (const i of open) {
          let v = h.r * (i < 11 ? 1 - E.ft(h, S[i].s).f : 0.92) * E.em(h.D, D, h.tg?.tl || 0);
          if (i < 11) v += Math.min(2, s.slots.filter((x, k) => x && k < 11 && x.k === s.combo && Math.hypot(S[k].x - S[i].x, S[k].y - S[i].y) <= 34).length);
          if (!b || v > b.v) b = { v, p: c.p, i };
        }
      }
      if (!b) throw new Error('No legal draft pick.');
      s = Dr.place(G, s, b.p, b.i);
    }
  }
  if (!free) return s;
  const v = s => E.rate(Dr.team(G, s), D).ovr;
  return Object.keys(G.formations).map(f => Dr.form(G, s, f)).reduce((a, b) => v(b) > v(a) ? b : a);
}

function take(s) {
  const O = C.careerOffers(G, s), up = O.findIndex(o => o.id === 'upg' && o.list.some(u => s.pat - u.cost >= keep));
  if (up >= 0) {
    const L = O[up].list.map((u, i) => ({ i, u })).filter(x => s.pat - x.u.cost >= keep).sort((a, b) => (b.u.to.r - b.u.from.r) - (a.u.to.r - a.u.from.r));
    return C.careerTake(G, s, up, { pick: L[0].i });
  }
  const rest = O.findIndex(o => o.kind === 'rest');
  if (rest >= 0) return C.careerTake(G, s, rest);
  for (let j = 0; j < O.length; j++) {
    const o = O[j];
    if (o.kind !== 'dev') continue;
    if (o.id === 'upg') {
      const pick = o.list.findIndex(u => s.pat - u.cost >= 1);
      if (pick >= 0) return C.careerTake(G, s, j, { pick });
    } else if (s.pat - o.cost >= 1) return C.careerTake(G, s, j, o.team ? {} : { player: o.who[0] });
  }
  // Free trophy picks may offer only a market. Buy the strongest legal positional improvement.
  const T = C.careerTeam(G, s), R = E.rate(T, s.D), B = C.careerBill(G, s); let best = null;
  for (let j = 0; j < O.length; j++) if (['market', 'desp'].includes(O[j].kind)) for (let pick = 0; pick < O[j].list.length; pick++) {
    const f = O[j].list[pick], c = Dr.hydrate(G, f);
    for (let slot = 0; slot < 15; slot++) {
      const cost = s.node.free ? 0 : O[j].kind === 'desp' ? f.cost : C.careerPrice(G, s, f, slot);
      if (s.pat - cost < 1 || s.cap && !fits(G, B, slot, f, GCAP)) continue;
      const v = c.r * E.em(c.D, s.D) * (slot < 11 ? 1 - E.ft(c, T.S[slot].s).f : 1) - (slot < 11 ? R.xi[slot].a : R.bn[slot - 11].a);
      if (!best || v > best.v) best = { j, pick, slot, v };
    }
  }
  if (!best) throw new Error('No affordable career reward.');
  return C.careerTake(G, s, best.j, best);
}

function hop(s) {
  const H = C.careerHopPools(G, s), low = L => L.map((_, i) => i).sort((a, b) => L[a].r - L[b].r);
  const A = H.old.length ? low(H.old) : [-1], B = H.neu.length ? low(H.neu) : [-1];
  const Q = C.careerBill(G, s), counts = ct(G, Q), T = C.careerTeam(G, s), R = E.rate(T, s.D);
  const tiers = Q.map(c => TI(Dr.hydrate(G, c).r)); let best = null;
  for (const a of A) for (const b of B) {
    const ins = [...(a >= 0 ? [H.old[a]] : []), ...(b >= 0 ? [H.neu[b]] : [])], cards = ins.map(c => Dr.hydrate(G, c));
    const values = cards.map(c => T.S.map(slot => c.r * (1 - E.ft(c, slot.s).f) * E.em(c.D, s.D)));
    const go = out => {
      if (s.cap) for (const t of Object.keys(GCAP)) if (counts[t] + ins.filter(c => TI(c.r) === t).length - out.filter(i => tiers[i] === t).length > GCAP[t]) return;
      let loss = 0, gain = 0;
      out.forEach((i, j) => {
        const d = i < 11 ? values[j][i] - R.xi[i].a : 0.15 * (cards[j].r * E.em(cards[j].D, s.D) - R.bn[i - 11].a);
        if (i < 11 && d < 0) loss -= d; gain += d;
      });
      const v = gain - 100 * loss - 0.001 * ins.reduce((n, c) => n + c.r, 0);
      if (!best || v > best.v) best = { v, old: a < 0 ? [] : [a], neu: b < 0 ? [] : [b], out };
    };
    if (!ins.length) go([]);
    else for (let i = 0; i < 15; i++) {
      if (ins.length === 1) go([i]);
      else for (let j = 0; j < 15; j++) if (i !== j) go([i, j]);
    }
  }
  if (!best) throw new Error('No legal summer transfer choice.');
  return C.careerHop(G, s, best);
}

function repo(s) {
  const T = C.careerTeam(G, s), B = E.best([...T.xi, ...T.bn], T.S, s.D), ids = [...B.xi, ...B.bn].map(c => c.id);
  for (let i = 0; i < ids.length; i++) if (s.slots[i].p !== ids[i]) s = C.careerSwap(s, i, s.slots.findIndex(c => c.p === ids[i]));
  return C.careerNext(G, s);
}

const start = performance.now(), rows = [];
for (const cap of mode === 'both' ? [true, false] : [mode === 'cap']) for (const D of DS) for (let k = 0; k < N; k++) {
  const seed = 1000 + k, d = draft(seed, D, cap), initial = E.rate(Dr.team(G, d), D).ovr;
  let s = C.careerStart(G, d), steps = 0;
  while (!['done', 'fired'].includes(s.ph) && steps++ < 300) {
    if (s.ph === 'half') s = C.careerPlayHalf(G, s);
    else if (s.ph === 'node') s = take(s);
    else if (s.ph === 'hop') s = hop(s);
    else if (s.ph === 'repo') s = repo(s);
    else throw new Error(`Unknown phase ${s.ph}.`);
  }
  if (!['done', 'fired'].includes(s.ph)) throw new Error('Career exceeded 300 actions.');
  try { C.validCareer(G, s, d.manager, cap); }
  catch (e) {
    const failed = output.replace(/\.json$/i, '') + '.failed.json';
    mkdirSync(dirname(failed), { recursive: true }); writeFileSync(failed, `${JSON.stringify({ D, seed, cap, manager: d.manager, state: s }, null, 2)}\n`);
    console.error(`Invalid final save: ${cap ? 'cap' : 'classic'} ${D} seed ${seed}, ${s.ph}, ${s.history.length} seasons; ${failed}`);
    throw e;
  }
  const seg = s.log.filter(e => e.t === 'seg'), boss = s.log.filter(e => e.t === 'boss');
  // Reconcile the half reducer with the season table: every completed league fixture belongs to one half.
  for (const h of s.history) {
    const L = seg.filter(e => e.s === h.s);
    if (L.length !== 2 || L.reduce((n, e) => n + e.pts, 0) !== h.pts || L.reduce((n, e) => n + e.w + e.d + e.l, 0) !== 2 * (h.n - 1)) throw new Error(`Half totals do not reconcile for ${D} ${seed} ${h.s}.`);
  }
  rows.push({ cap, D, seed, q: s.q, club: G.clubs[s.q].nm, lg: s.lg, formation: d.f, initial,
    state: s.ph, available: s.years.length, completed: s.history.length, started: s.y + 1, halves: seg.length,
    objectives: boss.filter(e => e.won).length, patience: s.pat, titles: hist(s.trophies.map(t => t.k)),
    halfDelta: hist(seg.map(e => e.dp)), finishes: s.history.map(h => ({ s: h.s, pos: h.pos, n: h.n, pts: h.pts, target: h.obj.t, won: h.won })),
    boosts: s.log.filter(e => e.t === 'boost').length, rests: s.log.filter(e => e.t === 'rest').length, score: C.careerScore(s).score });
  console.log(`${cap ? 'cap' : 'classic'} ${D} seed ${seed}: ${s.ph}, ${s.history.length}/${s.years.length} seasons, ${boss.filter(e => e.won).length} objectives, ${s.trophies.length} trophies (${((performance.now() - start) / 1000).toFixed(1)}s elapsed)`);
}
const groups = [];
for (const cap of mode === 'both' ? [true, false] : [mode === 'cap']) for (const D of DS) {
  const R = rows.filter(r => r.cap === cap && r.D === D), total = k => R.reduce((n, r) => n + r[k], 0);
  const deltas = {}, titles = {};
  for (const r of R) { for (const [k, n] of Object.entries(r.halfDelta)) deltas[k] = (deltas[k] || 0) + n; for (const [k, n] of Object.entries(r.titles)) titles[k] = (titles[k] || 0) + n; }
  groups.push({ rules: cap ? 'Salary cap' : 'Classic', decade: D, runs: R.length, complete: R.filter(r => r.state === 'done').length,
    sacked: R.filter(r => r.state === 'fired').length, seasons: total('completed'), available: total('available'), halves: total('halves'),
    objectives: total('objectives'), objectiveShare: total('completed') ? total('objectives') / total('completed') : null,
    initialMedian: q(R.map(r => r.initial)), seasonsMedian: q(R.map(r => r.completed)), titles, halfDelta: deltas });
}
const result = { schema: 1, dataSha256: createHash('sha256').update(raw).digest('hex'), elapsedSeconds: (performance.now() - start) / 1000,
  settings: { draftsPerDecade: N, rules: mode, decades: DS, seeds: [1000, 1000 + N - 1], keep, freeInitialFormation: free,
    draftVersion: Dr.VERSION, careerVersion: C.CAREER_VERSION, policy: 'Best manager grades; legal fit/era/link draft; prime upgrade if keep patience remains, else rest then development; summer minimizes lost starter strength then improves bench within cap, lower-card tie break; best current-formation assignment after summer.' },
  groups, rows };
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.table(groups.map(r => ({ rules: r.rules, decade: r.decade, runs: r.runs, complete: r.complete, sacked: r.sacked, seasons: r.seasons, objectives: r.objectives, titles: Object.values(r.titles).reduce((a, b) => a + b, 0) })));
console.log(`Saved ${rows.length} careers to ${output}; ${result.elapsedSeconds.toFixed(1)} seconds.`);
