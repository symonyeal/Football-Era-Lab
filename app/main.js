import * as E from './engine/index.js';
import { STORE, DECADES, start, opts, choose, reroll, spin, place, swap, team, preview, valid, used, room, can } from './draft.js';
import { TI, CAP, ct } from './cap.js';
import { fields } from './data.js';
import * as Rn from './run.js';
import { wk, code, uncode, h2h } from './play.js';

// Browser game. G dataset; S saved draft (with S.mode for the challenge modes); F decade fields;
// R season result; C circuit result; H head-to-head result; D chosen simulation decade.
// sel selected roster person; sw selected swap slot; tab results tab; q/sort roster filter.
let G, S = null, F, R = null, C = null, H = null;
let sel = null, sw = null, tab = 'league', D = 1980, cap = true, q = '', sort = 'rating', busy = false, ev = 12, timer;
const root = document.querySelector('#game');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = n => (Number.isFinite(n) ? n.toFixed(1) : '—');
const rM = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const ord = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
const nm = p => G.people[p]?.nm || p;
const club = k => { const [qid, d] = k.split(':'); return `${G.clubs[qid]?.nm || qid} ${d}s`; };
const rules = s => s.cap ? 'Salary cap' : 'Classic';
const RANGE = { S: '90+', A: '85–89.9', B: '80–84.9', C: '75–79.9', D: 'below 75' };
const MAT = { S: 'amethyst', A: 'gold', B: 'emerald', C: 'sapphire', D: 'bronze' };
const tier = c => `<span class="tier-badge gem--${TI(c.r)}" title="${TI(c.r)} tier (${MAT[TI(c.r)]}): base rating ${RANGE[TI(c.r)]}">${TI(c.r)} TIER</span>`;
// Card effects by tier (Eraball): S and A sparkle and catch a sheen, B the sheen only; i staggers the sheen.
const fx = (t, i = 0) => (['S', 'A', 'B'].includes(t) ? `<span class="gem-fx" aria-hidden="true" style="--fx-d:${(i * 0.61 % 5).toFixed(2)}s"><i class="gem-sheen"></i>${t === 'B' ? '' : `<span class="gem-sparks">${'<i></i>'.repeat(10)}</span>`}</span>` : '');
const was = (t, t0) => (t !== t0 ? `<span class="slot-was" title="Base tier ${t0}; this place changes his rating">WAS ${t0}</span>` : '');
// Draft budget (CAP, every tier) or Gauntlet budget (GCAP: S and A limited, B to D counted).
function budget(s, charge = s.slots, lim = CAP) {
  if (!s.cap) return `<div class="cap-budget cap-budget--classic"><strong>${lim === CAP ? 'CLASSIC DRAFT' : 'CLASSIC RUN'}</strong><p>Any tier can fill an open place.</p></div>`;
  const n = ct(G, charge), run = lim !== CAP;
  return `<section class="cap-budget" aria-label="Salary cap: places left by tier"><div class="cap-heading"><strong>SALARY CAP</strong><span>${run ? 'Gauntlet: at most 2 S and 4 A among the fifteen' : 'All 15 players, including the bench'}</span></div>
    <div class="cap-counts">${Object.keys(CAP).map(t => {
      const r = t in lim ? lim[t] - n[t] : null;
      return `<div class="cap-count gem gem--${t} ${r === 0 ? 'cap-count--full' : ''}" data-cap-tier="${t}" ${r === null ? '' : `data-left="${r}"`} aria-label="${t} tier: ${r === null ? `${n[t]} held, no limit` : `${r} of ${lim[t]} places left`}"><b>${t}</b><span>${r === null ? `${n[t]} held` : `${r} / ${lim[t]} left`}</span><small>${r === null ? 'no limit' : `${n[t]} ${run ? 'held' : 'drafted'}`} · ${RANGE[t]}</small></div>`;
    }).join('')}</div>
    <p>Tier uses the base card rating, before position, era and link bonuses.${run ? ' A boosted player keeps the tier he was drafted or signed at.' : ''}</p></section>`;
}

// Sources, strengths and real stats on a card
const SRC = { f: 'EA FC', c: 'CM 01/02', i: 'ICON / HERO', n: 'EA NEAR', m: 'CM NEAR', e: 'ESTIMATED' };
const SRT = {
  f: 'EA FIFA / FC rating for this player at this club, from an edition inside the stint (FIFA 07 to FC 26).',
  c: 'Championship Manager 01/02 rating for this player at this club, put on the EA scale.',
  i: 'EA Icon / Hero card, adjusted for age in this decade.',
  n: 'EA rating from a season within two years of the stint, adjusted for age.',
  m: 'Championship Manager rating from a season within two years of the stint, adjusted for age.',
  e: 'Estimated by a model fitted on EA and CM ratings; no game database rates this player here.',
};
const source = s => `<span class="source source--${esc(s)}" title="${esc(SRT[s] || SRT.e)}">${SRC[s] || SRC.e}</span>`;
const F6 = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'], K6 = ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS'];
function sw6(c) {
  if (!c.f6) return '';
  const L = c.pos?.[0] === 'GK' ? K6 : F6;
  const z = c.f6.map((v, i) => [v, L[i]]).filter(([v]) => v != null).sort((a, b) => b[0] - a[0]);
  if (z.length < 3) return '';
  const lo = z.at(-1);
  return `<span class="sw" title="${esc(L.map((l, i) => `${l} ${c.f6[i] ?? '—'}`).join(' · '))}"><b>▲</b> ${z.slice(0, 2).map(([v, l]) => `${l} ${v}`).join(' ')} <b>▼</b> ${lo[1]} ${lo[0]}</span>`;
}
function per90(c) {
  const s = c.st;
  if (s?.xmi >= 450) return `xG ${(90 * s.xg / s.xmi).toFixed(2)} · xA ${(90 * s.xa / s.xmi).toFixed(2)} /90`;
  if (s?.mi >= 450) return `G ${(90 * s.g / s.mi).toFixed(2)} · A ${(90 * s.a / s.mi).toFixed(2)} /90`;
  return '';
}
const tags = c => Object.entries(c.tg || {}).map(([k, v]) => ({ tl: `Timeless ${v === 1 ? 'I' : 'II'}`, mae: 'Maestro', tal: 'Talisman', rock: 'Rock', poa: 'Poacher', bg: `European champion ×${v}` })[k]).filter(Boolean).join(' · ');

function notice(msg, error = false) {
  const n = $('#notice'); n.textContent = msg; n.hidden = false;
  n.classList.toggle('toast--error', error); clearTimeout(timer);
  timer = setTimeout(() => { n.hidden = true; }, error ? 9000 : 4000);
}
function save() {
  try { if (S) localStorage.setItem(STORE, JSON.stringify(S)); }
  catch { notice('This browser cannot save the run. Keep this page open or download your replay.', true); }
}
function change(next, msg) { S = next; sel = null; sw = null; q = ''; save(); render(); if (msg) notice(msg); }

function progress(a) {
  const st = ['Era', 'Manager', 'Squad', 'Season'];
  return `<nav class="progress" aria-label="Draft progress">${st.map((s, i) => `${i ? '<span class="connector" aria-hidden="true"></span>' : ''}<span class="${i < a ? 'done' : i === a ? 'active' : ''}" ${i === a ? 'aria-current="step"' : ''}><b>${i < a ? '✓' : i + 1}</b>${s}</span>`).join('')}
    <span class="run-meta">${S.wk ? `WEEKLY ${esc(S.wk)} · ` : ''}${rules(S)} · ${S.D}s · SEED ${S.seed}</span></nav>`;
}

