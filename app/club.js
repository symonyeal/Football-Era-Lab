import * as E from './engine/index.js';
import { hydrate, shape } from './draft.js';

// Club seasons for the career: the real top flight of a season with your fifteen in your club's place, its
// real squads, and the domestic and European competitions of that country and year, played in two halves
// around the winter window. Rules and their simplifications: docs/MODEL.md (The club career).
//
// Legend
//   G archive (G.lg season tables, G.ec European Cup clubs, G.xn names outside the archive); lg league code;
//   s season start year; D = dec(s) its decade (the era for ratings and goal levels); q club id; you your
//   manager's name (never also a rival's); ban people in your squad, missing from every other squad
//   side       entrant {id, nm, T, x, cc, n (players whose stint covers s), si (stand-in), src (roster source)}
//   sg         card's distance in seasons from its club stint; rating provenance remains card.src
//   basis      stand-in rating basis: points (real league record), default (74), given (explicit rating)
//   squad()    people whose stint at q covers s; below NQ players or without a keeper, the club's nearest
//              players in time (stints within NEAR seasons, this or an adjacent decade), regulars first
//   boss()     the curated manager whose tenure at q covers s, else club staff in the decade's formation DF
//   standin()  a club the archive cannot field: fifteen squad players rated x from its real points per game
//   field()    the league in season s with you in q's place (the lowest-placed club's when q was not in
//              that top flight); stand-ins rated by a least-squares fit of strength on real points per game
//   NAME       competition names by country with the seasons held; EUR European competitions by season;
//   fmt()      formats: ko1 single ties (byes for top seeds), ko2 two-legged ties, g groups of four then
//              two-legged ties; fl legs in the final (1 neutral, 2 home and away), sl legs in the semi-finals
//   places()   European places from a previous table: ECN to the European Cup, UCN the next places to the
//              Fairs/UEFA Cup; BAN English clubs barred after Heysel (1985-86 to 1989-90, Liverpool 1990-91);
//              a barred club's place is lost, not passed down
//   xp()       expected points of a home side from the match model's goal means (Poisson, no absences)
//   project()  expected league points of every club; your projected rank sets the board's target()
//   season0()  a season's competitions with fields and seeds, the objective; sides() the entrants of one
//              half; halfPlay() plays it; par() your expected league points in it
//   K          competition state {k, nm, f, n, fl, sl, ent, al (alive), by (byes), R (rounds of ties), ch
//              (winner), ru (runner-up), gr/gt/gm (groups, tables, matchdays played)};
//              tie {A, B, g (legs from A's side), agg, w, et, pw, rd}
//   match      your match record {k, rd, h ('H' | 'A' | 'N'), op, gf, ga, et, pw [yours, theirs] | null,
//              wk (week, for order), sc [[minute, yours 1 | 0, scorer, assister]]}

export const dec = s => Math.floor(s / 10) * 10;
export const DF = { 1950: 'WM', 1960: '4-2-4', 1970: '4-3-3', 1980: '4-4-2', 1990: '4-4-2', 2000: '4-4-2', 2010: '4-2-3-1', 2020: '4-3-3' };
export const NQ = 15, NEAR = 3;
export const cname = (G, id) => G.clubs[id]?.nm || G.xn?.[id] || (String(id).startsWith('nm:') ? id.slice(3) : id);
export const rows = (G, lg, s) => G.lg?.[lg]?.S?.[s] || null;
export const pts3 = (G, lg, s) => (s >= (G.lg?.[lg]?.s3 ?? 1995) ? 3 : 2);
export const years = (G, lg, D) => Object.keys(G.lg?.[lg]?.S || {}).map(Number).filter(s => dec(s) === D).sort((a, b) => a - b);

// The league whose tables hold club q in the most seasons of decade D; else its country's league when that
// has seasons in D; null when neither does.
export function leagueOf(G, q, D) {
  let best = null, n = 0;
  for (const [lg, v] of Object.entries(G.lg || {})) {
    const k = Object.entries(v.S).filter(([s, R]) => dec(+s) === D && R.some(r => r[0] === q)).length;
    if (k > n) { n = k; best = lg; }
  }
  const cc = G.clubs[q]?.cc;
  return best || (cc && years(G, cc, D).length ? cc : null);
}

