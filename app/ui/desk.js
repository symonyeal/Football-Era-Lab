// Draft workspace and lineup review: squad, pitch with formation control, and dashboard on one screen.
//
// Legend
//   S draft; T team; Q its rating; SH formation slots; P previewed draft (form(G, S, U.pv)); c selected card
//   V[i]    preview of the selected card in open slot i; b index of the best one
//   pool()  the revealed squad as rows {c, ok, why, own, best, lines, top}; best = [slot, value] over open
//           pitch slots, value the rating there after position fit and era (no links)
//   med(D)  medians of attack, midfield, defence and overall over the season decade's nineteen opponents
//   badge(f) the selected card's best open slot in formation f, or the change in overall for the XI
//   group(f) formation family for the catalogue list: recorded, four, three or five at the back, historical

import { TI, CAP, ct } from '../cap.js';
import * as E from '../engine/index.js';
import { form, team, preview, used, room, can, hydrate, shape } from '../draft.js';
import { U, esc, num, club, kv, tier, fitText, delta, pitch, links, mini, smap, rated, share, row, capTiles, segs, spell, IC, LINE, SRC, SRT, RANGE, pct } from './kit.js';

const MED = new Map();
export function med(D) {
  if (!MED.has(D)) {
    const F = U.F[D].slice(0, 19), L = F.map(c => E.rate(c.T, D)), m = k => L.map(r => r[k]).sort((a, b) => a - b)[9];
    MED.set(D, { A: m('A'), M: m('M'), D: m('Dd'), x: F.map(c => c.x) });
  }
  return MED.get(D);
}

export function pool() {
  const { G, S } = U, I = used(S), R = S.cap ? room(G, S) : null, SH = shape(G, S.f);
  return G.cards[S.combo].map(x => {
    const c = hydrate(G, { k: S.combo, p: x.p }), own = I.has(c.id), ok = !own && can(G, S, c.id), t = TI(c.r);
    const why = own ? 'In your squad' : ok ? '' : R && R[t] === 0 ? `${t} places full · ${CAP[t]} of ${CAP[t]} used` : 'Too few affordable picks would remain at this club';
    const e = E.em(c.D, S.D, c.tg?.tl || 0);
    let best = null;
    SH.forEach((x, i) => { if (S.slots[i]) return; const v = Math.round(c.r * (1 - E.ft(c, x.s).f) * e); if (!best || v > best[1]) best = [x.s, v]; });
    const top = rated(c, S.D).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { c, ok, why, own, best, top, lines: new Set([...c.pos.map(p => LINE[p]), ...top.map(([s]) => LINE[s])]) };
  });
}

const SORT = { fit: (a, b) => (b.best?.[1] ?? 0) - (a.best?.[1] ?? 0) || b.c.r - a.c.r, rating: (a, b) => b.c.r - a.c.r,
  name: (a, b) => a.c.nm.localeCompare(b.c.nm), apps: (a, b) => b.c.n - a.c.n || b.c.r - a.c.r };
const SL_ = { fit: 'best open slot', rating: 'base rating', name: 'name', apps: 'appearances' };

export function rosterList() {
  const { G, S } = U, m = G.managers.find(m => m.nm === S.manager.nm), sig = new Set(m.sig), q = U.q.trim().toLowerCase();
  const bo = S.slots.slice(11).some(r => !r);
  const all = pool(), hit = r => (!q || `${r.c.nm} ${r.c.pos.join(' ')} ${r.top.map(t => t[0]).join(' ')}`.toLowerCase().includes(q)) &&
    (U.ln === 'All' || r.lines.has(U.ln)) && (!U.fit || bo || (r.best && r.best[1] >= 0.95 * r.top[0][1]));
  const L = all.filter(hit).sort(SORT[U.sort] || SORT.fit), A = L.filter(r => r.ok), B = L.filter(r => !r.ok && !r.own), O = L.filter(r => r.own);
  const first = (U.sel && L.find(r => r.c.id === U.sel)) || A[0] || L[0];
  const one = r => row(r.c, { ok: r.ok, own: r.own, why: r.why, best: r.best, sig: sig.has(r.c.id), sel: U.sel === r.c.id, entry: r === first, Ds: S.D });
  if (!L.length) return `<p class="empty">No ${U.ln !== 'All' ? `${U.ln} ` : ''}player matches${q ? ` “${esc(U.q)}”` : ' these filters'}. <button type="button" class="link" id="clear-filters">Clear filters</button></p>`;
  const why = [...new Set(B.map(r => r.why.split(' · ')[0]))].map(w => `${w}: ${B.filter(r => r.why.startsWith(w)).map(r => esc(r.c.nm.split(' ').at(-1))).join(', ')}`).join(' · ');
  return `<div class="gh"><span>Available · ${A.length}</span><span>Sorted by ${SL_[U.sort] || SL_.fit}</span></div>${A.map(one).join('') || '<p class="empty">No player here fits your remaining cap places.</p>'}
    ${B.length ? `<details class="blk" id="blocked"${U.open ? ' open' : ''}><summary>${IC.lock}<span>Blocked · ${B.length}</span><small>${why}</small></summary>${B.map(one).join('')}</details>` : ''}
    ${O.length ? `<div class="gh"><span>In your squad · ${O.length}</span></div>${O.map(one).join('')}` : ''}`;
}