// Start screen
function intro() {
  const L = ['Post-war pioneers', 'The golden age', 'Total football', 'European dynasties', 'A global game', 'The new generation', 'Modern greats', 'The next chapter'];
  const w = wk();
  return `<section class="hero"><div><span class="eyebrow">A DRAFT THROUGH FOOTBALL HISTORY</span>
      <h1>BUILD A TEAM.<br><em>Across time.</em></h1>
      <p class="hero-copy">Five different clubs. Fifteen of your choices. Balance star power, position fit and teammate connections, then take on the strongest clubs of your era.</p></div>
    <div class="hero-illustration" aria-hidden="true"><span class="hero-stamp">THE ERA XI / EST. 1950—2029</span><span class="intro-rule"></span><span class="hero-ball">✦</span><span class="hero-years"><span>1950</span><span>2020</span></span><span class="hero-caption">FIVE CLUBS. FIFTEEN CHOICES.</span></div></section>
  <section class="setup" aria-label="Start a draft"><div>
      <div class="section-title"><h2>CHOOSE YOUR ERA</h2><p>Your opponents live here.</p></div>
      <div class="decades">${DECADES.map((d, i) => `<button class="decade" data-era="${d}" aria-pressed="${D === d}"><strong>${d}s</strong><small>${L[i]}</small></button>`).join('')}</div>
      <button class="random-era" data-era="random" aria-pressed="${D === 'random'}">${D === 'random' ? '✓ ' : ''}Let fate choose my decade ↗</button></div>
    <form id="start-form" class="start-form"><fieldset class="draft-rules"><legend class="field-label">DRAFT RULES</legend>
      <label><input id="draft-cap" type="radio" name="draft-rules" value="cap" ${cap ? 'checked' : ''}><span><strong>Salary cap</strong><small>2 S · 4 A · 4 B · 3 C · 2 D</small></span></label>
      <label><input id="draft-classic" type="radio" name="draft-rules" value="classic" ${!cap ? 'checked' : ''}><span><strong>Classic</strong><small>No tier limits</small></span></label>
      <p class="help">The cap covers your eleven and all four substitutes.</p></fieldset><div><label class="field-label" for="seed">REPLAY SEED</label>
      <input class="seed-input" id="seed" name="seed" inputmode="numeric" autocomplete="off" value="${Math.floor(Math.random() * 4294967296)}" aria-describedby="seed-help">
      <p class="help" id="seed-help">Same seed, rules and choices = same run.</p></div>
      <button class="button" type="submit">Enter the draft <span aria-hidden="true">↗</span></button></form></section>
  <section class="weekly"><div><span class="eyebrow">THIS WEEK'S CHALLENGE · ${w.id}</span>
      <h2>${w.D}s · ONE SEED FOR EVERYONE</h2><p>Everyone uses Salary cap rules, the same managers and the same club order this week. Each squad must suit the tiers you still need, so after the first spin your picks steer which clubs you meet. Compare your season with friends.</p></div>
    <button class="button button--acid" id="weekly">Play the weekly challenge ↗</button></section>
  <div class="rules-strip"><div><strong>01 / THE MANAGER</strong><p>Pick one of five managers and a formation they used.</p></div><div><strong>02 / THE SQUADS</strong><p>Five different clubs, each offering a player from the best tier you still need. Choose three from each within your tier budget.</p></div><div><strong>03 / YOUR ELEVEN</strong><p>Place every player yourself. Keep four on the bench.</p></div><div><strong>04 / THE SEASON</strong><p>A 38-match league and a 16-club European Cup, then the Era Gauntlet.</p></div></div>
  <p class="roster-note"><label class="replay-label">Have a saved replay? <input id="import-replay" type="file" accept="application/json,.json"></label></p>`;
}

// Manager choice
function tenure(m) {
  return (m.t || []).filter(([qid]) => G.clubs[qid]).map(([qid, a, b]) => `${G.clubs[qid].nm} ${a}–${String(b).slice(2)}`).join(' · ');
}
function managers() {
  return `${progress(1)}<div class="page-heading"><div><span class="eyebrow">THE FIRST BIG DECISION</span><h1>WHO LEADS YOUR ERA XI?</h1>
      <p>Choose one manager and a formation he used. Drafting one of his signature players raises both his grades a step.</p></div>
    <button class="button button--quiet button--small" id="manager-reroll" ${S.managerRoll >= 2 ? 'disabled' : ''}>Re-spin managers ↻ <span>${2 - S.managerRoll} left</span></button></div>
  <section class="manager-grid" aria-label="Five manager and formation options">${opts(G, S).map((o, i) => {
    const m = G.managers.find(m => m.nm === o.nm), sig = m.sig.map(nm).filter(Boolean);
    return `<article class="manager-card" style="animation-delay:${i * 45}ms"><span class="manager-number">OPTION / 0${i + 1}</span>
      <div class="manager-glyph" aria-hidden="true">${esc(m.nm.split(' ').map(n => n[0]).slice(0, 2).join(''))}</div>
      <h2>${esc(m.nm)}</h2><p class="tenure">${esc(tenure(m) || 'Clubs outside this archive')}</p>
      <div class="formation-name">${esc(o.f)}</div><div class="grades"><span>ATTACK <b>${m.ga}</b></span><span>DEFENCE <b>${m.gd}</b></span></div>
      <p class="signature">SIGNATURE PLAYERS<br>${esc(sig.length ? sig.slice(0, 3).join(' · ') : 'None in this archive')}</p>
      <button class="button" data-manager="${i}">Choose manager ↗</button></article>`;
  }).join('')}</section>`;
}