export function squad(G, q, s, ban = new Set()) {
  const D = dec(s), P = [];
  for (const d of [D, D - 10, D + 10]) {
    const k = `${q}:${d}`;
    for (const c of G.cards[k] || []) {
      if (ban.has(c.p)) continue;
      const t = s < c.a ? c.a - s : s > c.b ? s - c.b : 0;
      if (t <= NEAR) P.push({ k, c, t });
    }
  }
  P.sort((x, y) => x.t - y.t || y.c.n - x.c.n || y.c.r - x.c.r || (x.c.p < y.c.p ? -1 : 1));
  const seen = new Set(), out = [];
  let gk = 0, n = 0;
  for (const x of P) {
    if (seen.has(x.c.p)) continue;
    const k = x.c.pos.includes('GK');
    if (x.t > 0 && out.length >= NQ && (gk > 0 || !k)) continue;
    seen.add(x.c.p); out.push(x); gk += k; n += !x.t;
  }
  return out.length < NQ || !gk ? null : { Q: out.map(x => ({ ...hydrate(G, { k: x.k, p: x.c.p }), sg: x.t })), n };
}

export function boss(G, q, s, you) {
  const m = G.managers.find(m => m.nm !== you && m.t.some(([c, a, b]) => c === q && a <= s && s <= b));
  const f = m?.f.find(f => G.formations[f]);
  return m && f ? { nm: m.nm, f, ga: m.ga, gd: m.gd, sig: m.sig } : { nm: 'Club staff', f: DF[dec(s)], ga: 'C', gd: 'C', sig: [] };
}

const CACHE = new WeakMap();
export function side(G, q, s, ban = new Set(), you = '') {
  if (!CACHE.has(G)) CACHE.set(G, new Map());
  const M = CACHE.get(G), key = `${q}|${s}|${you}|${E.hs([...ban].sort().join(','))}`;
  if (M.has(key)) return M.get(key);
  if (M.size > 4000) M.clear();
  const D = dec(s), sq = G.clubs[q] ? squad(G, q, s, ban) : null;
  let o = null;
  if (sq) {
    const m = boss(G, q, s, you), S = shape(G, m.f), T = { m, S, ...E.best(sq.Q, S, D) };
    o = { id: q, nm: cname(G, q), T, x: E.rate(T, D).ovr, cc: G.clubs[q].cc, n: sq.n, src: [...T.xi, ...T.bn].some(c => c?.sg > 0) ? 'nearby' : 'season' };
  }
  M.set(key, o);
  return o;
}

export function standin(G, id, s, x, cc, basis = 'given') {
  const D = dec(s), S = shape(G, DF[D]);
  const c = (u, i) => ({ id: `si:${id}:${i}`, nm: 'Squad player', pos: [u], r: x, D, src: 'standin', tg: {}, duo: [], cq: null });
  const T = { m: { nm: 'Club staff', f: DF[D], ga: 'C', gd: 'C', sig: [] }, S, xi: S.map((u, i) => c(u.s, i)), bn: ['GK', 'CB', 'CM', 'ST'].map((u, i) => c(u, 11 + i)) };
  return { id, nm: cname(G, id), T, x: E.rate(T, D).ovr, cc, n: 0, si: true, src: 'standin', basis };
}

const ppg = r => (3 * r[3] + r[4]) / Math.max(1, r[2]);
// Least-squares strength on real points per game over the clubs the archive fields; a slope of 6 rating points
// per point per game when fewer than four clubs (or no spread) inform it. Estimates stay within 55-90.
export function fit(B) {
  const n = B.length, mx = B.reduce((a, b) => a + b[0], 0) / Math.max(1, n), my = B.reduce((a, b) => a + b[1], 0) / Math.max(1, n);
  const vx = B.reduce((a, b) => a + (b[0] - mx) ** 2, 0), b = n >= 4 && vx > 1e-9 ? B.reduce((a, c) => a + (c[0] - mx) * (c[1] - my), 0) / vx : 6;
  const a = n ? my - b * mx : 74 - 6 * 1.36;
  return p => Math.max(55, Math.min(90, a + b * p));
}

