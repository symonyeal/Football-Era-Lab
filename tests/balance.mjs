// Balance measurement (not part of the test suite): sensible drafts play seasons or whole Gauntlet runs.
//   node tests/balance.mjs season [drafts per decade=40] [cap|classic] [free]
//   node tests/balance.mjs gauntlet [runs=40] [keep=5] [cap|classic] [free] [map=original]
// A sensible draft takes the best-graded of the five managers, then for each pick the legal card and
// open slot with the highest slot-rated, era-adjusted value plus the club links it would earn. Rules
// default to Salary cap, the browser default. With `free`, the finished draft moves to the formation
// that maximises its overall (Dr.form keeps every card and the bench). In the Gauntlet it takes a boost card only when at
// least `keep` patience remains after paying, else rests or takes affordable development. Transfers
// choose the two lowest-rated offers from each decade, releasing cap charges as required.
import { readFileSync } from 'node:fs';
import * as E from '../app/engine/index.js';
import * as Dr from '../app/draft.js';
import * as Rn from '../app/run.js';
import { fields } from '../app/data.js';
import { ct, TI, GCAP } from '../app/cap.js';

const G = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
if (G.params) E.cfg(G.params);
const F = fields(G), GR = { S: 0.04, A: 0.03, B: 0.015, C: 0, D: -0.015, F: -0.03 };
const A = process.argv.slice(2), cap = !A.includes('classic'), free = A.includes('free'), legacy = A.includes('legacy');
const rules = `${cap ? 'Salary cap' : 'Classic'}${free ? ', free formation' : ''}`;
const [mode = 'season', a1, a2, map = 'original'] = A.filter(x => !['cap', 'classic', 'free', 'legacy'].includes(x));
const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))];

function draft(seed, D) {
  const s0 = Dr.start(seed, D, cap);
  if (legacy) s0.v = 3;
  const mo = Dr.opts(G, s0).map((o, i) => { const m = G.managers.find(m => m.nm === o.nm); return [GR[m.ga] + GR[m.gd], i]; });
  let s = Dr.choose(G, s0, mo.sort((a, b) => b[0] - a[0] || a[1] - b[1])[0][1]);
  const SH = Dr.shape(G, s.f), S = SH.map(x => x.s);
  for (let n = 0; n < 5; n++) {
    s = Dr.spin(G, s);
    for (let j = 0; j < 3; j++) {
      const open = s.slots.map((c, i) => (c ? -1 : i)).filter(i => i >= 0);
      let b = null;
      for (const c of G.cards[s.combo].filter(c => Dr.can(G, s, c.p))) {
        const h = Dr.hydrate(G, { k: s.combo, p: c.p });
        for (const i of open) {
          let v = h.r * (i < 11 ? 1 - E.ft(h, S[i]).f : 0.92) * E.em(h.D, D, h.tg?.tl || 0);
          if (i < 11) v += Math.min(2, s.slots.filter((x, k) => x && k < 11 && x.k === s.combo &&
            Math.hypot(SH[k].x - SH[i].x, SH[k].y - SH[i].y) <= 34).length);
          if (!b || v > b.v) b = { v, p: c.p, i };
        }
      }
      s = Dr.place(G, s, b.p, b.i);
    }
  }
  if (!free) return s;
  const v = t => E.rate(Dr.team(G, t), D).ovr;
  return Object.keys(G.formations).map(f => Dr.form(G, s, f)).reduce((a, b) => (v(b) > v(a) ? b : a));
}