// Draft: roster, pitch, bench
function lineup() {
  const T = team(G, S), Q = E.rate(T, S.D), n = S.slots.filter(Boolean).length, lock = S.phase === 'results';
  const pos = T.S.map((s, i) => {
    const p = Q.xi[i], c = p.c, v = sel && !c ? preview(G, S, sel, i) : null;
    const label = c ? `${s.s}, ${c.nm}, adjusted ${num(p.a)}. Select to swap.` : `${s.s}, empty.${v ? ` ${v.c.nm} would rate ${num(v.a)}: fit loss ${Math.round(v.f * 100)}%, era loss ${Math.round((1 - v.e) * 100)}%, +${v.b} links. Squad overall ${num(v.ovr)}.${v.up ? ' Manager signature bonus active.' : ''}` : ' Select a roster player first.'}`;
    const t = c ? TI(p.a) : null;
    return `<button class="pitch-slot ${sw === i ? 'selected' : ''} ${v ? 'preview' : ''}" data-slot="${i}" style="left:${s.x}%;top:${s.y}%" aria-label="${esc(label)}" title="${esc(label)}" ${lock ? 'disabled' : ''}>
      <span class="slot-circle ${c ? `slot-circle--filled gem gem--${t}` : ''}">${c ? Math.round(p.a) : v ? Math.round(v.a) : '+'}</span>
      <span class="slot-name">${esc(c ? c.nm.split(' ').slice(-1)[0] : v ? `${Math.round(v.f * 100)}% fit loss` : s.s)}</span>
      <span class="slot-role ${p.f > 0.02 ? 'fit-warning' : ''}">${c ? `${s.s} · ${t}${was(t, TI(c.r))}${p.f > 0.02 ? ` · −${Math.round(p.f * 100)}%` : ''}` : v ? `${v.b ? `+${v.b} links · ` : ''}−${Math.round((1 - v.e) * 100)}% era` : 'OPEN'}</span></button>`;
  }).join('');
  const bench = T.bn.map((c, j) => {
    const i = j + 11, v = sel && !c ? preview(G, S, sel, i) : null, t = c ? TI(Q.bn[j].a) : null;
    return `<button class="bench-slot ${c ? `gem gem--${t}` : ''} ${sw === i ? 'selected' : ''} ${v ? 'preview' : ''}" data-slot="${i}" ${lock ? 'disabled' : ''} aria-label="Bench ${j + 1}, ${c ? esc(c.nm) : 'empty'}">
      <span class="field-label">BENCH ${j + 1}${c ? ` · ${t}${was(t, TI(c.r))}` : ''}</span><b>${c ? Math.round(Q.bn[j].a) : v ? Math.round(v.a) : '+'}</b><span class="slot-name">${esc(c ? c.nm.split(' ').slice(-1)[0] : v ? 'No fit loss' : 'OPEN')}</span>${c ? fx(t, i) : ''}</button>`;
  }).join('');
  const selected = sel && G.cards[S.combo]?.find(c => c.p === sel);
  const ins = sel ? `<strong>${esc(nm(sel))} · ${TI(selected.r)} tier · ${num(selected.r)} base</strong> selected. Choose an empty slot; green numbers include position fit, era and links.${T.m.sig.includes(sel) ? ' He is a manager signature player: drafting him raises both manager grades.' : ''}`
    : sw !== null ? 'Choose another slot to swap with, or the same slot to cancel.'
      : lock ? 'Your final squad. The lineup is locked after kick-off.' : 'Select a roster player, then an empty slot. Select two filled slots to swap them.';
  const em = n === 0;
  return `<aside class="lineup-panel" aria-label="Your lineup"><div class="lineup-topline"><span>${esc(S.manager.nm)} / ${esc(S.manager.f)}</span><span>${n} / 15 PLAYERS</span></div>
    ${budget(S)}
    <div class="pitch" id="pitch"><div class="pitch-lines"><div class="penalty-box penalty-box--top"></div><div class="penalty-box penalty-box--bottom"></div></div>${pos}</div>
    <div class="bench">${bench}</div><div class="lineup-instruction" id="lineup-instruction" role="status">${ins}</div>
    <div class="lineup-scores"><div><span>OVERALL</span><b>${em ? '—' : num(Q.ovr)}</b></div><div><span>ATTACK</span><b>${em ? '—' : num(Q.A)}</b></div><div><span>MIDFIELD</span><b>${em ? '—' : num(Q.M)}</b></div><div><span>DEFENCE</span><b>${em ? '—' : num(Q.Dk)}</b></div></div>
    <p class="grade-note">Manager grades: attack ${Q.gA} · defence ${Q.gD}${Q.up ? ' · signature player bonus ↑' : ''}</p>${breakdown(Q)}</aside>`;
}
function breakdown(Q) {
  const row = (lab, p, b) => `<tr><td class="table-name">${lab} · ${esc(p.c.nm)} ${source(p.c.src)}</td><td>${num(p.c.r)}</td><td>${b ? '0' : Math.round(p.f * 100)}%</td><td>${Math.round((1 - p.e) * 100)}%</td><td>${b ? '—' : `+${p.b}`}</td><td>${num(p.a)}</td></tr>`;
  return `<details class="breakdown"><summary>Show the rating breakdown</summary><div class="table-wrap"><table><thead><tr><th>Slot / player</th><th>Base</th><th>Fit loss</th><th>Era loss</th><th>Links</th><th>Final</th></tr></thead>
    <tbody>${Q.xi.filter(p => p.c).map(p => row(p.s, p)).join('')}${Q.bn.filter(Boolean).map((p, i) => row(`B${i + 1}`, p, true)).join('')}</tbody></table></div>
    <p class="roster-note">Final = base × (1 − fit loss) × era factor + links. Fit loss comes from the player's own rating in that slot (EA's per-position ratings, or Championship Manager attributes on the same scale) when a game database rates him, else from how far the slot is from his natural position. Bench players have no fit loss.</p></details>`;
}
function rows() {
  const I = used(S), ql = q.toLowerCase(), r = S.cap ? room(G, S) : null;
  let Q = G.cards[S.combo].filter(c => `${nm(c.p)} ${c.pos.join(' ')}`.toLowerCase().includes(ql));
  const by = { name: (a, b) => nm(a.p).localeCompare(nm(b.p)), position: (a, b) => a.pos[0].localeCompare(b.pos[0]) || b.r - a.r, apps: (a, b) => b.n - a.n || b.r - a.r };
  Q = Q.slice().sort(by[sort] || ((a, b) => b.r - a.r));
  if (!Q.length) return '<p class="roster-empty">No players match your search.</p>';
  return Q.map((c, k) => {
    const t = tags(c), x = per90(c), taken = I.has(c.p), blocked = !can(G, S, c.p), sig = G.managers.find(m => m.nm === S.manager.nm).sig.includes(c.p);
    const why = taken ? 'Already in your squad' : r?.[TI(c.r)] === 0 ? `${TI(c.r)}-tier places full` : blocked ? 'Would block the remaining picks from this club' : '';
    return `<button class="player-row gem gem--${TI(c.r)} ${blocked ? 'player-row--blocked' : ''}" data-player="${esc(c.p)}" data-tier="${TI(c.r)}" aria-pressed="${sel === c.p}" ${blocked ? `disabled title="${esc(why)}"` : ''}>${blocked ? '' : fx(TI(c.r), k)}
      <b class="player-rating">${Math.round(c.r)}</b>
      <span><span class="player-name">${esc(nm(c.p))}</span>
        <span class="player-detail">${tier(c)}<span>${esc(c.pos.join(' / '))}</span>${source(c.s)}<span>${c.n} APPS · ${c.g} GOALS</span>${x ? `<span>${x}</span>` : ''}${sig ? '<span class="signature-badge">MANAGER SIGNATURE ↑</span>' : ''}</span>
        ${sw6(c) || t ? `<span class="tags">${sw6(c)}${t ? `${sw6(c) ? ' · ' : ''}${esc(t)}` : ''}</span>` : ''}</span>
      <span class="player-select">${taken ? 'IN SQUAD ✓' : blocked ? 'BLOCKED' : sel === c.p ? 'PICKED →' : 'PICK +'}</span>${why ? `<span class="blocked-reason">${esc(why)}</span>` : ''}</button>`;
  }).join('');
}
function roster() {
  if (S.phase === 'review') {
    const gk = team(G, S).xi[0]?.pos.includes('GK');
    return `<div class="review-copy"><span class="eyebrow">FIFTEEN PEOPLE. YOUR CHOICES.</span><h2>YOUR TEAM IS READY.</h2>
      <p>Eleven starters and four substitutes. Swap any two slots to adjust your shape before kick-off.</p>
      ${!gk ? '<p class="fit-warning">Your goal has an outfield player in it. You can swap in a keeper if you drafted one.</p>' : ''}
      <p>A 20-club league against the strongest club squads of the ${S.D}s, home and away, then a 16-club European Cup.</p>
      <button class="button" id="simulate" ${busy ? 'disabled' : ''}>${busy ? 'Playing the season…' : 'Kick off the season ↗'}</button></div>${opponents()}`;
  }
  if (!S.combo) {
    return `<div class="reveal-panel" id="reveal"><span class="eyebrow">SQUAD SPIN ${S.spin + 1} OF 5</span><span class="reveal-number">0${S.spin + 1}</span>
      <h2>${S.spin ? 'THE NEXT CHAPTER.' : 'OPEN YOUR FIRST SQUAD.'}</h2><p>Any club in the archive can appear; nearer eras and stronger squads come up more often. A club appears once in your five draws.${S.cap ? ' Each squad offers a player from the best tier you still need. Choose three while saving tier places for your next squads.' : ' Until you hold two S-tier and four A-tier players, each squad offers one. Choose any three and place each yourself.'}</p>
      <button class="button" id="squad-spin">Spin club + decade ↻</button></div>
      ${S.history.length ? `<p class="roster-note">Drafted from ${S.history.map(k => esc(club(k))).join(' · ')}</p>` : ''}`;
  }
  const [qid, d] = S.combo.split(':'), cl = G.clubs[qid], pool = G.cards[S.combo];
  return `<div class="roster-heading"><div class="roster-heading-row"><span class="eyebrow">SQUAD ${S.spin + 1} / 5</span><span class="club-country">${esc(cl.cc)} · ${d}s</span></div>
      <h2>${esc(cl.nm)}</h2><p>${pool.length} players · Choose three · Place them anywhere</p>
      <div class="pick-progress">${[0, 1, 2].map(i => `<span class="pick-dot ${i < S.picked ? 'pick-dot--done' : ''}" aria-hidden="true"></span>`).join('')}<span>${S.picked} / 3 PLACED</span></div></div>
    <div class="roster-controls"><label><span class="sr-only">Search name or position</span><input id="roster-search" type="search" placeholder="Search name or position…" value="${esc(q)}"></label>
      <label><span class="sr-only">Sort roster</span><select id="roster-sort">${[['rating', 'Rating ↓'], ['name', 'Name A–Z'], ['position', 'Position'], ['apps', 'Apps ↓']].map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="roster-list" id="roster-list" aria-label="Club squad">${rows()}</div>
    <div class="actions roster-actions"><button class="button button--quiet button--small" id="squad-reroll" ${S.squadReroll >= 1 || S.picked ? 'disabled' : ''}>Re-spin squad ↻ <span>${1 - S.squadReroll} left</span></button><span class="help">One re-spin per draft, before your first pick.</span></div>
    <p class="roster-note">${S.cap ? 'A blocked card is already drafted, its tier is full, or taking it would prevent you finishing this club’s three picks. ' : ''}▲ strengths and ▼ weakness are the player's face stats from his game card. A person can appear once in your squad.</p>`;
}
function opponents() {
  return `<details class="breakdown"><summary>Your ${S.D}s opposition: 19 club squads</summary><div class="table-wrap"><table><thead><tr><th>Club / decade</th><th>Strength</th></tr></thead>
    <tbody>${F[S.D].slice(0, 19).map(c => `<tr><td class="table-name">${esc(c.nm)}</td><td>${num(c.x)}</td></tr>`).join('')}</tbody></table></div>
    <p class="roster-note">Each club plays its best eleven in its manager's formation. The first fifteen also enter the European Cup.</p></details>`;
}
function draft() {
  const rv = S.phase === 'review';
  return `${progress(2)}<div class="page-heading"><div><span class="eyebrow">${rv ? 'THE LINEUP ROOM' : 'YOUR HISTORY, IN THE MAKING'}</span>
      <h1>${rv ? 'MAKE EVERY POSITION COUNT.' : 'FIVE SQUADS. YOUR FIFTEEN.'}</h1>
      <p>${rv ? 'Your shape decides attack, midfield and defence. Your bench covers absences and substitutions.' : `Playing in the ${S.D}s. Players from other decades lose a little rating the further they travel.`}</p></div>
    <span class="run-meta">${S.slots.filter(Boolean).length} / 15 DRAFTED · ${Math.min(5, S.spin + 1)} / 5 SQUADS</span></div>
  <div class="draft-layout"><section class="draft-roster" aria-label="Squad selection">${roster()}</section>${lineup()}</div>`;
}

