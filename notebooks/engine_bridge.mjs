// Notebook adapter: data shaping only; ratings, assignments, drafts and matches use the browser modules.
//
// Legend
//   G   bundled game JSON; x editable settings read as JSON from standard input
//   ref source card {k: clubQID:decade, p: personQID}; Q fifteen hydrated cards
//   T   user team; R engine rating breakdown; F decade opponent fields
//   C   source count map; st league/Cup player statistics

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as E from '../app/engine/index.js';
import { fields } from '../app/data.js';
import { TI, ct, ck } from '../app/cap.js';
import {
  start, opts, choose, spin, place, can, hydrate, shape, seed as parseSeed,
} from '../app/draft.js';

const root = new URL('../', import.meta.url);
const file = new URL('data/game.json', root);
const raw = readFileSync(file);
const G = JSON.parse(raw);

function refs(ids, D) {
  return ids.map(p => {
    const q = Object.entries(G.cards).flatMap(([k, cards]) =>
      cards.filter(c => c.p === p).map(c => ({ k, p, r: c.r, own: Number(k.split(':')[1]) === D })));
    q.sort((a, b) => Number(b.own) - Number(a.own) || b.r - a.r || a.k.localeCompare(b.k));
    if (!q.length) throw new Error(`Person ${p} has no card in this dataset.`);
    return { k: q[0].k, p };
  });
}

function demo(seed, D, cap) {
  let s = choose(G, start(seed, D, cap), 0);
  let keepers = 0;
  const selected = [];
  for (let i = 0; i < 5; i++) {
    s = spin(G, s);
    for (let j = 0; j < 3; j++) {
      const pool = G.cards[s.combo].filter(c => can(G, s, c.p))
        .slice().sort((a, b) => b.r - a.r || a.p.localeCompare(b.p));
      const c = (keepers < 2 ? pool.find(c => c.pos.includes('GK')) : null) || pool[0];
      if (!c) throw new Error('No legal player remains in this notebook draw.');
      const ref = { k: s.combo, p: c.p };
      s = place(G, s, c.p, selected.length);
      selected.push(ref);
      if (c.pos.includes('GK')) keepers++;
    }
  }
  return { selected, manager: s.manager, history: s.history };
}

function parameters() {
  if (G.params) return G.params;
  try {
    const c = JSON.parse(readFileSync(new URL('data/calibration.json', root), 'utf8'));
    return c.params || c;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return null;
  }
}