export function field(G, lg, s, q, me, ban, you) {
  const R = rows(G, lg, s);
  if (!R) throw new Error(`The archive has no ${lg} table for ${s}.`);
  const ids = R.map(r => r[0]);
  if (!ids.includes(q)) ids[ids.length - 1] = q;
  const B = new Map();
  for (const id of ids) if (id !== q) { const t = side(G, id, s, ban, you); if (t) B.set(id, t); }
  const f = fit([...B.values()].map(t => [ppg(R.find(r => r[0] === t.id)), t.x]));
  return ids.map(id => (id === q ? me : B.get(id) || standin(G, id, s, f(ppg(R.find(r => r[0] === id))), lg, 'points')));
}

// A European or super-cup entrant outside the domestic field gets the same roster fallback. Without a
// league table there is no points-per-game estimate: 74 is an explicit design default, not a real rating.
function eside(G, id, s, ban, you, cc) {
  const c = side(G, id, s, ban, you);
  if (c) return c;
  cc ||= G.clubs[id]?.cc || G.ec?.[s]?.find(r => r[0] === id)?.[1];
  const R = rows(G, cc, s) || rows(G, cc, s - 1) || [], r = R.find(r => r[0] === id);
  const B = r ? R.map(r => { const c = side(G, r[0], s, ban, you); return c ? [ppg(r), c.x] : null; }).filter(Boolean) : [];
  return standin(G, id, s, r ? fit(B)(ppg(r)) : 74, cc, r ? 'points' : 'default');
}

export const NAME = {
  L: { ENG: [['First Division', 1950, 1991], ['Premier League', 1992, 9999]], ESP: [['La Liga', 1950, 9999]], ITA: [['Serie A', 1950, 9999]], GER: [['Bundesliga', 1963, 9999]],
    FRA: [['Division 1', 1950, 2001], ['Ligue 1', 2002, 9999]], NED: [['Eredivisie', 1956, 9999]], POR: [['Primeira Liga', 1950, 9999]] },
  C: { ENG: [['FA Cup', 1950, 9999]], ESP: [['Copa del Generalísimo', 1950, 1975], ['Copa del Rey', 1976, 9999]], ITA: [['Coppa Italia', 1958, 9999]],
    GER: [['DFB-Pokal', 1950, 9999]], FRA: [['Coupe de France', 1950, 9999]], NED: [['KNVB Cup', 1950, 9999]], POR: [['Taça de Portugal', 1950, 9999]] },
  LC: { ENG: [['League Cup', 1960, 9999]], ESP: [['Copa de la Liga', 1982, 1985]], GER: [['DFB-Ligapokal', 1997, 2007]], FRA: [['Coupe de la Ligue', 1994, 2019]], POR: [['Taça da Liga', 2007, 9999]] },
  SC: { ENG: [['Charity Shield', 1950, 2001], ['Community Shield', 2002, 9999]], ESP: [['Supercopa de España', 1982, 9999]], ITA: [['Supercoppa Italiana', 1988, 9999]],
    GER: [['DFB-Supercup', 1987, 1996], ['DFL-Supercup', 2010, 9999]], FRA: [['Trophée des Champions', 1955, 1973], ['Trophée des Champions', 1995, 9999]],
    NED: [['Johan Cruijff Schaal', 1991, 9999]], POR: [['Supertaça', 1979, 9999]] },
};
export const named = (k, lg, s) => (NAME[k][lg] || []).find(([, a, b]) => a <= s && s <= b)?.[0] || null;
export const EUR = {
  EC: s => (s >= 1992 ? 'Champions League' : s >= 1955 ? 'European Cup' : null),
  CW: s => (s >= 1960 && s <= 1998 ? 'Cup Winners\' Cup' : null),
  UC: s => (s >= 2009 ? 'Europa League' : s >= 1971 ? 'UEFA Cup' : s >= 1960 ? 'Fairs Cup' : null),
  US: s => (s >= 1973 ? 'UEFA Super Cup' : null),
};
export function fmt(k, s, lg) {
  if (k === 'EC') return s <= 1990 ? { f: 'ko2', n: 16, fl: 1 } : { f: 'g', n: s <= 1998 ? 16 : 32, fl: 1 };
  if (k === 'CW') return { f: 'ko2', n: 16, fl: 1 };
  if (k === 'UC') return { f: 'ko2', n: s <= 1965 ? 16 : 32, fl: s <= 1996 ? 2 : 1 };
  if (k === 'US') return { f: 'ko2', n: 2, fl: s <= 1997 ? 2 : 1 };
  if (k === 'SC') return { f: 'ko1', n: 2, fl: 1 };
  if (k === 'LC') return { f: 'ko1', fl: 1, sl: lg === 'ENG' ? 2 : 1 };
  return { f: 'ko1', fl: 1 };
}