// Season and results
const me = () => { const T = team(G, S); return { id: 'your-club', nm: 'Your Era XI', T, x: E.rate(T, S.D).ovr, me: true }; };
function season() {
  if (F[S.D]?.length < 19) throw new Error(`The ${S.D}s archive needs nineteen opposition squads.`);
  return E.run(E.hs(`${S.seed}:season`), me(), F[S.D].slice(0, 19), F[S.D].slice(0, 15), S.D);
}
function table(Q) {
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th class="table-name">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>PTS</th></tr></thead>
    <tbody>${Q.map((c, i) => `<tr class="${c.me || c.id === 'your-club' ? 'your-row' : ''}"><td>${i + 1}</td><td class="table-name">${esc(c.nm)}</td>${['P', 'W', 'D', 'L', 'GF', 'GA'].map(k => `<td>${c[k]}</td>`).join('')}<td>${c.GF - c.GA > 0 ? '+' : ''}${c.GF - c.GA}</td><td><b>${c.Pts}</b></td></tr>`).join('')}</tbody></table></div>`;
}
const stRows = st => [...(st instanceof Map ? st.values() : st || [])].map(p => ({ ...p, nm: p.nm || nm(p.id) })).sort((a, b) => b.g - a.g || b.as - a.as || b.cs - a.cs);
const clubName = id => (id === 'your-club' ? 'Your Era XI' : F[S.D].find(c => c.id === id)?.nm || id);
function awards(a = R.L.awards || {}, scope = 'League', name = clubName) {
  const L = [[`${scope} top scorer`, a.scorer, 'g', 'goals'], ['Assist leader', a.assists, 'as', 'assists'], ['Clean sheet leader', a.keeper, 'cs', 'clean sheets'], [`Player of the ${scope === 'League' ? 'season' : 'circuit'}`, a.player, 'ap', 'appearances']];
  return `<aside class="award-sidebar" aria-label="${scope} awards">${L.filter(([, p]) => p).map(([l, p, k, u]) => `<article class="stat-card"><span class="eyebrow">${l}</span><h3>${esc(p.nm || nm(p.id))}</h3><p>${p[k]} ${u} · ${esc(name(p.cl))}</p></article>`).join('')}</aside>`;
}
function fixtures() {
  return `<h2 class="result-section-title">YOUR 38 LEAGUE MATCHES</h2><div class="fixtures">${R.L.res.map(c => `<article class="fixture"><span class="fixture-round">MD ${c.rd}<br>${c.h ? 'HOME' : 'AWAY'}</span><b class="fixture-score">${c.gf}–${c.ga}</b><span class="fixture-op">${esc(c.op)}</span><span class="fixture-outcome ${c.gf > c.ga ? 'win' : c.gf < c.ga ? 'loss' : ''}">${c.gf > c.ga ? 'W' : c.gf < c.ga ? 'L' : 'D'}</span></article>`).join('')}</div>`;
}
function cupRounds(K) {
  return K.rounds.map((Q, i) => `<section class="cup-round"><h3>${E.RD[i] || `Round ${i + 1}`}</h3>${Q.map(t => `<div class="cup-tie ${t.A === 'your-club' || t.B === 'your-club' ? 'cup-tie--yours' : ''}"><div>${esc(t.an)}<br>${esc(t.bn)}<small>${t.legs.length === 2 ? `Two legs: ${t.legs[0].gx}–${t.legs[0].gy} / ${t.legs[1].gx}–${t.legs[1].gy}` : 'Neutral final'}${t.et ? ' · Extra time' : ''}${t.pw ? ' · Penalties' : ''} · Winner: ${esc(t.wn)}</small></div><strong>${t.agg[0]}–${t.agg[1]}</strong></div>`).join('')}</section>`).join('');
}
function stats() {
  return `<h2 class="result-section-title">LEAGUE PLAYER STATISTICS</h2><div class="table-wrap"><table><thead><tr><th>Player</th><th class="table-name">Club</th><th>APPS</th><th>GOALS</th><th>ASSISTS</th><th>CS</th></tr></thead>
    <tbody>${stRows(R.L.st).slice(0, 120).map(p => `<tr class="${p.cl === 'your-club' ? 'your-row' : ''}"><td class="table-name">${esc(p.nm)}</td><td class="table-name">${esc(clubName(p.cl))}</td><td>${p.ap}</td><td>${p.g}</td><td>${p.as}</td><td>${p.cs}</td></tr>`).join('')}</tbody></table></div>
    <p class="roster-note">Simulated appearances, goals and assists. Who scores follows each player's real scoring rate where his card has one.</p>`;
}
function results() {
  const i = R.L.tab.findIndex(c => c.me), t = R.L.tab[i], cup = R.K.champ === 'your-club';
  const hon = R.honours || [];
  const T = [['league', 'League table'], ['fixtures', 'Your matches'], ['cup', 'European Cup'], ['stats', 'Player stats'], ['lineup', 'Your XI'], ['gauntlet', 'Era Gauntlet'], ['more', 'More modes']];
  const body = { league: () => `<div class="results-layout"><div><h2 class="result-section-title">THE ${S.D}s ERA LEAGUE</h2>${table(R.L.tab)}<p class="roster-note">Double round robin · 3 points for a win · Ranked by points, goal difference, then goals scored.</p></div>${awards()}</div>`,
    fixtures, cup: () => `<h2 class="result-section-title">THE EUROPEAN CUP</h2>${cupRounds(R.K)}<p class="roster-note">Two legs through the semi-finals, a neutral final, extra time and penalties; no away-goals rule.</p>`,
    stats, lineup: () => `<div class="draft-layout"><div class="review-copy"><h2>YOUR FINAL SQUAD</h2><p>Base ratings, fit, era losses and links are all in the breakdown.</p></div>${lineup()}</div>`,
    gauntlet, more }[tab] || (() => '');
  return `${progress(3)}<section class="result-hero"><div><span class="eyebrow">THE ${S.D}s SEASON IS IN THE BOOKS</span>
      <h1>${i === 0 && cup ? 'A TEAM FOR THE AGES.' : i === 0 ? 'TOP OF THE LEAGUE.' : cup ? 'KINGS OF EUROPE.' : 'YOUR ERA. YOUR STORY.'}</h1>
      <p>${rules(S)} · ${esc(S.manager.nm)}'s ${esc(S.manager.f)} finished ${ord(i + 1)} of 20. ${cup ? 'Your fifteen won the European Cup.' : `The European Cup went to ${esc(R.K.champN)}.`}</p>
      <div class="honours">${hon.map(h => `<span class="honour">${esc(h)}</span>`).join('')}</div></div>
    <div class="result-metrics"><div><span>League place</span><b>${i + 1}<small> / 20</small></b></div><div><span>Points</span><b>${t.Pts}</b></div><div><span>Won · drawn · lost</span><b class="wdl">${t.W}·${t.D}·${t.L}</b></div><div><span>Best unbeaten run</span><b>${R.L.unbeaten}<small> games</small></b></div></div></section>
  <div class="results-tabs" role="tablist" aria-label="Season results">${T.map(([v, l]) => `<button role="tab" data-tab="${v}" aria-selected="${tab === v}" aria-controls="result-panel" id="tab-${v}">${l}</button>`).join('')}</div>
  <section id="result-panel" role="tabpanel" aria-labelledby="tab-${tab}">${body()}</section>
  <div class="share-strip"><p>${S.wk ? `Weekly challenge ${esc(S.wk)} · ` : ''}${rules(S)} · Seed ${S.seed} · ${S.D}s · Saved on this browser.</p><div class="actions">
    <button class="button button--small" id="share">Copy result ↗</button><button class="button button--quiet button--small" id="result-card">Result card ↓</button>
    <button class="button button--quiet button--small" id="download">Download replay ↓</button><button class="button button--quiet button--small" id="replay">Replay this seed ↻</button></div></div>`;
}