if (mode === 'season') {
  const N = Number(a1 || 40), rows = [];
  for (const D of Dr.DECADES) {
    const pos = [], ovr = [], pts = []; let inv = 0;
    for (let k = 0; k < N; k++) {
      const seed = 1000 + k, T = Dr.team(G, draft(seed, D)), me = { id: 'your-club', nm: 'You', T, x: E.rate(T, D).ovr };
      const R = E.run(E.hs(`${seed}:season`), me, F[D].slice(0, 19), F[D].slice(0, 15), D), t = R.L.tab.find(t => t.me);
      pos.push(R.L.tab.indexOf(t) + 1); ovr.push(me.x); pts.push(t.Pts); if (t.L === 0) inv++;
    }
    rows.push({ decade: D, opponentTop: F[D][0].x.toFixed(1), opponentMedian: F[D].slice(0, 19).map(o => o.x).sort((a, b) => b - a)[9].toFixed(1),
      teamMedian: q(ovr, 0.5).toFixed(1), finishMedian: q(pos, 0.5), titles: pos.filter(x => x === 1).length,
      topFour: pos.filter(x => x <= 4).length, pointsMedian: q(pts, 0.5), unbeaten: inv });
  }
  console.table(rows);
  const t = rows.reduce((s, r) => s + r.titles, 0);
  console.log(`${rules}: titles ${t} of ${N * 8} (${(100 * t / (N * 8)).toFixed(1)}%), spin settings tau ${Dr.DW.tau}, rho ${Dr.DW.rho}`);
} else {
  const N = Number(a1 || 40), keep = Number(a2 || 5), acts = [], segs = [], boss = [];
  for (let k = 0; k < N; k++) {
    const seed = 500 + k;
    let s = Rn.runNew(seed, draft(seed, Dr.DECADES[k % 8]), map), n = 0;
    while (!['done', 'fired'].includes(s.ph) && n++ < 400) {
      if (s.ph === 'rd') { s = Rn.runRound(G, F, s); segs.push(s.log.at(-1).pts); }
      else if (s.ph === 'node') {
        const O = Rn.offers(G, F, s), j = O.findIndex(o => o.id === 'upg' && o.list.some(u => s.pat - u.cost >= keep));
        const rest = O.findIndex(o => o.kind === 'rest');
        const dev = O.findIndex(o => o.kind === 'dev' && s.pat - o.cost >= 1);
        const i = j >= 0 ? j : rest >= 0 ? rest : dev;
        if (i < 0) throw new Error('The policy found no affordable reward.');
        const pick = O[i].id === 'upg' ? O[i].list.findIndex(u => s.pat - u.cost >= (j >= 0 ? keep : 1)) : 0;
        s = Rn.take(G, F, s, i, { pick });
      } else if (s.ph === 'boss') s = Rn.runPlayBoss(G, F, s);
      else if (s.ph === 'hop') {
        const H = Rn.hopPools(G, s), low = L => L.map((f, i) => i).sort((i, j) => L[i].r - L[j].r).slice(0, Rn.HOP_N);
        const old = low(H.old), neu = low(H.neu), ins = [...old.map(i => H.old[i]), ...neu.map(i => H.neu[i])];
        const Q = Rn.bill(G, s), C = ct(G, Q), out = [];
        for (const t of ['S', 'A']) {
          const need = cap ? Math.max(0, C[t] + ins.filter(f => TI(f.r) === t).length - GCAP[t]) : 0;
          out.push(...Q.map((r, i) => i).filter(i => TI(Dr.hydrate(G, Q[i]).r) === t).slice(0, need));
        }
        const lowOut = Q.map((r, i) => i).filter(i => !out.includes(i)).sort((i, j) => Dr.hydrate(G, Q[i]).r - Dr.hydrate(G, Q[j]).r);
        out.push(...lowOut.slice(0, ins.length - out.length));
        s = Rn.hop(G, s, { old, neu, out });
      } else if (s.ph === 'repo') s = Rn.nextAct(s);
    }
    if (!['done', 'fired'].includes(s.ph)) throw new Error('The policy exceeded 400 steps.');
    acts.push(s.log.filter(e => e.t === 'boss' && e.won).length); boss.push(s.log.filter(e => e.t === 'boss').length);
  }
  const h = {}; acts.forEach(a => { h[a] = (h[a] || 0) + 1; });
  console.log(JSON.stringify({ rules, map, runs: N, keep, decadesCleared: h, medianDecades: q(acts, 0.5), fullClears: h[Rn.MAPS[map].D.length] || 0,
    segmentPointsMedian: q(segs, 0.5), bossMatchesMedian: q(boss, 0.5) }));
}