export const ECN = (lg, s) => (s <= 1996 ? 1 : s <= 1998 ? 2 : ['ENG', 'ESP', 'ITA'].includes(lg) ? 4 : lg === 'GER' ? (s >= 2009 ? 4 : 3) : lg === 'FRA' ? 3 : 2);
export const UCN = (lg, s) => (s < 1960 ? 0 : ['ENG', 'ESP', 'ITA', 'GER'].includes(lg) ? 3 : 2);
export const BAN = (lg, s, q) => lg === 'ENG' && ((s >= 1985 && s <= 1989) || (s === 1990 && q === 'Q1130849'));

// European entrants of one league for season s from its previous season: T finishing order (ids), cup
// winner cw and runner-up cr, league cup winner lw (unknown: null). Without a known cup winner the Cup
// Winners' Cup takes the best-placed club not already entered. Returns {EC, CW, UC}, best placed first.
export function places(lg, s, T, cw, cr, lw) {
  const o = { EC: [], CW: [], UC: [] }, used = new Set();
  if (!T?.length) return o;
  const take = (k, id) => { if (id && !used.has(id)) { used.add(id); o[k].push(id); } };
  if (EUR.EC(s)) T.slice(0, ECN(lg, s)).forEach(id => take('EC', id));
  if (EUR.CW(s)) take('CW', cw ? (!used.has(cw) ? cw : cr) : T.find(id => !used.has(id)));
  if (EUR.UC(s)) {
    if (s >= 1999) take('UC', cw);
    if (lg === 'ENG' && s >= 1975) take('UC', lw);
    let n = Math.max(0, UCN(lg, s) - o.UC.length);
    for (const id of T) { if (!n) break; if (!used.has(id)) { take('UC', id); n--; } }
  }
  for (const k of ['EC', 'CW', 'UC']) o[k] = o[k].filter(id => !BAN(lg, s, id));
  return o;
}

// Expected points of A at home to B (w for a win, one for a draw): independent Poisson goals with the
// match model's means for the rated teams RA and RB.
const pmf = (l, n = 12) => { const p = [Math.exp(-l)]; for (let k = 1; k <= n; k++) p.push(p[k - 1] * l / k); return p; };
export function xp(RA, RB, Ds, w) {
  const a = pmf(E.lam(E.ln(RA), E.ln(RB), Ds, E.P.h)), b = pmf(E.lam(E.ln(RB), E.ln(RA), Ds, 0));
  let win = 0, dr = 0, loss = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) { const p = a[i] * b[j]; if (i > j) win += p; else if (i === j) dr += p; else loss += p; }
  const t = win + dr + loss;
  return [(w * win + dr) / t, (w * loss + dr) / t];
}
export function project(C, Ds, w) {
  const R = C.map(c => E.rate(c.T, Ds)), X = C.map(() => 0);
  for (let i = 0; i < C.length; i++) for (let j = 0; j < C.length; j++) {
    if (i === j) continue;
    const [a, b] = xp(R[i], R[j], Ds, w);
    X[i] += a; X[j] += b;
  }
  return X;
}
// The board's target from your projected rank r among n clubs: [place to reach, wording].
export function target(r, n) {
  const rel = n <= 16 ? 2 : 3;
  if (r <= 1) return [1, 'Win the league'];
  if (r <= 2) return [2, 'Finish in the top two'];
  if (r <= 4) return [4, 'Finish in the top four'];
  if (r <= 6) return [6, 'Finish in the top six'];
  if (r <= Math.floor(n / 2)) return [Math.floor(n / 2), 'Finish in the top half'];
  return [n - rel, 'Stay out of the relegation places'];
}