// Era Gauntlet run
const pips = p => `<span class="pips" role="img" aria-label="Patience ${p} of ${Rn.PAT_MAX}">${Array.from({ length: Rn.PAT_MAX }, (_, i) => `<i class="${i < p ? 'on' : ''}"></i>`).join('')}</span>`;
const charged = (s, p) => {
  const r = Rn.bill(G, s).find(r => r.p === p);
  return TI(G.cards[r.k].find(c => c.p === p).r);
};
function runSquad(s) {
  const T = Rn.runTeam(G, s), Q = E.rate(T, Rn.D_of(s));
  const charge = Rn.bill(G, s);
  return `${budget(s, charge, Rn.GCAP)}<details class="breakdown"><summary>Your squad in the ${Rn.D_of(s)}s · overall ${num(Q.ovr)}</summary><div class="table-wrap"><table><thead><tr><th>Slot</th><th class="table-name">Player</th><th>Card</th><th>Rating here</th></tr></thead>
    <tbody>${[...Q.xi, ...Q.bn.filter(Boolean).map((p, i) => ({ ...p, s: `B${i + 1}` }))].map(p => {
      const r = charge.find(r => r.p === p.c.id), c = G.cards[r.k].find(c => c.p === r.p);
      return `<tr><td>${p.s}</td><td class="table-name">${esc(p.c.nm)} ${tier(p.c)}${s.up[p.c.id] ? ` <span class="honour">BOOSTED${s.cap ? ` · ${TI(c.r)} CHARGE` : ''}</span>` : ''}</td><td class="table-name">${esc(club(`${p.c.cq}:${p.c.D}`))} · ${Math.round(p.c.r)}</td><td>${num(p.a)}</td></tr>`;
    }).join('')}</tbody></table></div></details>`;
}
const left = (s, c) => {
  const n = s.pat - c;
  return n < 1 ? '<p class="fit-warning">Not enough patience: the board keeps at least 1.</p>'
    : `<p class="help">Leaves ${n} patience${n <= Rn.B_LOSS(s.tries[s.act] + 1) ? ' — one boss loss would end the run' : ''}.</p>`;
};
function offerCard(o, j, s) {
  if (o.kind === 'boost') {
    return `<article class="reward reward--boost"><span class="eyebrow">BOOST CARD · ${o.cost} PATIENCE</span><h3>${esc(nm(o.from.p))}</h3>
      <p>${esc(club(o.from.k))} ${Math.round(o.from.r)} → <b>${esc(club(o.to.k))} ${Math.round(o.to.r)}</b></p><p class="help">He becomes his best version: the same person, a better card.${s.cap ? ` This earned boost keeps his original ${charged(s, o.from.p)}-tier charge.` : ''}</p>${left(s, o.cost)}
      <button class="button button--acid" data-take="${j}" ${s.pat - o.cost < 1 ? 'disabled' : ''}>Upgrade him ↗</button></article>`;
  }
  if (o.kind === 'sign') {
    const sh = Rn.runTeam(G, s).S;
    return `<article class="reward"><span class="eyebrow">FREE AGENT · ${esc(club(o.k))}</span><h3>Sign one, release one</h3>
      <label class="field-label" for="fa-pick">SIGN</label><select id="fa-pick">${o.list.map((f, i) => `<option value="${i}">${esc(nm(f.p))} · ${Math.round(f.r)} · ${TI(f.r)} tier · ${f.cost} patience</option>`).join('')}</select>
      <label class="field-label" for="fa-slot">RELEASE</label><select id="fa-slot">${s.slots.map((r, i) => `<option value="${i}">${i < 11 ? sh[i].s : `B${i - 10}`} · ${esc(nm(r.p))}${s.cap ? ` · ${charged(s, r.p)} charge` : ''}</option>`).join('')}</select>
      ${s.cap ? '<p class="help">The fifteen must stay within 2 S-tier and 4 A-tier players, so an S or A signing usually replaces a player of the same tier. B, C and D signings can replace anyone.</p>' : ''}<button class="button" data-take="${j}">Sign him ↗</button></article>`;
  }
  if (o.kind === 'tag') {
    const L = { tal: 'Talisman', mae: 'Maestro', rock: 'Rock' }[o.tag];
    return `<article class="reward"><span class="eyebrow">DEVELOP</span><h3>${esc(nm(o.p))}</h3><p>Becomes a ${L} ${o.lv === 1 ? 'I' : 'II'}. Costs ${o.cost} patience.</p><button class="button" data-take="${j}">Develop ↗</button></article>`;
  }
  return `<article class="reward"><span class="eyebrow">REST</span><h3>Recover</h3><p>${o.gain ? `+${o.gain} patience.` : 'Resting again is worth nothing; spend patience to reset it.'}</p><button class="button button--quiet" data-take="${j}">Rest</button></article>`;
}
function gauntlet() {
  const s = S.mode?.run;
  if (!s) {
    return `<div class="challenge-card"><span class="eyebrow">ONE SQUAD. EIGHT DECADES.</span><h2>ERA GAUNTLET</h2>
      <p>Take your fifteen from the 1950s to the 2020s. Each decade is two six-match segments against its clubs, then its boss, the decade's strongest club. Win segments to earn reward cards: a boost card can turn one of your players into his best version. Lose a boss and you can try again while the board's patience lasts.${S.cap ? ' Salary cap continues as Eraball’s Gauntlet cap: at most 2 S-tier and 4 A-tier players at once. An earned prime boost keeps the player’s original tier, so it never breaks the cap.' : ''}</p>
      <button class="button button--acid" id="run-start">Start the Gauntlet ↗</button></div>`;
  }
  const Dc = Rn.D_of(s), b = Rn.runBoss(F, s), last = s.log.at(-1), sc = Rn.score(s);
  let main = '';
  if (s.ph === 'seg') main = `<p>Segment ${s.seg + 1} of ${Rn.N_SEG}: six matches against ${Dc}s clubs. 13+ points pleases the board; 4 or fewer costs patience.</p><button class="button button--acid" id="run-seg">Play the segment ↗</button>`;
  else if (s.ph === 'reward') main = `<p>Choose one reward.</p><div class="rewards">${Rn.offers(G, F, s).map((o, j) => offerCard(o, j, s)).join('')}</div>`;
  else if (s.ph === 'boss') main = `<p>The ${Dc}s boss: <b>${esc(b.nm)}</b> (strength ${num(b.x)}). Your squad here: ${num(E.rate(Rn.runTeam(G, s), Dc).ovr)}. One neutral match, extra time and penalties if needed.</p><button class="button button--acid" id="run-boss">${s.tries[s.act] ? 'Retry the boss ↻' : 'Face the boss ↗'}</button>`;
  else if (s.ph === 'done') main = `<h3>EIGHT DECADES CONQUERED.</h3><p>${sc.attempts} boss matches, ${sc.w}-${sc.d}-${sc.l} in segments, ${s.pat} patience left.</p>`;
  else main = `<h3>THE BOARD HAS LOST PATIENCE.</h3><p>Your run ended in the ${Dc}s after ${sc.acts} boss wins.</p>`;
  const msg = !last ? '' : last.t === 'seg' ? `Last segment: ${last.w}-${last.d}-${last.l}, ${last.pts} points, patience ${last.dp >= 0 ? '+' : ''}${last.dp}.`
    : last.t === 'boss' ? `Boss: ${last.gx}–${last.gy}${last.pw ? ' (penalties)' : last.et ? ' (extra time)' : ''} — ${last.won ? 'won' : 'lost'}, patience ${last.dp >= 0 ? '+' : ''}${last.dp}.`
      : last.t === 'boost' ? `Boost card played: ${nm(last.p)} is now ${club(last.to)}.` : last.t === 'sign' ? `Signed ${nm(last.p)}, released ${nm(last.out)}.`
        : last.t === 'tag' ? `${nm(last.p)} developed.` : 'Rested.';
  return `<section class="run"><div class="run-head"><div><span class="eyebrow">ERA GAUNTLET · ${rules(s)} · DECADE ${Math.min(8, s.act + 1)} OF 8</span><h2>THE ${Dc}s</h2></div>
      <div class="run-pat"><span class="field-label">BOARD PATIENCE ${s.pat} / ${Rn.PAT_MAX}</span>${pips(s.pat)}</div></div>
    ${msg ? `<p class="run-msg" role="status">${esc(msg)}</p>` : ''}${main}
    ${['done', 'fired'].includes(s.ph) ? '<button class="button button--quiet button--small" id="run-start">Start a new run ↻</button>' : ''}
    ${runSquad(s)}
    <div class="mode-log">${s.log.slice().reverse().filter(e => e.t === 'seg' || e.t === 'boss').slice(0, 20).map(e => `<div class="mode-event"><div>${e.D}s · ${e.t === 'seg' ? `Segment ${e.seg + 1}` : `Boss · ${esc(e.op)}`}<small>${e.t === 'seg' ? `${e.w}-${e.d}-${e.l} · ${e.gf}–${e.ga}` : `Attempt ${e.n}${e.pw ? ' · penalties' : e.et ? ' · extra time' : ''}`}</small></div><b>${e.t === 'seg' ? `${e.pts} PTS` : `${e.gx}–${e.gy} ${e.won ? 'WIN' : 'LOSS'}`}</b></div>`).join('')}</div></section>`;
}