function counts() {
  const n = { All: 0, GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const r of pool()) if (r.ok) { n.All++; for (const l of r.lines) n[l]++; }
  return n;
}

function squad() {
  const { G, S } = U;
  if (!S.combo) {
    return `<div class="reveal" id="reveal"><p class="eyebrow">Squad ${S.spin + 1} of 5</p><p class="rv-club" id="reveal-club">${S.spin ? 'The next squad' : 'Your first squad'}</p>
      <p class="small">Any club in the archive can appear; decades near your season and stronger squads come up more often, and no club appears twice in one draft.${S.cap ? ' Each squad includes a player from the best tier you still need.' : ''}</p>
      <button class="btn big" type="button" id="squad-spin">Draw squad ${S.spin + 1} →</button>
      ${S.history.length ? `<div class="drafted"><p class="lbl">Drafted from</p>${S.history.map(k => `<span class="chip" style="${kv(k.split(':')[0])}"><i class="kd"></i>${esc(club(k))}</span>`).join('')}</div>` : ''}</div>`;
  }
  const [q, d] = S.combo.split(':'), c = G.clubs[q], n = G.cards[S.combo].length, k = counts();
  return `<div class="sh" style="${kv(q)}"><div class="row"><p class="lbl">Squad ${S.spin + 1} of 5 · ${esc(c.cc)}</p><span class="dots" role="img" aria-label="${S.picked} of 3 picked">${[0, 1, 2].map(i => `<i class="${i < S.picked ? 'on' : ''}"></i>`).join('')}</span><span class="small">Pick ${S.picked + 1} of 3</span></div>
      <h2 class="club" id="squad-club">${esc(c.nm)}</h2>
      <div class="row"><span class="small">${d}s · ${n} cards · ${k.All} available</span><button class="btn q sm sp" type="button" id="squad-reroll" ${S.squadReroll >= 1 || S.picked ? 'disabled' : ''} aria-describedby="reroll-why">Re-spin · ${1 - S.squadReroll} left</button></div>
      <p class="small dim" id="reroll-why">${S.squadReroll >= 1 ? `Re-spin used${S.skip ? ` on ${esc(club(S.skip))}` : ''}.` : S.picked ? 'A re-spin is available only before your first pick from a squad.' : 'One re-spin per draft, before your first pick from a squad.'}</p></div>
    <div class="ctl"><label class="in">${IC.search}<span class="sr-only">Search name or position</span><input id="roster-search" type="search" placeholder="Name or position" value="${esc(U.q)}" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>
      <label class="sel"><span class="sr-only">Sort the squad</span><select id="roster-sort">${Object.entries({ fit: 'Best fit here', rating: 'Rating', name: 'Name', apps: 'Appearances' }).map(([v, l]) => `<option value="${v}" ${U.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="fcs" role="group" aria-label="Filter by line">${Object.entries(k).map(([l, v]) => `<button type="button" class="fc2" data-line="${l}" aria-pressed="${U.ln === l}">${l} <small>${v}</small></button>`).join('')}<label class="fc2 chk"><input type="checkbox" id="fit-only" ${U.fit ? 'checked' : ''}> Fits an open slot</label></div>
    <div class="list" id="roster-list" role="group" aria-label="${esc(c.nm)} ${d}s squad">${rosterList()}</div>`;
}

function review(T, Q) {
  const { G, S } = U, M = med(S.D), m = T.m;
  const gk = Q.xi.find(p => p.s === 'GK'), keep = T.bn.some(c => c?.pos.includes('GK'));
  const worst = Q.xi.filter(p => p.c).sort((a, b) => b.f - a.f)[0];
  const rank = 1 + M.x.filter(x => x > Q.ovr).length, sig = [...T.xi, ...T.bn].filter(c => c && m.sig.includes(c.id)).map(c => c.nm);
  const gap = [['Attack', Q.A, M.A], ['Midfield', Q.M, M.M], ['Defence', Q.Dd, M.D]].sort((a, b) => (a[1] - a[2]) - (b[1] - b[2]))[0];
  const ck = (ok, h, t) => `<li class="${ok === true ? 'ok' : ok === false ? 'no' : 'nb'}"><b>${ok === true ? '✓' : ok === false ? '⚠' : '▼'}</b><span><strong>${h}</strong><small>${t}</small></span></li>`;
  return `<div class="rev"><p class="eyebrow">Lineup review</p><h2>Before kick-off</h2>
    <ul class="checks">
      ${ck(!!gk?.c?.pos.includes('GK'), gk?.c?.pos.includes('GK') ? 'Keeper in goal' : 'An outfielder is in goal', gk?.c ? `${esc(gk.c.nm)}, ${num(gk.a)}` : 'The GK slot is empty')}
      ${ck(keep, keep ? 'Reserve keeper on the bench' : 'No reserve keeper', keep ? 'An absent keeper is replaced from the bench.' : 'An absent keeper is replaced by an outfielder at −75%.')}
      ${ck(!worst || worst.f < 0.1, worst && worst.f >= 0.1 ? `${esc(worst.c.nm)} loses ${pct(worst.f)}% at ${worst.s}` : 'No starter loses 10% or more', worst ? `Largest loss: ${esc(worst.c.nm)} ${fitText(worst.f)} at ${worst.s}.` : '')}
      ${S.cap ? ck(true, 'Salary cap met', '2 S · 4 A · 4 B · 3 C · 2 D') : ''}
      ${ck(Q.up ? true : null, Q.up ? 'Signature bonus on' : 'No signature player', Q.up ? `${sig.map(esc).join(', ')}: grades ${m.ga}/${m.gd} → ${Q.gA}/${Q.gD}.` : `Drafting one of ${esc(m.nm)}'s signature players raises both grades.`)}
      ${ck(gap[1] >= gap[2] ? true : null, gap[1] >= gap[2] ? 'Every line at or above the field median' : `${gap[0]} below the field`, `${gap[0]} ${num(gap[1])} against a ${S.D}s median of ${num(gap[2])}.`)}
    </ul>
    <p class="small opp">Overall ${num(Q.ovr)} ranks ${rank} of 20 in the ${S.D}s field (median ${num(M.x.slice().sort((a, b) => a - b)[9])}).</p>
    <details class="breakdown"><summary>Your ${S.D}s opposition: 19 club squads</summary><div class="tw"><table class="opp"><thead><tr><th>Club</th><th>Shape</th><th class="k">Strength</th></tr></thead>
      <tbody>${U.F[S.D].slice(0, 19).map(c => `<tr><td>${esc(c.nm)}</td><td>${esc(c.T.m.f || '')}</td><td class="k">${num(c.x)}</td></tr>`).join('')}</tbody></table></div>
      <p class="small">Each club plays its best eleven in its own manager's formation; your formation never changes theirs.</p></details>
    <button class="btn big" type="button" id="simulate" ${U.busy || U.pv ? 'disabled' : ''}>${U.busy ? 'Playing the season…' : 'Kick off · locks lineup and formation'}</button></div>`;
}

const group = (G, f, rec) => (rec.includes(f) ? 'rec' : /^(2-3-5|WM|Catenaccio)$/.test(f) ? 'hist' : { 4: 'four', 3: 'three', 5: 'five' }[f[0]] || 'four');
const GROUP = { rec: 'Recorded', four: 'Four at the back', three: 'Three at the back', five: 'Five at the back', hist: 'Historical' };

function badge(f, Q, txt) {
  const { G, S } = U;
  if (U.sel && S.combo) {
    const t = f === S.f ? S : form(G, S, f), SH = shape(G, f);
    let b = null;
    SH.forEach((x, i) => { if (t.slots[i]) return; const v = preview(G, t, U.sel, i); if (!b || v.a > b.a) b = { s: x.s, a: v.a }; });
    return b ? `${b.s} ${Math.round(b.a)}` : 'no open slot';
  }
  if (!S.slots.slice(0, 11).some(Boolean)) return '';
  if (f === S.f) return `Overall ${num(Q.ovr)}`;
  const d = E.rate(team(G, form(G, S, f)), S.D).ovr - Q.ovr;
  return txt ? `${d >= 0.05 ? '+' : d <= -0.05 ? '−' : '±'}${Math.abs(d).toFixed(1)}` : delta(d);
}

function bar(T, Q, lock) {
  const { G, S } = U, rec = T.m.f.filter(f => G.formations[f]), chips = [...new Set([S.f, ...rec])];
  const fam = Object.keys(G.formations).reduce((o, f) => ((o[group(G, f, rec)] ||= []).push(f), o), {});
  const lab = U.sel && S.combo ? `badges show ${esc(hydrate(G, { k: S.combo, p: U.sel }).nm)}'s best open slot` : 'badges show the change in overall';
  return `<div class="fbar"><p class="lbl">Formation · ${lab}</p><div class="fb" role="group" aria-label="Formation">
    ${chips.map(f => `<button type="button" class="fm ${f === S.f ? 'on' : ''} ${U.pv === f ? 'pv' : ''}" data-form="${esc(f)}" data-key="f:${esc(f)}" aria-pressed="${f === S.f}" ${lock ? 'disabled' : ''}>${mini(G, f)}<span><b>${esc(f)}</b><small>${rec.includes(f) ? 'Recorded · ' : ''}${badge(f, Q)}</small></span></button>`).join('')}</div>
    <label class="sel fsel"><span class="sr-only">All formations</span><select id="form-pick" ${lock ? 'disabled' : ''}><option value="">All ${Object.keys(G.formations).length} formations…</option>
      ${Object.entries(GROUP).filter(([g]) => fam[g]).map(([g, l]) => `<optgroup label="${l}">${fam[g].map(f => `<option value="${esc(f)}" ${U.pv === f ? 'selected' : ''}>${esc(f)}${f === S.f ? ' · current' : ` · ${badge(f, Q, true)}`}</option>`).join('')}</optgroup>`).join('')}</select></label></div>`;
}

export function desk() {
  const { G, S } = U, rv = S.phase === 'review', lock = S.phase === 'results';
  const T = team(G, S), Q = E.rate(T, S.D), SH = shape(G, S.f);
  const c = U.sel && S.combo ? hydrate(G, { k: S.combo, p: U.sel }) : null;
  const V = c ? SH.map((_, i) => (S.slots[i] ? null : preview(G, S, U.sel, i))) : [];
  const Vb = c ? [11, 12, 13, 14].map(i => (S.slots[i] ? null : preview(G, S, U.sel, i))) : [];
  const b = V.reduce((j, v, i) => (v && (j < 0 || v.a > V[j].a) ? i : j), -1);
  const P = U.pv ? form(G, S, U.pv) : null, TP = P && team(G, P), QP = P && E.rate(TP, S.D), SP = P && shape(G, P.f);
  const pos = s => new Map(s.slots.slice(0, 11).map((r, i) => [r?.p, i]).filter(([p]) => p));
  const was = pos(S), now = P ? pos(P) : was, moved = P ? [...now].filter(([p, i]) => SH[was.get(p)].s !== SP[i].s || Math.hypot(SH[was.get(p)].x - SP[i].x, SH[was.get(p)].y - SP[i].y) > 1).map(([p]) => p) : [];
  const VS = P ? SP : SH, VQ = P ? QP : Q;
  const cells = VS.map((x, i) => {
    const p = VQ.xi[i];
    if (p.c) return { kind: 'f', nm: p.c.nm, a: p.a, t: TI(p.c.r), q: p.c.cq, f: p.f, on: U.sw === i, moved: P ? moved.includes(p.c.id) : U.moved.has(p.c.id),
      label: `${x.s}, ${p.c.nm}, adjusted ${num(p.a)}, ${fitText(p.f)}${p.b ? `, +${p.b} links` : ''}. ${U.sw === i ? 'Selected: choose another place.' : 'Select to move or swap.'}` };
    const v = !P && V[i];
    if (v) return { kind: 'p', v: v.a, f: v.f, b: v.b, best: i === b, label: `${x.s}, open. ${c.nm} would rate ${num(v.a)}: fit loss ${pct(v.f)}%, era loss ${pct(1 - v.e)}%, +${v.b} links. Squad overall ${num(v.ovr)}.${v.up ? ' Manager signature bonus active.' : ''}` };
    return { kind: 'e', label: `${x.s}, open.${c ? '' : ' Select a squad player first.'}` };
  });
  const ghosts = P ? moved.map(p => { const i = was.get(p), r = Q.xi[i]; return { x: SH[i].x, y: SH[i].y, a: r.a, nm: r.c.nm, q: r.c.cq }; }) : [];
  const arrows = P ? moved.map(p => [SH[was.get(p)].x, SH[was.get(p)].y, SP[now.get(p)].x, SP[now.get(p)].y]) : [];
  const entry = b >= 0 ? b : U.sw !== null && U.sw < 11 ? U.sw : Math.max(0, VQ.xi.findIndex(p => p.c));
  const bench = T.bn.map((x, j) => {
    const i = j + 11, r = Q.bn[j], v = Vb[j];
    const lab = x ? `Bench ${j + 1}, ${x.nm}, ${num(r.a)}. ${U.sw === i ? 'Selected: choose another place.' : 'Select to move or swap.'}` : v ? `Bench ${j + 1}, open. ${c.nm} would rate ${num(v.a)}: no fit loss on the bench, era loss ${pct(1 - v.e)}%, +0 links. Squad overall ${num(v.ovr)}.` : `Bench ${j + 1}, open.`;
    return `<button type="button" class="bs ${x ? 'f' : v ? 'p' : ''} ${U.sw === i ? 'on' : ''}" data-slot="${i}" data-key="s:${i}" aria-label="${esc(lab)}" ${lock || P ? 'disabled' : ''} style="${x ? kv(x.cq) : ''}">
      <span class="v">${x ? Math.round(r.a) : v ? Math.round(v.a) : '+'}</span><span class="t"><b>${x ? esc(x.nm) : `Bench ${j + 1}`}</b><small>${x ? `${tier(TI(x.r), 'sm')} ${esc(x.pos.join(' · '))}` : v ? 'No fit loss' : 'Open'}</small></span></button>`;
  }).join('');
  const n = S.slots.filter(Boolean).length;
  const ins = c ? `<strong>${esc(c.nm)} · ${TI(c.r)} tier · ${num(c.r)} base</strong> selected. Choose a place; the values include position fit, era and links.${T.m.sig.includes(c.id) ? ' A signature player: drafting him raises both manager grades.' : ''}`
    : U.sw !== null ? 'Choose another place to move or swap, or the same place to cancel.'
      : P ? 'Previewing a formation: apply it or keep your current one.'
        : rv ? 'Your fifteen are drafted. Swap places or change formation, then kick off.' : 'Select a squad player, then a place. Select two places to swap them.';
  const pvb = P ? `<div class="pvb" id="form-status" tabindex="-1" role="status"><div><b>Preview ${esc(P.f)} · ${moved.length} player${moved.length === 1 ? ' moves' : 's move'}</b>
      <small>Overall ${num(Q.ovr)} → ${num(QP.ovr)} · attack ${delta(QP.A - Q.A)} · midfield ${delta(QP.M - Q.M)} · defence ${delta(QP.Dd - Q.Dd)}</small></div>
      <button class="btn q sm" type="button" id="form-cancel">Keep ${esc(S.f)}</button><button class="btn sm" type="button" id="form-apply">Apply ${esc(P.f)}</button></div>` : '';
  return `<div class="ws ${rv ? 'rv' : ''}" data-view="${U.view}">
    <div class="seg2 mob" role="tablist" aria-label="Workspace view"><button type="button" role="tab" data-view="squad" aria-selected="${U.view === 'squad'}">${rv ? 'Review' : `Squad${S.combo ? ` · ${counts().All}` : ''}`}</button><button type="button" role="tab" data-view="lineup" aria-selected="${U.view === 'lineup'}">Lineup · ${n}/15</button></div>
    <section class="col squad pn" id="squad" aria-label="${rv ? 'Lineup review' : 'Squad'}" tabindex="-1">${rv ? review(T, Q) : squad()}</section>
    <section class="col lineup" id="pitch" aria-label="Lineup" tabindex="-1">${bar(T, Q, lock)}${pvb}
      <div class="pitch-wrap">${pitch(VS, cells, { mode: 'play', links: links(VS, VQ.xi.map(p => p.c)), ghosts, arrows, entry, lock: lock || !!P, label: `Your ${VS === SH ? S.f : P.f}` })}</div>
      <div class="bn" role="group" aria-label="Bench">${bench}</div>
      <p class="ins" id="lineup-instruction" role="status">${ins}</p></section>
    <aside class="col dash" aria-label="Draft status">${dash(T, Q, c, V, b, P ? { P, QP, moved, was, now, SH, SP } : null)}</aside>
    ${c && !rv ? sheet(c, SH, V, Vb, b) : ''}
    <div class="bb">${mcap()}<div class="bb-act">${rv ? `<button class="btn" type="button" data-act="simulate" ${U.busy || U.pv ? 'disabled' : ''}>Kick off →</button>` : !S.combo ? `<button class="btn" type="button" data-act="spin">Draw squad ${S.spin + 1} →</button>` : U.view === 'squad' ? `<button class="btn q" type="button" data-view="lineup">Lineup · ${n}/15</button>` : '<button class="btn q" type="button" data-view="squad">Back to the squad</button>'}</div></div>
  </div>`;
}

function mcap() {
  const { G, S } = U;
  if (!S.cap) return '<p class="small">Classic: no tier limits</p>';
  const n = ct(G, S.slots);
  return `<div class="mcap" aria-label="Cap places left">${Object.keys(CAP).map(t => `<span>${tier(t, 'sm')}<b>${CAP[t] - n[t]}</b></span>`).join('')}</div>`;
}

function dash(T, Q, c, V, b, pv) {
  const { G, S } = U, m = T.m, sp = spell(S), n = S.slots.filter(Boolean).length, M = med(S.D);
  const sig = [...T.xi, ...T.bn].filter(x => x && m.sig.includes(x.id)).map(x => x.nm);
  const tm = `<section class="tm" style="${kv(sp?.q)}" aria-label="Your team"><p class="lbl">Your team</p><p class="tm-nm">${esc(m.nm)}</p><p class="small">${sp ? `${esc(sp.club)} · ${sp.yrs}` : 'Career (saved before club spells)'}</p>
    <div class="row"><div class="gr"><span>Att <b>${Q.gA}</b></span><span>Def <b>${Q.gD}</b></span></div><p class="small">${Q.up ? `${m.ga}/${m.gd} → ${Q.gA}/${Q.gD} with ${esc(sig[0])}${sig.length > 1 ? ` +${sig.length - 1}` : ''}` : 'A signature player raises both one step'}</p></div></section>`;
  const nt = ct(G, S.slots), seq = Object.keys(CAP).flatMap(t => Array(nt[t]).fill(t));
  const cap = S.cap ? `<section class="capb" aria-label="Salary cap: places left by tier"><div class="row"><p class="lbl">Salary cap</p><span class="small sp">${15 - n ? `${15 - n} place${15 - n === 1 ? '' : 's'} left` : 'Cap met'}</span></div>${capTiles(nt)}${segs(seq)}<p class="small dim">Tier is the base rating, before position, era and links.</p></section>`
    : '<section class="capb classic"><p class="lbl">Classic draft</p><p class="small">Any tier can fill an open place.</p></section>';
  const cnt = `<section class="cnt" aria-label="Progress"><div><b>${Math.min(5, S.spin + (S.combo ? 1 : 0))} / 5</b><span>Squads</span></div><div><b>${n} / 15</b><span>Players</span></div><div><b>${1 - S.squadReroll}</b><span>Re-spin left</span></div></section>`;
  const SH = shape(G, S.f), open = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  SH.forEach((x, i) => { if (!S.slots[i]) open[LINE[x.s]]++; });
  const bo = [11, 12, 13, 14].filter(i => !S.slots[i]).length;
  const need = `<section class="need" aria-label="Open places"><p class="lbl">Open places · ${S.f}</p><p class="small">${Object.entries(open).filter(([, v]) => v).map(([l, v]) => `<b>${l} ${v}</b>`).join(' · ') || 'Every starting place is filled'}${bo ? ` · bench ${bo}` : ''}</p></section>`;
  const lines = `<section class="lines" aria-label="Line strengths against the ${S.D}s field"><p class="lbl">Lines against the ${S.D}s median${S.slots.slice(1, 11).filter(Boolean).length < 4 ? ' · provisional' : ''}</p>
    ${[['Attack', Q.A, M.A], ['Midfield', Q.M, M.M], ['Defence', Q.Dd, M.D]].map(([l, v, m0]) => `<div class="lb"><span>${l}</span><i style="--w:${Math.max(0, Math.min(100, (v - 60) * 2.5))}%;--m:${Math.max(0, Math.min(100, (m0 - 60) * 2.5))}%"></i><b>${S.slots.slice(0, 11).some(Boolean) ? num(v) : '—'}</b></div>`).join('')}
    <p class="small dim">Bar: your line; mark: the median of the ${S.D}s opponents.</p></section>`;
  let body = lines;
  if (pv) {
    const mv = pv.moved.map(p => { const i = pv.was.get(p), j = pv.now.get(p), a = Q.xi[i], z = pv.QP.xi[j]; return `<li><span>${esc(a.c.nm)}</span><span>${pv.SH[i].s} → ${pv.SP[j].s}</span><b>${num(a.a)} → ${num(z.a)}</b></li>`; });
    body = `<section class="moves" aria-label="Who moves"><p class="lbl">Who moves in ${esc(pv.P.f)}</p><ul>${mv.join('') || '<li><span>Nobody changes role.</span></li>'}</ul><p class="small dim">Bench, cards and cap charges unchanged. Undo restores ${esc(S.f)} exactly.</p></section>${table(T, Q)}`;
  } else if (c) body = inspector(c, V, b);
  else if (S.phase === 'review') body = `${lines}${table(T, Q)}`;
  return `${tm}${cap}${cnt}${need}<div class="dash-body">${body}</div>`;
}

function table(T, Q) {
  const { G, S } = U, rec = T.m.f;
  if (!S.slots.slice(0, 11).some(Boolean)) return '';
  const R = Object.keys(G.formations).map(f => { const t = f === S.f ? S : form(G, S, f), q = f === S.f ? Q : E.rate(team(G, t), S.D);
    return { f, q }; }).sort((a, b) => b.q.ovr - a.q.ovr);
  return `<section class="cmp" aria-label="Compare formations"><p class="lbl">Compare formations · this XI</p><div class="tw"><table><thead><tr><th>Shape</th><th class="k">Overall</th><th class="k">Att</th><th class="k">Mid</th><th class="k">Def</th></tr></thead>
    <tbody>${R.map(({ f, q }) => `<tr class="${f === S.f ? 'cur' : ''} ${U.pv === f ? 'pv' : ''}"><td><button type="button" class="link" data-form="${esc(f)}">${esc(f)}</button>${rec.includes(f) ? ' <i class="tg o">Rec.</i>' : ''}</td><td class="k">${f === S.f ? num(q.ovr) : delta(q.ovr - Q.ovr)}</td><td class="k">${delta(q.A - Q.A)}</td><td class="k">${delta(q.M - Q.M)}</td><td class="k">${delta(q.Dd - Q.Dd)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function inspector(c, V, b, inSheet = false) {
  const { G, S } = U, e = E.em(c.D, S.D, c.tg?.tl || 0), SH = shape(G, S.f), R = rated(c, S.D).sort((x, y) => y[1] - x[1]);
  const bs = b >= 0 ? SH[b].s : null, two = [...new Set([bs, ...R.map(r => r[0])].filter(Boolean))].slice(0, 2);
  const F6 = c.pos[0] === 'GK' ? ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'] : ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'];
  const tg = Object.entries(c.tg || {}).map(([k, v]) => ({ tl: `Timeless ${v === 1 ? 'I' : 'II'}`, mae: 'Maestro', tal: 'Talisman', rock: 'Rock', poa: 'Poacher', bg: `European champion ×${v}` })[k]).filter(Boolean);
  const st = c.st?.xmi >= 450 ? `xG ${(90 * c.st.xg / c.st.xmi).toFixed(2)} · xA ${(90 * c.st.xa / c.st.xmi).toFixed(2)} per 90` : c.st?.mi >= 450 ? `${(90 * c.st.g / c.st.mi).toFixed(2)} goals · ${(90 * c.st.a / c.st.mi).toFixed(2)} assists per 90` : '';
  const pin = U.cmp.filter(p => p !== c.id && G.cards[S.combo].some(x => x.p === p)).map(p => hydrate(G, { k: S.combo, p }));
  const cmp = pin.length ? `<div class="tw"><table class="cmpp"><thead><tr><th>Slot</th><th class="k">${esc(c.nm.split(' ').at(-1))}</th>${pin.map(x => `<th class="k">${esc(x.nm.split(' ').at(-1))}</th>`).join('')}</tr></thead><tbody>${R.slice(0, 6).map(([s, v]) => `<tr><td>${s}</td><td class="k">${v}</td>${pin.map(x => `<td class="k">${rated(x, S.D).find(r => r[0] === s)[1]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  return `<section class="insp" aria-label="${esc(c.nm)}"><div class="row top"><span class="big">${Math.round(c.r)}</span><div class="grow"><p class="pnm">${esc(c.nm)}</p><p class="small">${esc(club(`${c.cq}:${c.D}`))} · <span title="${esc(SRT[c.src] || SRT.e)}">${SRC[c.src] || SRC.e}</span></p></div>${tier(TI(c.r))}</div>
    ${smap(c, S.D, bs ? [bs] : [])}
    <dl class="kv"><dt>Listed</dt><dd>${c.pos.join(' · ')}</dd><dt>Best here</dt><dd>${b >= 0 ? `${bs} ${num(V[b].a)} · ${fitText(V[b].f)}` : 'No open pitch place'}</dd>
      <dt>Line share</dt><dd>${two.map(s => `${s} ${share(s)}`).join(' · ')} <span class="dim">att/mid/def</span></dd>
      <dt>Era</dt><dd>${c.D}s card, ${S.D}s season · ×${e.toFixed(2)}</dd>
      ${c.f6 ? `<dt>Face stats</dt><dd>${F6.map((l, i) => c.f6[i] != null ? `${l} ${c.f6[i]}` : '').filter(Boolean).join(' · ')}</dd>` : ''}
      ${tg.length ? `<dt>Tags</dt><dd>${tg.map(esc).join(' · ')}</dd>` : ''}
      <dt>Record</dt><dd>${c.n} apps · ${c.g} goals${st ? ` · ${st}` : ''}</dd>
      <dt>Source</dt><dd>${esc(SRT[c.src] || SRT.e)}</dd>
      ${U.G.managers.find(m => m.nm === S.manager.nm).sig.includes(c.id) ? '<dt>Manager</dt><dd>Signature player: drafting him raises both grades one step.</dd>' : ''}</dl>
    ${inSheet ? '' : `<div class="row"><button class="btn q sm" type="button" data-cmp="${esc(c.id)}">${U.cmp.includes(c.id) ? 'Unpin' : 'Pin to compare'}</button>${b >= 0 ? `<button class="btn sm grow" type="button" id="place-best">Place at ${bs} · ${Math.round(V[b].a)}</button>` : ''}</div>${cmp}`}</section>`;
}

function sheet(c, SH, V, Vb, b) {
  const t = U.tgt, v = t === null ? null : t < 11 ? V[t] : Vb[t - 11], Q = E.rate(team(U.G, U.S), U.S.D);
  const cells = SH.map((x, i) => (Q.xi[i].c ? { kind: 'f', nm: Q.xi[i].c.nm, a: Q.xi[i].a, t: TI(Q.xi[i].c.r), q: Q.xi[i].c.cq, f: Q.xi[i].f, label: `${x.s}, taken` }
    : { kind: 'p', v: V[i].a, f: V[i].f, b: V[i].b, best: i === b, on: t === i, label: `${x.s}: ${c.nm} would rate ${num(V[i].a)}, ${fitText(V[i].f)}` }));
  return `<div class="sheet" id="sheet" role="dialog" aria-label="${esc(`Place ${c.nm}`)}"><div class="handle" aria-hidden="true"></div>
    <div class="row top"><span class="big">${Math.round(c.r)}</span><div class="grow"><p class="pnm">${esc(c.nm)}</p><p class="small">${esc(club(`${c.cq}:${c.D}`))} · ${c.pos.join(' · ')}</p></div>${tier(TI(c.r))}<button type="button" class="iconbtn" id="sheet-close" aria-label="Close">×</button></div>
    <p class="small">${b >= 0 ? `Best here <b>${SH[b].s} ${Math.round(V[b].a)}</b><span class="phone-only">&nbsp;· tap a place, then confirm</span>` : 'Every pitch place is taken: choose a bench place'}</p>
    <div class="sheet-pitch">${pitch(SH, cells, { mode: 'sheet', sm: true, entry: b, label: `Places for ${c.nm}` })}</div>
    <div class="bn sm" role="group" aria-label="Bench places">${Vb.map((x, j) => `<button type="button" class="bs ${x ? 'p' : 'f'} ${t === j + 11 ? 'on' : ''}" data-target="${j + 11}" data-key="t:${j + 11}" ${x ? '' : 'disabled'} aria-label="${x ? `Bench ${j + 1}: ${num(x.a)}, no fit loss` : `Bench ${j + 1}, taken`}"><span class="v">${x ? Math.round(x.a) : '·'}</span><span class="t"><small>B${j + 1}</small></span></button>`).join('')}</div>
    <div class="sheet-insp" id="sheet-insp" hidden>${inspector(c, V, b, true)}</div>
    <div class="row"><button class="btn q" type="button" id="sheet-inspect" aria-controls="sheet-insp" aria-expanded="false">Details</button>${b >= 0 ? `<button class="btn q tablet" type="button" id="sheet-best">Place at ${SH[b].s} · ${Math.round(V[b].a)}</button>` : ''}<button class="btn grow" type="button" id="place-confirm" ${v ? '' : 'disabled'}>${v ? `Place at ${t < 11 ? SH[t].s : `bench ${t - 10}`} · ${Math.round(v.a)}` : 'Choose a place'}</button></div></div>`;
}