const RDN = { 2: 'Final', 4: 'Semi-final', 8: 'Quarter-final', 16: 'Round of 16', 32: 'Round of 32', 64: 'Round of 64' };
export const rdName = n => RDN[n] || 'First round';
const ko0 = (k, nm, ent, o) => ({ k, nm, ...o, n: ent.length, ent: ent.slice(), al: ent.slice(), by: null, R: [], ch: null, ru: null });

// Season s. P = previous season {tab: ids in finishing order, C and LC {w, r}, EC, CW, UC winners}; null in
// season one, which seeds from the real previous table and the real European Cup holder and has no super
// cups. key = the run's seed string. Returns the season object (saved with the run).
export function season0(G, key, lg, s, q, me, ban, you, P) {
  const D = dec(s), w = pts3(G, lg, s), C = field(G, lg, s, q, me, ban, you), by = E.I(C);
  const prevT = P?.tab || (rows(G, lg, s - 1) || []).map(r => r[0]);
  const seed = [...prevT.filter(id => by.has(id)), ...C.filter(c => !prevT.includes(c.id)).sort((a, b) => b.x - a.x).map(c => c.id)];
  const ord = E.sh(E.mk(E.hs(`${key}:lo:${s}`)), C.map(c => c.id));
  const X = project(C, D, w), mine = X[C.findIndex(c => c.id === q)], rk = 1 + X.filter(x => x > mine).length;
  const K = {}, cn = named('C', lg, s), lc = named('LC', lg, s), sc = named('SC', lg, s);
  if (cn) K.C = ko0('C', cn, seed, fmt('C', s, lg));
  if (lc) K.LC = ko0('LC', lc, seed, fmt('LC', s, lg));
  if (sc && P?.tab?.length && P.C?.w) {
    const a = P.tab[0], b = P.C.w !== a ? P.C.w : P.C.r || P.tab[1];
    if (a && b && a !== b) K.SC = ko0('SC', sc, [a, b], fmt('SC', s, lg));
  }
  const eu = europe(G, lg, s, q, me, ban, you, P, prevT);
  for (const k of ['EC', 'CW', 'UC']) if (eu[k].length >= 2) K[k] = ko0(k, EUR[k](s), eu[k], { ...fmt(k, s, lg), n: eu[k].length });
  const b = P ? (s <= 1999 ? P.CW : P.UC) : null;
  const barred = id => BAN(G.clubs[id]?.cc || eu.cc[id], s, id);
  if (EUR.US(s) && P?.EC && b && P.EC !== b && !barred(P.EC) && !barred(b)) K.US = ko0('US', 'UEFA Super Cup', [P.EC, b], fmt('US', s, lg));
  const [t, band] = target(rk, C.length);
  return { s, lg, D, w, q, ord, seed, K, cc: eu.cc, obj: { r: rk, t, band }, L: { md: 0, rows: ord.map(id => [id, 0, 0, 0, 0, 0, 0, 0]) },
    me: [], st: [], sy: [], h: 0 };
}