// Circuit and head to head
function more() {
  let cc = '';
  if (C) cc = `<div class="page-heading"><div><span class="eyebrow">TOURNAMENT CIRCUIT / COMPLETE</span><h2>${C.totals.titles} TITLES. ${C.events.length} EVENTS.</h2><p>${C.totals.played} matches · ${C.totals.won} wins · ${C.totals.gf} scored · ${C.totals.ga} conceded</p>
    <div class="honours">${C.honours.map(h => `<span class="honour">${esc(h)}</span>`).join('')}</div></div></div>
    ${awards(C.awards, 'Circuit', id => id === 'your-club' ? 'Your Era XI' : Object.values(F).flat().find(c => c.id === id)?.nm || id)}
    <div class="mode-log">${C.events.map(c => `<div class="mode-event"><div>EVENT ${c.i} / ${c.Ds}s · ${esc(c.label)}<small>${c.matches.filter(f => f.A === 'your-club' || f.B === 'your-club').length} of your matches${c.position ? ` · ${ord(c.position)} place` : ''}</small></div><b>${c.won ? 'CHAMPION ★' : c.position ? ord(c.position) : 'OUT'}</b></div>`).join('')}</div>`;
  let hh = '';
  if (H) hh = `<div class="cup-tie cup-tie--yours"><div>${H.legs.map(l => `${esc(l.h)} ${l.M.gx}–${l.M.gy} ${esc(l.a)} <small>${l.D}s</small>`).join('<br>')}<small>${H.et ? 'Extra time · ' : ''}${H.pw ? 'Penalties · ' : ''}Winner: ${esc(H.wn)}</small></div><strong>${H.agg[0]}–${H.agg[1]}</strong></div>`;
  return `<div class="challenge-grid"><article class="challenge-card"><span class="eyebrow">THE LONG ROAD TO GLORY</span><h2>TOURNAMENT CIRCUIT</h2>
      <p>Ten to twenty events across all decades, rotating league, knockout and group formats. Era adjustments are recalculated at every event.</p>
      <label class="field-label" for="circuit-events">EVENTS</label><select id="circuit-events">${Array.from({ length: 11 }, (_, i) => `<option value="${i + 10}" ${ev === i + 10 ? 'selected' : ''}>${i + 10} events</option>`).join('')}</select>
      <button class="button button--small" id="circuit-start">Play the circuit ↗</button></article>
    <article class="challenge-card"><span class="eyebrow">YOU AGAINST A FRIEND</span><h2>HEAD TO HEAD</h2>
      <p>Send your team code. Paste a friend's code to play two legs, each team at home in its own decade. Both teams must use ${rules(S)} rules.</p>
      <label class="field-label" for="my-code">YOUR TEAM CODE</label><textarea id="my-code" readonly rows="3">${esc(code(G, S))}</textarea><button class="button button--quiet button--small" id="copy-code">Copy code</button>
      <label class="field-label" for="their-code">FRIEND'S CODE</label><textarea id="their-code" rows="3" placeholder="Paste a team code"></textarea><button class="button button--small" id="h2h-play">Play the tie ↗</button>${hh}</article></div>${cc}`;
}

// How it works: the one place the rules and the limits of the data are spelled out
function about() {
  const n = G.meta.src || {};
  const pc = k => Math.round(100 * (n[k] || 0) / Math.max(1, G.meta.counts.cards));
  return `<span class="eyebrow">HOW IT WORKS</span><h2>MAKE YOUR ERA XI.</h2>
  <p>Choose the decade your season is played in. Draft from any decade; the further a player travels in time, the more rating he loses.</p>
  <h3>Five managers, then five different clubs</h3><p>Keep one of five manager and formation pairings (two re-spins). Any of the archive's clubs can be drawn; squads nearer your chosen era and stronger squads are more likely. No club repeats across your five squads, and each squad includes a player from the best tier your fifteen have not yet filled (2 S, 4 A, 4 B, 3 C, 2 D), when any remaining club has one. Place three players from each anywhere on the pitch or bench. One squad re-spin per draft.</p>
  <h3>A budget for all fifteen</h3><p>Salary cap is the default: 2 S-tier, 4 A-tier, 4 B-tier, 3 C-tier and 2 D-tier players. Tiers use base rating: S 90+, A 85–89.9, B 80–84.9, C 75–79.9, D below 75. Your bench counts too. Every squad stays visible; cards are blocked when their tier is full or taking them would prevent you finishing its three picks. Classic removes these limits. Weekly challenges use Salary cap.</p>
  <h3>Positions are each player's own</h3><p>A player's rating in every slot comes from his game card where one exists: EA's per-position ratings, or Championship Manager attributes put on EA's scale. Otherwise the loss grows with distance from his natural position: one step 10%, two steps 22%, further 35%, and 75% for a keeper outfield or an outfielder in goal. The bench has no position loss.</p>
  <h3>Shape, links and managers</h3><p>Formation shape moves strength between attack, midfield and defence. Teammates from the same club and decade placed near each other, and famous duos, earn link points. Drafting a manager's signature player raises his grades.</p>
  <h3>The season and the modes</h3><p>A 20-club league against the decade's strongest club squads and a 16-club European Cup. Then the Era Gauntlet (eight decades, reward cards, boost cards, board patience), a 10 to 20 event circuit, head to head with a friend's team code, and a weekly Salary cap challenge with one seed and one club order for everyone.</p>
  <div class="model-callout"><p><b>Where the numbers come from.</b> ${pc('fifa') + pc('fifa-near')}% of cards are rated by EA FIFA/FC data (FIFA 07 to FC 26), ${pc('cm') + pc('cm-near')}% by Championship Manager 01/02 databases, ${pc('icon')}% by EA Icon/Hero cards, and ${pc('estimated')}% are estimated by a model fitted on those ratings, mostly players of the 1950s to 1970s. Every card shows its source. Squads come from dated Wikidata club records, so a decade squad can combine players who never shared a season. Goals and results are simulated with a model fitted on real 2014-19 club results and checked on 2020-23; era losses, links and tags are game rules, not measurements.</p></div>`;
}