function execute(x) {
  const seed = parseSeed(x.seed ?? 20261006);
  const D = Number(x.decade ?? 1990);
  const cap = x.cap ?? false;
  if (typeof cap !== 'boolean') throw new Error('cap must be true for Salary cap or false for Classic.');
  if (!E.DS.includes(D)) throw new Error('Choose a supported simulation decade.');
  const p = parameters();
  if (p) E.cfg(p);
  if (x.person_ids !== undefined && !Array.isArray(x.person_ids)) throw new Error('person_ids must be an array.');
  if (x.source_cards !== undefined && !Array.isArray(x.source_cards)) throw new Error('source_cards must be an array.');
  let selected;
  let mode = 'Manual notebook team; experimental choices, not a browser ranked run.';
  let history = [];
  let chosen = opts(G, start(seed, D))[0];
  if (x.source_cards?.length) {
    selected = x.source_cards.map(c => {
      if (!c || typeof c.k !== 'string' || typeof c.p !== 'string') throw new Error('Each source card needs string k and p fields.');
      return { k: c.k, p: c.p };
    });
  } else if (x.person_ids?.length) {
    if (!x.person_ids.every(p => typeof p === 'string')) throw new Error('Each person ID must be a string.');
    selected = refs(x.person_ids, D);
  } else {
    const d = demo(seed, D, cap);
    selected = d.selected;
    chosen = d.manager;
    history = d.history;
    mode = 'Notebook-only seeded draft demonstration: automatic picks, with editable placement.';
  }
  if (selected.length !== 15 || new Set(selected.map(c => c.p)).size !== 15)
    throw new Error('Supply exactly fifteen distinct people.');
  if (cap) ck(G, selected);
  const m = x.manager ? G.managers.find(m => m.nm === x.manager) : G.managers.find(m => m.nm === chosen.nm);
  if (!m) throw new Error('Choose a manager name from the catalogue.');
  const f = x.formation || (x.manager ? m.f[0] : chosen.f);
  const S = shape(G, f);
  const Q = selected.map(c => hydrate(G, c));
  const placement = x.placement || 'best';
  if (!['best', 'ordered'].includes(placement)) throw new Error('placement must be best or ordered.');
  const T = { m, S, ...(placement === 'best' ? E.best(Q, S, D) : { xi: Q.slice(0, 11), bn: Q.slice(11) }) };
  const R = E.rate(T, D);
  const F = fields(G)[D];
  if (F.length < 19) throw new Error(`The ${D}s field has ${F.length} league opponents; nineteen are required.`);
  const O = F.slice(0, 19);
  const me = { id: 'your-club', nm: 'Your Era XI', me: true, x: R.ovr, T };
  const seasonSeed = E.hs(`${seed}:season`);
  const season = E.run(seasonSeed, me, O, O.slice(0, 15), D);
  const C = {};
  Q.forEach(c => { C[c.src] = (C[c.src] || 0) + 1; });
  const st = [...season.L.st.values()].map(p => ({ ...p, competition: 'League' }));
  for (const p of season.st2.values()) st.push({ ...p, competition: 'European Cup' });
  const finalRefs = [...T.xi, ...T.bn].map(c => selected.find(r => r.p === c.id));
  return {
    mode, cap, tier_counts: ct(G, selected), seed, season_seed: seasonSeed, decade: D, placement, data_sha256: createHash('sha256').update(raw).digest('hex'),
    data_build: G.meta.v, manager: m, formation: f, source_counts: C, source_cards: finalRefs,
    draft_club_decades: history, parameters: E.P,
    squad: [...T.xi, ...T.bn].map((c, i) => ({ place: i < 11 ? `${i + 1}: ${S[i].s}` : `Bench ${i - 10}`,
      id: c.id, player: c.nm, club: G.clubs[c.cq]?.nm || c.cq, card_decade: c.D,
      positions: c.pos.join(', '), base_rating: c.r, tier: TI(c.r), source: c.src, tags: JSON.stringify(c.tg) })),
    starters: R.xi.map(p => ({ slot: p.s, id: p.c.id, player: p.c.nm, base_rating: p.c.r,
      source: p.c.src, card_decade: p.c.D, fit_label: p.lab, position_loss: p.f,
      era_multiplier: p.e, chemistry_points: p.b, adjusted_rating: p.a })),
    bench: R.bn.filter(Boolean).map(p => ({ id: p.c.id, player: p.c.nm, base_rating: p.c.r,
      source: p.c.src, card_decade: p.c.D, position_loss: 0, era_multiplier: p.e, adjusted_rating: p.a })),
    lines: { attack: R.A, midfield: R.M, outfield_defence: R.Dd, keeper: R.K,
      keeper_weighted_defence: R.Dk, overall: R.ovr, attack_grade: R.gA,
      defence_grade: R.gD, signature_upgrade: R.up, knockout_boost: R.kb },
    season, player_stats: st,
    awards: { league: season.L.awards, cup: season.K.awards, honours: season.honours, longest_unbeaten: season.L.unbeaten },
    limitations: [
      'Club-decade squads contain qualifying supplied records and can be incomplete historical rosters.',
      'Whole-stint appearances and goals are apportioned across years; players in a decade squad may not have shared a season.',
      'FIFA/FC edition ratings, nearby extrapolations, EA reconstructions and fitted estimates have different evidence.',
      'Historical transfer of the rating estimate and modern match calibration remains an assumption.',
      'Position, era, formation, chemistry, tags, manager grades, absences and substitutions include declared game rules.',
      'The same modern league and Cup format applies in every decade; player events are simulated.',
    ],
  };
}

try {
  const x = JSON.parse(readFileSync(0, 'utf8') || '{}');
  process.stdout.write(JSON.stringify(execute(x), (_, v) => v instanceof Map ? [...v.values()] : v));
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exitCode = 1;
}