// European fields: every covered league's places from its previous table (yours from your own season,
// others from the records) and the holder; then clubs of other countries: that season's real European Cup
// entrants, else the strongest club-decades the archive fields. Each field keeps its n strongest, with you
// whenever you qualify. Returns {EC, CW, UC} ids and cc (club -> country) for the draws.
export function europe(G, lg, s, q, me, ban, you, P, prevT) {
  const out = { EC: [], CW: [], UC: [], cc: {} }, D = dec(s), taken = new Set(), cand = { EC: [], CW: [], UC: [] }, cc = {};
  const sideOf = id => (id === q ? me : eside(G, id, s, ban, you, cc[id]));
  const real = G.ec?.[s] || [];
  for (const l of Object.keys(G.lg || {})) {
    const T = l === lg ? prevT : (rows(G, l, s - 1) || []).map(r => r[0]);
    const p = l === lg ? places(l, s, T, P?.C?.w, P?.C?.r, P?.LC?.w) : places(l, s, T, null, null, null);
    T.forEach(id => { cc[id] = l; });
    // A full archived field identifies other leagues' actual participants. Late partial archives supply
    // known entrants while the finishing-table rule fills the remaining places.
    if (l !== lg && real.length >= 16) p.EC = real.filter(r => r[1] === l).map(r => r[0]);
    for (const k of ['EC', 'CW', 'UC']) cand[k].push(...p[k]);
  }
  const hold = P ? P.EC : (G.ec?.[s - 1] || []).find(r => r[2] === 6)?.[0];
  if (hold && EUR.EC(s) && !BAN(G.clubs[hold]?.cc, s, hold)) cand.EC.unshift(hold);
  const covered = new Set(Object.keys(G.lg || {}).filter(l => rows(G, l, s - 1)));
  for (const r of real) {
    cc[r[0]] = r[1];
    if (r[1] !== lg && (!covered.has(r[1]) || real.length < 16)) cand.EC.push(r[0]);
  }
  const xs = G.combos.filter(c => c.D === D && c.q !== q && !covered.has(G.clubs[c.q]?.cc)).sort((a, b) => a.k - b.k).map(c => c.q);
  for (const k of ['EC', 'CW', 'UC']) {
    if (!EUR[k](s)) continue;
    const n = fmt(k, s, lg).n, L = [];
    for (const id of [...cand[k], ...xs]) {
      if (taken.has(id) || L.some(c => c.id === id) || BAN(G.clubs[id]?.cc || cc[id], s, id)) continue;
      const c = sideOf(id);
      if (c) L.push(c);
    }
    const mine = cand[k].includes(q) && !taken.has(q) ? L.find(c => c.id === q) : null;
    const cap = fmt(k, s, lg).f === 'g' ? 4 * Math.floor(Math.min(n, L.length) / 4) : Math.min(n, L.length);
    const keep = L.filter(c => c.id !== q).sort((a, b) => b.x - a.x || (a.id < b.id ? -1 : 1)).slice(0, Math.max(0, cap - (mine ? 1 : 0)));
    const F = (mine ? [mine, ...keep] : keep).sort((a, b) => b.x - a.x || (a.id < b.id ? -1 : 1));
    if (F.length >= Math.min(n, 4)) { out[k] = F.map(c => c.id); F.forEach(c => { taken.add(c.id); out.cc[c.id] = c.cc; }); }
  }
  return out;
}

// Entrants of one half: the league field (your current team, squads without your current players) and every
// other club in a competition of the season.
export function sides(G, S, me, ban, you) {
  const by = E.I(field(G, S.lg, S.s, S.q, me, ban, you));
  for (const K of Object.values(S.K)) for (const id of K.ent) {
    if (by.has(id)) continue;
    const c = eside(G, id, S.s, ban, you, S.cc[id]);
    by.set(id, c);
  }
  return by;
}

const legs = (K, n) => (n === 2 ? K.fl : n === 4 && K.sl === 2 ? 2 : K.f === 'ko1' ? 1 : 2);
function koRound(r, K, by, D, cc) {
  const n = K.al.length, leg = legs(K, n), nm = rdName(n);
  const X = (a, b) => ['EC', 'CW', 'UC'].includes(K.k) && n > 8 && !!cc[a] && cc[a] === cc[b];
  let P;
  if (n & (n - 1)) {
    const b = E.bye(n);
    K.by = b.by.map(i => K.al[i]);
    P = E.pair(r, b.pl.map(i => K.al[i]), X);
  } else if (K.f === 'g' && !K.R.length) {
    const gi = id => K.gr.findIndex(g => g.includes(id)), W = E.sh(r, K.gt.map(g => g[0][0])), U = E.sh(r, K.gt.map(g => g[1][0]));
    // Greedy pairing can strand the last runner-up against his own group winner. Match the two pots
    // completely; country protection yields only when no complete protected draw exists.
    const go = (i, left, country) => {
      if (i === U.length) return [];
      for (const w of left) {
        if (K.gr.length > 1 && gi(w) === gi(U[i]) || country && X(w, U[i])) continue;
        const tail = go(i + 1, left.filter(id => id !== w), country);
        if (tail) return [[U[i], w], ...tail];
      }
      return null;
    };
    P = go(0, W, true) || go(0, W, false);
  } else P = E.pair(r, K.al, X);
  const T = P.map(([a, b]) => ({ ...E.ko(r, by.get(a), by.get(b), D, { legs: leg, neutral: n === 2 && leg === 1 }), rd: nm }));
  K.R.push(T);
  const win = new Set(T.map(t => t.w));
  K.al = [...(K.by || []), ...K.al.filter(id => win.has(id) && !(K.by || []).includes(id))];
  K.by = null;
  if (K.al.length === 1) { K.ch = K.al[0]; K.ru = T[0].A === K.ch ? T[0].B : T[0].A; }
  return T;
}