function render() {
  $('#reset-open').hidden = !S;
  root.innerHTML = !S ? intro() : S.phase === 'manager' ? managers() : S.phase === 'results' ? results() : draft();
  document.body.setAttribute('aria-busy', String(busy));
}

async function reel(next) {
  const box = $('#reveal');
  if (rM || !box) return change(next);
  const K = G.combos, h = box.querySelector('h2');
  busy = true; document.body.setAttribute('aria-busy', 'true');
  box.querySelector('button').disabled = true;
  try {
    for (let i = 0; i < 14; i++) {
      const c = K[Math.floor(Math.random() * K.length)];
      h.textContent = club(`${c.q}:${c.D}`);
      await new Promise(r => setTimeout(r, 45 + i * 6));
    }
  } finally { busy = false; }
  change(next);
}

async function play() {
  if (S.phase !== 'review' || busy) return;
  busy = true; render();
  try {
    await new Promise(r => setTimeout(r, 30));
    R = season(); S = { ...S, phase: 'results' }; tab = 'league'; save();
    root.focus(); window.scrollTo({ top: 0, behavior: 'instant' });
  } finally { busy = false; render(); }
}
function share() {
  const i = R.L.tab.findIndex(c => c.me), t = R.L.tab[i];
  return `Football Era Lab · ${S.wk ? `Weekly ${S.wk} · ` : ''}${rules(S)} · ${S.D}s\n${ord(i + 1)} / 20 · ${t.Pts} points · ${t.W}W ${t.D}D ${t.L}L\nEuropean Cup: ${R.K.champ === 'your-club' ? 'WINNERS' : R.K.champN}\n${S.manager.nm} · ${S.manager.f}\nSeed ${S.seed} · ${location.href.split('?')[0]}?seed=${S.seed}&era=${S.D}&cap=${S.cap ? 1 : 0}`;
}
function download() {
  const b = new Blob([JSON.stringify({ game: 'Football Era Lab', data: G.meta.v, draft: S, result: share() }, null, 2)], { type: 'application/json' });
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = `Football Era Lab ${S.D}s Seed ${S.seed}.json`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000); notice('Replay downloaded with every draft choice.');
}
async function card() {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
  const g = c.getContext('2d'), Q = E.rate(team(G, S), S.D), i = R.L.tab.findIndex(x => x.me), t = R.L.tab[i];
  const tx = (s, x, y, z = 25, col = '#152e28', f = 'Trebuchet MS', mx = 1050) => {
    g.fillStyle = col; g.font = `${z}px ${f}`;
    while (g.measureText(String(s)).width > mx && z > 13) { z--; g.font = `${z}px ${f}`; }
    g.fillText(String(s), x, y);
  };
  g.fillStyle = '#f5f2e9'; g.fillRect(0, 0, 1200, 900); g.fillStyle = '#102823'; g.fillRect(0, 0, 1200, 148);
  tx('FOOTBALL ERA LAB', 52, 73, 55, '#f5f2e9', 'Impact'); tx(`${S.wk ? `WEEKLY ${S.wk} / ` : ''}${rules(S).toUpperCase()} / ${S.D}s / YOUR ERA XI`, 55, 116, 20, '#d7f86c', 'Consolas');
  tx(`${ord(i + 1)} / 20`, 53, 260, 94, '#152e28', 'Impact', 390); tx('LEAGUE FINISH', 58, 293, 18, '#67776a', 'Consolas');
  tx(`${t.Pts} POINTS`, 490, 216, 44, '#152e28', 'Impact'); tx(`${t.W} WINS · ${t.D} DRAWS · ${t.L} LOSSES`, 490, 257, 21);
  tx(R.K.champ === 'your-club' ? 'EUROPEAN CUP WINNERS' : `CUP WINNERS: ${R.K.champN}`, 490, 295, 25, '#152e28', 'Impact', 650);
  tx(`${S.manager.nm} / ${S.manager.f}`, 55, 364, 29, '#152e28', 'Georgia', 1090);
  tx('STARTING ELEVEN', 55, 412, 18, '#67776a', 'Consolas'); tx('THE BENCH', 705, 412, 18, '#67776a', 'Consolas');
  const TC = { S: '#6b3fd6', A: '#946a06', B: '#1f7a49', C: '#2c5fa8', D: '#94501a' };
  Q.xi.forEach((p, j) => { const t = TI(p.c.r); tx(p.s, 55, 449 + j * 30, 18, '#67776a', 'Consolas'); tx(p.c.nm, 125, 449 + j * 30, 23, '#152e28', 'Georgia', 450); tx(Math.round(p.a), 590, 449 + j * 30, 25, TC[t], 'Impact'); tx(t, 630, 449 + j * 30, 16, TC[t], 'Consolas'); });
  Q.bn.forEach((p, j) => { const t = TI(p.c.r); tx(`B${j + 1}`, 705, 449 + j * 38, 18, '#67776a', 'Consolas'); tx(p.c.nm, 750, 449 + j * 38, 23, '#152e28', 'Georgia', 320); tx(Math.round(p.a), 1090, 449 + j * 38, 25, TC[t], 'Impact'); tx(t, 1130, 449 + j * 38, 16, TC[t], 'Consolas'); });
  tx(`OVERALL ${num(Q.ovr)}`, 705, 666, 48, '#152e28', 'Impact');
  g.fillStyle = '#102823'; g.fillRect(0, 802, 1200, 98); tx(`REPLAY SEED ${S.seed} / ${S.D}s`, 55, 844, 24, '#d7f86c', 'Consolas');
  tx('Simulated results. Ratings come from EA and Championship Manager data where it exists.', 55, 876, 17, '#f5f2e9');
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  if (!b) throw new Error('Your browser could not create the result card. Copy the result text instead.');
  const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = `Football Era Lab ${S.D}s Seed ${S.seed}.png`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); notice('Your result card is downloaded.');
}
const setRun = (s, msg) => { S = { ...S, mode: { ...S.mode, run: s } }; save(); render(); if (msg) notice(msg); };
async function copy(t, ok) {
  try { await navigator.clipboard.writeText(t); notice(ok); }
  catch { const el = document.createElement('textarea'); el.value = t; document.body.append(el); el.select(); const k = document.execCommand('copy'); el.remove(); notice(k ? ok : t); }
}

root.addEventListener('submit', e => {
  if (e.target.id !== 'start-form') return;
  e.preventDefault();
  try { change(start($('#seed').value, D, cap)); root.focus(); } catch (x) { notice(x.message, true); }
});
root.addEventListener('input', e => { if (e.target.id === 'roster-search') { q = e.target.value; $('#roster-list').innerHTML = rows(); } });
root.addEventListener('change', async e => {
  if (e.target.name === 'draft-rules') cap = e.target.value === 'cap';
  if (e.target.id === 'roster-sort') { sort = e.target.value; $('#roster-list').innerHTML = rows(); }
  if (e.target.id === 'circuit-events') ev = Number(e.target.value);
  if (e.target.id === 'import-replay') {
    const old = { S, R, C, H, tab };
    try {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 2000000) throw new Error('The replay file is too large.');
      const raw = JSON.parse(await f.text());
      if (raw.game !== 'Football Era Lab') throw new Error('Choose a Football Era Lab replay file.');
      S = valid(G, raw.draft); R = S.phase === 'results' ? season() : null; C = null; H = null; tab = 'league';
      render(); save(); notice('Replay restored with your draft choices.');
    } catch (x) { ({ S, R, C, H, tab } = old); render(); notice(`Replay could not be restored: ${x.message}`, true); }
  }
});
root.addEventListener('keydown', e => {
  if (!e.target.matches('[data-tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const Q = [...root.querySelectorAll('[data-tab]')], i = Q.indexOf(e.target);
  const n = e.key === 'Home' ? 0 : e.key === 'End' ? Q.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + Q.length) % Q.length;
  tab = Q[n].dataset.tab; render(); $(`#tab-${tab}`).focus();
});
root.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || b.disabled || busy) return;
  try {
    if (b.dataset.era) { D = b.dataset.era === 'random' ? 'random' : Number(b.dataset.era); const sd = $('#seed').value; render(); $('#seed').value = sd; }
    else if (b.id === 'weekly') { const w = wk(); change({ ...start(w.seed, w.D, true), wk: w.id }, `Weekly challenge ${w.id}: Salary cap in the ${w.D}s, one club order for everyone.`); }
    else if (b.dataset.manager !== undefined) change(choose(G, S, Number(b.dataset.manager)), 'Manager chosen. Your squad spins begin now.');
    else if (b.id === 'manager-reroll') change(reroll(S));
    else if (b.id === 'squad-spin') await reel(spin(G, S));
    else if (b.id === 'squad-reroll') await reel(spin(G, S, true));
    else if (b.dataset.player) {
      sel = sel === b.dataset.player ? null : b.dataset.player; sw = null;
      const y = $('#roster-list').scrollTop; render(); $('#roster-list').scrollTop = y;
      if (sel && matchMedia('(max-width:780px)').matches) $('#lineup-instruction').scrollIntoView({ behavior: rM ? 'auto' : 'smooth', block: 'center' });
    } else if (b.dataset.slot !== undefined) {
      const i = Number(b.dataset.slot);
      if (S.phase === 'results') return;
      if (sel) {
        if (S.slots[i]) throw new Error('This slot is taken. Choose an empty slot, or cancel the selection to swap.');
        const n = nm(sel), next = place(G, S, sel, i);
        change(next, `${n} placed${next.spin !== S.spin ? '. Three picks complete.' : '.'}`);
      } else if (sw !== null) { if (sw === i) { sw = null; render(); } else change(swap(S, sw, i), 'Lineup swapped.'); }
      else if (S.slots[i]) { sw = i; render(); }
      else notice('Choose a player from the squad first.');
    } else if (b.id === 'simulate') await play();
    else if (b.dataset.tab) { tab = b.dataset.tab; render(); }
    else if (b.id === 'replay') { R = C = H = null; change(start(S.seed, S.D, !!S.cap), `Same seed and ${rules(S)} rules. A fresh set of choices.`); window.scrollTo({ top: 0, behavior: 'instant' }); }
    else if (b.id === 'share') await copy(share(), 'Result copied. Share your season and replay seed.');
    else if (b.id === 'download') download();
    else if (b.id === 'result-card') await card();
    else if (b.id === 'run-start') setRun(Rn.runNew(S.seed, S), 'The Gauntlet begins in the 1950s.');
    else if (b.id === 'run-seg') setRun(Rn.runSegment(G, F, S.mode.run));
    else if (b.id === 'run-boss') setRun(Rn.runPlayBoss(G, F, S.mode.run));
    else if (b.dataset.take !== undefined) {
      const o = { pick: Number($('#fa-pick')?.value ?? 0), slot: Number($('#fa-slot')?.value ?? 0) };
      setRun(Rn.take(G, F, S.mode.run, Number(b.dataset.take), o));
    } else if (b.id === 'circuit-start') {
      busy = true; document.body.setAttribute('aria-busy', 'true'); b.textContent = 'Playing events…';
      try { await new Promise(r => setTimeout(r, 30)); C = E.circuit(S.seed, me(), F, { events: ev, Ds: S.D }); S = { ...S, mode: { ...S.mode, ci: ev } }; save(); }
      finally { busy = false; render(); }
    } else if (b.id === 'copy-code') await copy(code(G, S), 'Team code copied. Send it to a friend.');
    else if (b.id === 'h2h-play') {
      const t = uncode(G, $('#their-code').value);
      if (t.cap !== !!S.cap) throw new Error(`Your team uses ${rules(S)} rules. Ask your friend for a matching ${rules(S)} team code, or start a draft with their rules.`);
      H = h2h(S.seed, { id: 'your-club', nm: 'Your Era XI', T: team(G, S), D: S.D }, { id: 'friend', nm: "Friend's XI", T: t.T, D: t.D });
      render(); notice(H.w === 'your-club' ? 'You won the tie.' : 'Your friend won the tie.');
    }
  } catch (x) { busy = false; document.body.setAttribute('aria-busy', 'false'); notice(x.message, true); }
});
$('#about-open').addEventListener('click', () => $('#about-dialog').showModal());
$('#reset-open').addEventListener('click', () => $('#reset-dialog').showModal());
$('#reset-cancel').addEventListener('click', () => $('#reset-dialog').close());
$('#reset-confirm').addEventListener('click', () => { S = R = C = H = null; sel = sw = null; cap = true; try { localStorage.removeItem(STORE); } catch {} $('#reset-dialog').close(); render(); window.scrollTo({ top: 0, behavior: 'instant' }); });

async function boot() {
  try {
    const res = await fetch(new URL('../data/game.json', import.meta.url));
    if (!res.ok) throw new Error('The archive could not be loaded. Please reload the page.');
    G = await res.json();
    if (!G.meta || !G.people || !G.cards || !G.managers || !G.formations) throw new Error('The football archive is incomplete.');
    if (G.params) E.cfg(G.params);
    F = fields(G);
    $('#about-content').innerHTML = about();
    $('#data-status').textContent = `${new Set(G.combos.map(c => c.q)).size} CLUBS · ${G.meta.counts.combos} CLUB ERAS · ${G.meta.counts.people.toLocaleString()} PEOPLE`;
    let resumed = false;
    try {
      const sv = localStorage.getItem(STORE);
      if (sv) {
        S = valid(G, JSON.parse(sv)); cap = !!S.cap; if (S.phase === 'results') R = season();
        if (S.mode?.ci) { ev = S.mode.ci; C = E.circuit(S.seed, me(), F, { events: ev, Ds: S.D }); }
        resumed = true;
      }
    } catch (x) { S = R = C = null; notice(`Your saved run could not be resumed: ${x.message} Start a new draft below.`, true); }
    const u = new URL(location.href);
    if (!resumed && ['0', '1'].includes(u.searchParams.get('cap'))) cap = u.searchParams.get('cap') === '1';
    render();
    if (!resumed && u.searchParams.has('seed')) {
      const sd = u.searchParams.get('seed'), era = Number(u.searchParams.get('era'));
      if (DECADES.includes(era)) D = era;
      render();
      $('#seed').value = sd;
    }
    if (resumed) notice('Your saved run is back where you left it.');
  } catch (x) {
    root.innerHTML = `<div class="loading"><span class="eyebrow">ARCHIVE UNAVAILABLE</span><h1>THE ARCHIVE NEEDS A MOMENT.</h1><p>${esc(x.message)}</p><p><a class="button" href="./">Try again ↻</a></p></div>`;
    $('#data-status').textContent = 'ARCHIVE UNAVAILABLE';
  }
}
boot();