function groupDay(r, rD, K, by, D, w, j, cc) {
  if (!K.gr) {
    K.gr = E.groups(rD, K.al.map(id => by.get(id)), K.n / 4, (a, b) => !!a.cc && a.cc === cc[b.id]).map(q => q.map(c => c.id));
    K.gt = K.gr.map(q => q.map(id => [id, 0, 0, 0, 0, 0, 0, 0]));
    K.gm = 0;
  }
  const out = [];
  K.gr.forEach((q, i) => {
    const M = new Map(K.gt[i].map(x => [x[0], Object.assign(E.row0(x[0]), { P: x[1], W: x[2], D: x[3], L: x[4], GF: x[5], GA: x[6], Pts: x[7] })]));
    const R = E.lmd(r, q.map(id => by.get(id)), M, j, D, w);
    K.gt[i] = E.order([...M.values()]).map(x => [x.id, x.P, x.W, x.D, x.L, x.GF, x.GA, x.Pts]);
    out.push(...R.map(x => ({ ...x, rd: `Group ${String.fromCharCode(65 + i)}` })));
  });
  K.gm = j + 1;
  if (K.gm === 6) K.al = K.gt.flatMap(g => [g[0][0], g[1][0]]);
  return out;
}

const keyOf = (cl, id) => JSON.stringify([cl, id]);
const stIn = A => new Map(A.map(x => [keyOf(x[0], x[1]), { cl: x[0], id: x[1], g: x[2], as: x[3], cs: x[4], ap: x[5], k: !!x[6] }]));
const stOut = M => [...M.values()].map(v => [v.cl, v.id, v.g, v.as, v.cs, v.ap, v.k ? 1 : 0]);

// Plays half h (1 or 2) of season S in place with the entrants by id. Knockout rounds with more than eight
// clubs alive, and every group matchday, fall in the first half; the last eight onward in the second; super
// cups open the season. Records your matches, league statistics of every club (st) and your players'
// statistics in every competition (sy).
export function halfPlay(key, S, by, h) {
  if ((h !== 1 && h !== 2) || h !== S.h + 1) throw new Error('Play the next half of this season exactly once.');
  for (const id of new Set([...S.ord, ...Object.values(S.K).flatMap(k => k.ent)])) if (!by.get(id)?.T) throw new Error(`The season is missing entrant ${id}.`);
  const D = S.D, q = S.q, mine = [], stL = stIn(S.st), stY = stIn(S.sy.map(x => [q, ...x]));
  const mine1 = (M, A, B, k, rd, h0, wk) => {
    const a = A.id === q, t = new Map();
    E.note(t, M, A, B);
    for (const [kk, v] of t) if (v.cl === q) { const o = stY.get(kk); if (o) { for (const f of ['g', 'as', 'cs', 'ap']) o[f] += v[f]; o.k ||= v.k; } else stY.set(kk, { cl: q, id: v.id, g: v.g, as: v.as, cs: v.cs, ap: v.ap, k: v.k }); }
    mine.push({ k, rd, h: h0, op: a ? B.id : A.id, gf: a ? M.gx : M.gy, ga: a ? M.gy : M.gx, et: !!M.et, pw: M.pw ? (a ? [M.pw.x, M.pw.y] : [M.pw.y, M.pw.x]) : null, wk,
      sc: M.ev.map(e => [e.m, Number((e.t === 0) === a), e.sc || null, e.as || null]) });
  };
  const ties = (K, T, wk) => {
    for (const t of T) t.M.forEach((M, i) => {
      const A = by.get(i === 0 ? t.A : t.B), B = by.get(i === 0 ? t.B : t.A);
      if (A.id === q || B.id === q) mine1(M, A, B, K.k, t.rd, t.M.length === 1 && t.rd === 'Final' && K.fl === 1 ? 'N' : A.id === q ? 'H' : 'A', wk + 2 * i);
    });
  };
  if (h === 1) for (const k of ['SC', 'US']) {
    const K = S.K[k];
    if (K && !K.ch) ties(K, koRound(E.mk(E.hs(`${key}:k:${S.s}:${k}:0`)), K, by, D, S.cc), 0);
  }
  const C = S.ord.map(id => by.get(id)), n = 2 * (C.length % 2 ? C.length : C.length - 1), H = Math.ceil(n / 2);
  const rowsM = new Map(S.L.rows.map(x => [x[0], Object.assign(E.row0(x[0]), { P: x[1], W: x[2], D: x[3], L: x[4], GF: x[5], GA: x[6], Pts: x[7] })]));
  for (let md = h === 1 ? 0 : H; md < (h === 1 ? H : n); md++) {
    for (const x of E.lmd(E.mk(E.hs(`${key}:l:${S.s}:${md}`)), C, rowsM, md, D, S.w, stL)) {
      if (x.A === q || x.B === q) mine1(x.M, by.get(x.A), by.get(x.B), 'L', `Matchday ${md + 1}`, x.A === q ? 'H' : 'A', 4 + Math.round(md * 72 / n));
    }
  }
  S.L.md = h === 1 ? H : n;
  S.L.rows = E.order([...rowsM.values()]).map(x => [x.id, x.P, x.W, x.D, x.L, x.GF, x.GA, x.Pts]);
  ['C', 'LC', 'EC', 'CW', 'UC'].forEach((k, pri) => {
    const K = S.K[k];
    if (!K) return;
    if (K.f === 'g' && h === 1) for (let m = K.gm || 0; m < 6; m++) {
      for (const x of groupDay(E.mk(E.hs(`${key}:g:${S.s}:${k}:${m}`)), E.mk(E.hs(`${key}:gd:${S.s}:${k}`)), K, by, D, S.s >= 1995 ? 3 : 2, m, S.cc)) {
        if (x.A === q || x.B === q) mine1(x.M, by.get(x.A), by.get(x.B), k, x.rd, x.A === q ? 'H' : 'A', 8 + 6 * m + pri);
      }
    }
    if (K.f === 'g' && (K.gm || 0) < 6) return;
    while (!K.ch && K.al.length > 1 && (h === 2 || K.al.length > 8)) {
      const j = K.R.length, n0 = K.al.length;
      ties(K, koRound(E.mk(E.hs(`${key}:k:${S.s}:${k}:${j}`)), K, by, D, S.cc), h === 1 ? 10 + 8 * j + pri : n0 <= 2 ? 78 + pri : n0 <= 4 ? 64 + pri : 50 + pri);
    }
  });
  for (const K of Object.values(S.K)) for (const R of K.R) for (const t of R) delete t.M;
  S.me.push(...mine.sort((a, b) => a.wk - b.wk));
  S.st = stOut(stL);
  S.sy = stOut(stY).map(x => x.slice(1));
  S.h = h;
  return S;
}

// Your expected league points in half h, and the number of league matches it holds.
export function par(S, by, h) {
  const C = S.ord.map(id => by.get(id)), R = new Map(C.map(c => [c.id, E.rate(c.T, S.D)]));
  const n = 2 * (C.length % 2 ? C.length : C.length - 1), H = Math.ceil(n / 2), md = E.rr2(C.length);
  let x = 0, m = 0;
  for (let k = h === 1 ? 0 : H; k < (h === 1 ? H : n); k++) for (const [i, j] of md[k]) {
    const A = C[i].id, B = C[j].id;
    if (A !== S.q && B !== S.q) continue;
    const [a, b] = xp(R.get(A), R.get(B), S.D, S.w);
    x += A === S.q ? a : b; m++;
  }
  return [x, m];
}

// The real record for the review: club q's finish and points, that season's champions and European Cup.
export function history(G, lg, s, q) {
  const R = rows(G, lg, s) || [], i = R.findIndex(r => r[0] === q), ec = G.ec?.[s] || [];
  return { pos: i >= 0 ? i + 1 : null, pts: i >= 0 ? R[i][1] : null, n: R.length, champ: R[0]?.[0] || null,
    ecw: ec.find(r => r[2] === 6)?.[0] || null, ec: ec.find(r => r[0] === q)?.[2] ?? null };
}
