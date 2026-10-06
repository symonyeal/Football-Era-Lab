import * as E from './engine/index.js';
import { STORE, DECADES, start, opts, choose, reroll, spin,
  place, swap, hydrate, team, preview, valid, used } from './draft.js';
import { fields } from './data.js';

// G dataset; T draft team; S saved draft; F decade opponents; R season; B Gauntlet; C circuit.
// sel selected roster person; sw selected swap slot; tab results tab; D chosen simulation decade.
let G, S = null, F, R = null, B = null, C = null;
let sel = null, sw = null, tab = 'league', D = 1980, query = '', sort = 'rating', busy = false;
let timer;
const root = document.querySelector('#game');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = n => Number.isFinite(n) ? n.toFixed(1) : '0.0';
const src = { f: 'FIFA', n: 'FIFA NEAR', i: 'ICON / HERO', e: 'ESTIMATED' };
const source = s => `<span class="source source--${esc(s)}" title="${esc({ f: 'Published FIFA / FC edition snapshot for this player and club.', n: 'Published FIFA / FC snapshot from a nearby edition, adjusted for decade age.', i: 'EA Icon / Hero reconstruction, adjusted for decade age.', e: 'Estimated by a fitted model; this is not a measured historical rating.' }[s])}">${src[s] || 'ESTIMATED'}</span>`;
const tags = c => Object.entries(c.tg || {}).map(([k, v]) => ({ tl: `Timeless ${v === 1 ? 'I' : 'II'}`, mae: 'Maestro', tal: 'Talisman', rock: 'Rock', poa: 'Poacher', bg: `European champion ×${v}` })[k]).filter(Boolean).join(' · ');

function notice(msg, error = false) {
  const n = $('#notice'); n.textContent = msg; n.hidden = false;
  n.classList.toggle('toast--error', error); clearTimeout(timer);
  timer = setTimeout(() => { n.hidden = true; }, error ? 9000 : 5000);
}

function save() {
  try { if (S) localStorage.setItem(STORE, JSON.stringify(S)); }
  catch { notice('This browser cannot save the run. Keep this page open or download your replay.', true); }
}

function change(next, msg) {
  S = next; sel = null; sw = null; query = ''; save(); render(); if (msg) notice(msg);
}

function progress(active) {
  const steps = ['Era', 'Manager', 'Squad', 'Season'];
  return `<nav class="progress" aria-label="Draft progress">${steps.map((s, i) => `${i ? '<span class="connector" aria-hidden="true"></span>' : ''}<span class="${i < active ? 'done' : i === active ? 'active' : ''}" ${i === active ? 'aria-current="step"' : ''}><b>${i < active ? '✓' : i + 1}</b>${s}</span>`).join('')}<span class="run-meta">${S.D}s · SEED ${S.seed}</span></nav>`;
}

function limits() {
  return `<details class="source-note"><summary>Ratings, history &amp; the limits of the model</summary><p>Squads list every eligible player in this archive, drawn from recorded club stints. Historical records and positions are incomplete; the archive is not every player who ever represented a club. Apps and goals are recorded league totals apportioned across decades.</p><p>${source('f')} published edition snapshot · ${source('n')} nearby edition snapshot · ${source('i')} EA legend reconstruction · ${source('e')} fitted estimate. The source label follows each card. Old positions are mapped onto modern roles.</p><p>Era losses, fit, links, tags and manager grades are game rules. Goals are simulated with the same model for both teams. ${esc(G.params?.src || E.P?.src || 'Match parameters use conservative defaults; historical results are not predictions.')} <a href="../docs/MODEL.md">Read the model ↗</a></p></details>`;
}

function intro() {
  const labels = ['Post-war pioneers', 'The golden age', 'Total football', 'European dynasties', 'A global game', 'The new generation', 'Modern greats', 'The next chapter'];
  return `<section class="hero"><div><span class="eyebrow">A DRAFT THROUGH FOOTBALL HISTORY</span><h1>BUILD A TEAM.<br><em>Across time.</em></h1><p class="hero-copy">Five club squads. Fifteen of your choices. Put legends and modern greats on the same pitch, then take on the strongest clubs of your era.</p></div><div class="hero-illustration" aria-hidden="true"><span class="hero-stamp">THE ERA XI / EST. 1950—2029</span><span class="intro-rule"></span><span class="hero-ball">✦</span><span class="hero-years"><span>1950</span><span>2020</span></span><span class="hero-caption">NO TWO TEAMS THE SAME</span></div></section>
    <section class="setup" aria-label="Start a draft"><div><div class="section-title"><h2>CHOOSE YOUR ERA</h2><p>Your opponents live here.</p></div><div class="decades">${DECADES.map((d, i) => `<button class="decade" data-era="${d}" aria-pressed="${D === d}"><strong>${d}s</strong><small>${labels[i]}</small></button>`).join('')}</div><button class="random-era" data-era="random" aria-pressed="${D === 'random'}">${D === 'random' ? '✓ ' : ''}Let fate choose my decade ↗</button></div><form id="start-form" class="start-form"><div><label class="field-label" for="seed">REPLAY SEED</label><input class="seed-input" id="seed" name="seed" inputmode="numeric" autocomplete="off" value="${Math.floor(Math.random() * 4294967296)}" aria-describedby="seed-help"><p class="help" id="seed-help">Same seed + same choices = same run.</p></div><button class="button" type="submit">Enter the draft <span aria-hidden="true">↗</span></button></form></section>
    <div class="rules-strip"><div><strong>01 / THE MANAGER</strong><p>Pick one of five managers and a formation they used.</p></div><div><strong>02 / THE SQUADS</strong><p>Spin a club and decade. Choose three from its available roster.</p></div><div><strong>03 / YOUR ELEVEN</strong><p>Place every player yourself. Keep four on the bench.</p></div><div><strong>04 / THE SEASON</strong><p>Play a 38-match league and a 16-club European Cup.</p></div></div><p class="roster-note"><label class="replay-label">Have a saved replay? <input id="import-replay" type="file" accept="application/json,.json"></label></p>${limits()}`;
}

function managers() {
  return `${progress(1)}<div class="page-heading"><div><span class="eyebrow">THE FIRST BIG DECISION</span><h1>WHO LEADS YOUR ERA XI?</h1><p>Choose one manager and their formation. Signature players upgrade both manager grades when you draft them.</p></div><button class="button button--quiet button--small" id="manager-reroll" ${S.managerRoll >= 2 ? 'disabled' : ''}>Re-spin managers ↻ <span>${2 - S.managerRoll} left</span></button></div><section class="manager-grid" aria-label="Five manager and formation options">${opts(G, S).map((o, i) => {
    const m = G.managers.find(m => m.nm === o.nm);
    const sig = m.sig.map(p => G.people[p]?.nm).filter(Boolean);
    const initial = m.nm.split(' ').map(n => n[0]).slice(0, 2).join('');
    return `<article class="manager-card" style="animation-delay:${i * 45}ms"><span class="manager-number">OPTION / 0${i + 1}</span><div class="manager-glyph" aria-hidden="true">${esc(initial)}</div><h2>${esc(m.nm)}</h2><div class="formation-name">${esc(o.f)}</div><div class="grades"><span>ATTACK <b>${m.ga}</b></span><span>DEFENCE <b>${m.gd}</b></span></div><p class="signature">SIGNATURE PLAYERS<br>${esc(sig.length ? sig.slice(0, 3).join(' · ') : 'No linked players in this archive')}</p><button class="button" data-manager="${i}">Choose manager ↗</button></article>`;
  }).join('')}</section><p class="manager-footnote">Every option is a manager + formation pairing. The formation stays with you through this run.</p>${limits()}`;
}

function lineup() {
  const T = team(G, S), Q = E.rate(T, S.D), n = S.slots.filter(Boolean).length;
  const positions = T.S.map((s, i) => {
    const p = Q.xi[i], c = p.c;
    const v = sel && !c ? preview(G, S, sel, i) : null;
    const label = c ? `${s.s}, ${c.nm}, adjusted ${num(p.a)}. Select to swap.` : `${s.s}, empty.${v ? ` ${v.c.nm} adjusted rating ${num(v.a)}, fit loss ${Math.round(v.f * 100)} percent, era loss ${Math.round((1 - v.e) * 100)} percent.` : ' Select a roster player first.'}`;
    return `<button class="pitch-slot ${sw === i ? 'selected' : ''} ${v ? 'preview' : ''}" data-slot="${i}" style="left:${s.x}%;top:${s.y}%" aria-label="${esc(label)}" title="${esc(label)}" ${S.phase === 'results' ? 'disabled' : ''}><span class="slot-circle ${c ? 'slot-circle--filled' : ''}">${c ? Math.round(p.a) : v ? Math.round(v.a) : '+'}</span><span class="slot-name">${esc(c ? c.nm.split(' ').slice(-1)[0] : v ? `${Math.round(v.f * 100)}% fit loss` : s.s)}</span><span class="slot-role ${p.f ? 'fit-warning' : ''}">${c ? `${s.s}${p.f ? ` · −${Math.round(p.f * 100)}%` : ''}` : v ? `−${Math.round((1 - v.e) * 100)}% era` : 'OPEN'}</span></button>`;
  }).join('');
  const benches = T.bn.map((c, j) => {
    const i = j + 11, v = sel && !c ? preview(G, S, sel, i) : null;
    return `<button class="bench-slot ${sw === i ? 'selected' : ''} ${v ? 'preview' : ''}" data-slot="${i}" ${S.phase === 'results' ? 'disabled' : ''} aria-label="Bench ${j + 1}, ${c ? esc(c.nm) : 'empty'}${v ? `, adjusted rating ${num(v.a)}. No fit loss.` : ''}"><span class="field-label">BENCH ${j + 1}</span><b>${c ? Math.round(Q.bn[j].a) : v ? Math.round(v.a) : '+'}</b><span class="slot-name">${esc(c ? c.nm.split(' ').slice(-1)[0] : v ? 'No fit loss' : 'OPEN')}</span></button>`;
  }).join('');
  const instruction = sel ? `<strong>${esc(G.people[sel].nm)}</strong> selected. Choose an empty slot. Green numbers preview fit + era adjustment.` : sw !== null ? 'Choose another pitch or bench slot to swap. Select the same slot to cancel.' : S.phase === 'results' ? 'Your final XI. Replay the seed to try another draft.' : 'Select a roster player, then an empty slot. Select two occupied slots to swap.';
  return `<aside class="lineup-panel" aria-label="Your lineup"><div class="lineup-topline"><span>${esc(S.manager.nm)} / ${esc(S.manager.f)}</span><span>${n} / 15 PLAYERS</span></div><div class="pitch" id="pitch"><div class="pitch-lines"><div class="penalty-box penalty-box--top"></div><div class="penalty-box penalty-box--bottom"></div></div>${positions}</div><div class="bench">${benches}</div><div class="lineup-instruction" id="lineup-instruction" role="status">${instruction}</div><div class="lineup-scores"><div><span>OVERALL</span><b>${num(Q.ovr)}</b></div><div><span>ATTACK</span><b>${num(Q.A)}</b></div><div><span>MIDFIELD</span><b>${num(Q.M)}</b></div><div><span>DEFENCE</span><b>${num(Q.Dk)}</b></div></div><p class="grade-note">Attack ${Q.gA} · Defence ${Q.gD}${Q.up ? ' · Signature player bonus active ↑' : ''} · Ratings include empty slots while drafting.</p>${breakdown(Q)}</aside>`;
}

function breakdown(Q) {
  return `<details class="breakdown"><summary>Show the rating breakdown ↗</summary><div class="table-wrap"><table><thead><tr><th>Slot / player</th><th>Base</th><th>Fit loss</th><th>Era loss</th><th>Links</th><th>Final</th></tr></thead><tbody>${Q.xi.filter(p => p.c).map(p => `<tr><td class="table-name">${p.s} · ${esc(p.c.nm)} ${source(p.c.src)}</td><td>${num(p.c.r)}</td><td>${Math.round(p.f * 100)}%</td><td>${Math.round((1 - p.e) * 100)}%</td><td>+${p.b}</td><td>${num(p.a)}</td></tr>`).join('')}${Q.bn.filter(Boolean).map((p, i) => `<tr><td class="table-name">B${i + 1} · ${esc(p.c.nm)} ${source(p.c.src)}</td><td>${num(p.c.r)}</td><td>0%</td><td>${Math.round((1 - p.e) * 100)}%</td><td>—</td><td>${num(p.a)}</td></tr>`).join('')}</tbody></table></div><p class="roster-note">Final = base × (1 − fit loss) × era factor + links. The bench has no fit loss. Line strengths also reflect formation balance, tags and manager grades.</p></details>`;
}

function rows() {
  const I = used(S);
  let Q = G.cards[S.combo].filter(c => (`${G.people[c.p]?.nm || ''} ${c.pos.join(' ')}`).toLowerCase().includes(query.toLowerCase()));
  Q = Q.slice().sort(sort === 'name' ? (a, b) => G.people[a.p].nm.localeCompare(G.people[b.p].nm) : sort === 'position' ? (a, b) => a.pos[0].localeCompare(b.pos[0]) || b.r - a.r : sort === 'apps' ? (a, b) => b.n - a.n || b.r - a.r : (a, b) => b.r - a.r);
  return Q.length ? Q.map(c => `<button class="player-row" data-player="${esc(c.p)}" aria-pressed="${sel === c.p}" ${I.has(c.p) ? 'disabled' : ''}><b class="player-rating">${Math.round(c.r)}</b><span><span class="player-name">${esc(G.people[c.p].nm)}</span><span class="player-detail"><span>${esc(c.pos.join(' / '))}</span>${source(c.s)}<span>${c.n} APPS · ${c.g} GOALS</span></span>${tags(c) ? `<span class="tags">${esc(tags(c))}</span>` : ''}</span><span class="player-select">${I.has(c.p) ? 'IN SQUAD ✓' : sel === c.p ? 'PICKED →' : 'PICK +'}</span></button>`).join('') : '<p class="roster-empty">No players match your search.</p>';
}

function roster() {
  if (S.phase === 'review') {
    const gk = team(G, S).xi[0]?.pos.includes('GK');
    return `<div class="review-copy"><span class="eyebrow">FIFTEEN PEOPLE. YOUR CHOICES.</span><h2>YOUR TEAM IS READY.</h2><p>Eleven starters and four substitutes. Swap any two slots to adjust your shape before kick-off.</p>${!gk ? '<p class="fit-warning">Your goalkeeper slot has an outfield player. The 75% fit loss is reflected in the ratings. You can swap in a keeper if you drafted one.</p>' : ''}<p>You enter a 20-club league against the strongest available club squads of the ${S.D}s. Every team plays every other team home and away. A separate 16-club European Cup follows.</p><button class="button" id="simulate" ${busy ? 'disabled' : ''}>${busy ? 'Playing the season…' : 'Kick off the season ↗'}</button></div>${opponents()}${limits()}`;
  }
  if (!S.combo) return `<div class="reveal-panel"><span class="eyebrow">SQUAD SPIN ${S.spin + 1} OF 5</span><span class="reveal-number">0${S.spin + 1}</span><h2>${S.spin ? 'THE NEXT CHAPTER.' : 'OPEN YOUR FIRST SQUAD.'}</h2><p>A club and decade from across the archive. You choose any three available people and place each one yourself.</p><button class="button" id="squad-spin">Spin club + decade ↻</button></div>${S.history.length ? `<p class="roster-note">Drafted from ${S.history.map(k => `${esc(G.clubs[k.split(':')[0]].nm)} ${k.split(':')[1]}s`).join(' · ')}</p>` : ''}`;
  const [q, d] = S.combo.split(':'), club = G.clubs[q], pool = G.cards[S.combo];
  return `<div class="roster-heading"><div class="roster-heading-row"><span class="eyebrow">SQUAD ${S.spin + 1} / 5</span><span class="club-country">${esc(club.cc)} · ${d}s</span></div><h2>${esc(club.nm)}</h2><p>${pool.length} players in the archive · Choose three · Place them anywhere</p><div class="pick-progress">${[0, 1, 2].map(i => `<span class="pick-dot ${i < S.picked ? 'pick-dot--done' : ''}" aria-hidden="true"></span>`).join('')}<span>${S.picked} / 3 PLACED</span></div></div><div class="roster-controls"><label><span class="sr-only">Search roster name or position</span><input id="roster-search" type="search" placeholder="Search name or position…" value="${esc(query)}"></label><label><span class="sr-only">Sort roster</span><select id="roster-sort">${[['rating', 'Rating ↓'], ['name', 'Name A–Z'], ['position', 'Position'], ['apps', 'Apps ↓']].map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div><div class="roster-list" id="roster-list" aria-label="Full available club roster">${rows()}</div><div class="actions" style="margin-top:12px"><button class="button button--quiet button--small" id="squad-reroll" ${S.squadReroll >= 1 || S.picked ? 'disabled' : ''}>Re-spin squad ↻ <span>${1 - S.squadReroll} left</span></button><span class="help">Available before your first pick.</span></div><p class="roster-note">A person can appear once across your entire squad. Grayed-out people are already drafted, including other decades or clubs.</p>${limits()}`;
}

function opponents() {
  return `<details class="breakdown"><summary>Your ${S.D}s opposition: 19 historical club squads</summary><div class="table-wrap"><table><thead><tr><th>Club / decade</th><th>Strength</th></tr></thead><tbody>${F[S.D].slice(0, 19).map(c => `<tr><td class="table-name">${esc(c.nm)}</td><td>${num(c.x)}</td></tr>`).join('')}</tbody></table></div><p class="roster-note">Each club has a real archived roster and a best-fit XI in its manager's formation. Cup entrants use the first fifteen clubs.</p></details>`;
}

function draft() {
  return `${progress(2)}<div class="page-heading"><div><span class="eyebrow">${S.phase === 'review' ? 'THE LINEUP ROOM' : 'YOUR HISTORY, IN THE MAKING'}</span><h1>${S.phase === 'review' ? 'MAKE EVERY POSITION COUNT.' : `FIVE SQUADS. YOUR FIFTEEN.`}</h1><p>${S.phase === 'review' ? 'Your shape decides attack, midfield and defence. Your bench covers absences and substitutions.' : `Playing in the ${S.D}s. Draft from any decade; players lose a little rating as they travel away from their home era.`}</p></div><span class="run-meta">${S.slots.filter(Boolean).length} / 15 DRAFTED · ${Math.min(5, S.spin + 1)} / 5 SQUADS</span></div><div class="draft-layout"><section class="draft-roster" aria-label="Squad selection">${roster()}</section>${lineup()}</div>`;
}

function club() {
  const T = team(G, S);
  return { id: 'your-club', nm: 'Your Era XI', T, x: E.rate(T, S.D).ovr, me: true };
}

function season() {
  if (F[S.D]?.length < 19) throw new Error(`The ${S.D}s archive needs nineteen complete opposition squads.`);
  return E.run(E.hs(`${S.seed}:season`), club(), F[S.D].slice(0, 19), F[S.D].slice(0, 15), S.D);
}

function table(Q) {
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th class="table-name">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>PTS</th></tr></thead><tbody>${Q.map((c, i) => `<tr class="${c.me || c.id === 'your-club' ? 'your-row' : ''}"><td>${i + 1}</td><td class="table-name">${esc(c.nm)}</td>${['P', 'W', 'D', 'L', 'GF', 'GA'].map(k => `<td>${c[k]}</td>`).join('')}<td>${c.GF - c.GA > 0 ? '+' : ''}${c.GF - c.GA}</td><td><b>${c.Pts}</b></td></tr>`).join('')}</tbody></table></div>`;
}

function statRows(st) {
  const Q = st instanceof Map ? [...st.values()] : Array.isArray(st) ? st : [];
  return Q.map(p => ({ ...p, nm: p.nm || G.people[p.id]?.nm || p.id })).sort((a, b) => b.g - a.g || b.as - a.as || b.cs - a.cs);
}

function awards() {
  const Q = statRows(R.L.st), a = R.L.awards || {};
  const rows = [
    ['League top scorer', a.scorer || Q[0], 'g', 'goals'],
    ['Assist leader', a.assists || Q.slice().sort((a, b) => b.as - a.as)[0], 'as', 'assists'],
    ['Clean sheet leader', a.keeper || Q.filter(p => p.cs).sort((a, b) => b.cs - a.cs)[0], 'cs', 'clean sheets'],
    ['Player of the season', a.player || Q.slice().sort((a, b) => 2 * b.g + b.as + b.cs - (2 * a.g + a.as + a.cs))[0], 'ap', 'appearances'],
  ];
  return `<aside class="award-sidebar" aria-label="League awards">${rows.filter(([, p]) => p).map(([l, p, k, u]) => `<article class="stat-card"><span class="eyebrow">${l}</span><h3>${esc(p.nm || G.people[p.id]?.nm || p.id)}</h3><p>${p[k]} ${u} · ${esc(p.cl === 'your-club' ? 'Your Era XI' : (F[S.D].find(c => c.id === p.cl)?.nm || p.cl || ''))}</p></article>`).join('')}</aside>`;
}

function fixtures() {
  return `<h2 class="result-section-title">YOUR 38 LEAGUE MATCHES</h2><div class="fixtures">${R.L.res.map(c => `<article class="fixture"><span class="fixture-round">MD ${c.rd}<br>${c.h ? 'HOME' : 'AWAY'}</span><b class="fixture-score">${c.gf}–${c.ga}</b><span class="fixture-op">${esc(c.op)}</span><span class="fixture-outcome ${c.gf > c.ga ? 'win' : c.gf < c.ga ? 'loss' : ''}">${c.gf > c.ga ? 'W' : c.gf < c.ga ? 'L' : 'D'}</span></article>`).join('')}</div><p class="roster-note">All ${R.L.fixtures?.length || 380} league fixtures are simulated. These are your team's matches.</p>`;
}

function cupRounds(K) {
  return K.rounds.map((q, i) => `<section class="cup-round"><h3>${E.RD[i] || `Round ${i + 1}`}</h3>${q.map(t => `<div class="cup-tie ${t.A === 'your-club' || t.B === 'your-club' ? 'cup-tie--yours' : ''}"><div>${esc(t.an)}<br>${esc(t.bn)}<small>${t.legs.length === 2 ? `Two legs: ${t.legs[0].gx}–${t.legs[0].gy} / ${t.legs[1].gx}–${t.legs[1].gy}` : 'Neutral final'}${t.et ? ' · Extra time' : ''}${t.pw ? ' · Penalties' : ''} · Winner: ${esc(t.wn)}</small></div><strong>${t.agg[0]}–${t.agg[1]}</strong></div>`).join('')}</section>`).join('');
}

function stats() {
  return `<h2 class="result-section-title">LEAGUE PLAYER STATISTICS</h2><div class="table-wrap"><table><thead><tr><th>Player</th><th class="table-name">Club</th><th>APPS</th><th>GOALS</th><th>ASSISTS</th><th>CS</th></tr></thead><tbody>${statRows(R.L.st).map(p => `<tr class="${p.cl === 'your-club' ? 'your-row' : ''}"><td class="table-name">${esc(p.nm)}</td><td class="table-name">${esc(p.cl === 'your-club' ? 'Your Era XI' : F[S.D].find(c => c.id === p.cl)?.nm || p.cl)}</td><td>${p.ap}</td><td>${p.g}</td><td>${p.as}</td><td>${p.cs}</td></tr>`).join('')}</tbody></table></div><p class="roster-note">Statistics come from simulated appearances and goal events. Clean sheets are goalkeeper statistics.</p>`;
}

function results() {
  const i = R.L.tab.findIndex(c => c.me), q = R.L.tab[i];
  const cup = R.K.champ === 'your-club', unbeaten = R.L.unbeaten ?? streak(R.L.res);
  const honours = R.honours || [i === 0 ? 'League champions' : null, cup ? 'European Cup winners' : null, q.L === 0 ? 'Invincibles' : null, i === 0 && cup ? 'The double' : null].filter(Boolean);
  return `${progress(3)}<section class="result-hero"><div><span class="eyebrow">THE ${S.D}s SEASON IS IN THE BOOKS</span><h1>${i === 0 && cup ? 'A TEAM FOR THE AGES.' : i === 0 ? 'TOP OF THE LEAGUE.' : cup ? 'KINGS OF EUROPE.' : 'YOUR ERA. YOUR STORY.'}</h1><p>${esc(S.manager.nm)}'s ${esc(S.manager.f)} finished ${ordinal(i + 1)} in a 20-club league. ${cup ? 'Your fifteen brought home the European Cup.' : `The European Cup went to ${esc(R.K.champN)}.`}</p><div class="honours">${honours.map(h => `<span class="honour">${esc(h)}</span>`).join('')}</div></div><div class="result-metrics"><div><span>League place</span><b>${i + 1}<small> / 20</small></b></div><div><span>Points</span><b>${q.Pts}</b></div><div><span>Wins · Draws · Losses</span><b>${q.W}–${q.D}–${q.L}</b></div><div><span>Best unbeaten run</span><b>${unbeaten}<small> games</small></b></div></div></section><div class="results-tabs" role="tablist" aria-label="Season results">${[['league', 'League table'], ['fixtures', 'Your matches'], ['cup', 'European Cup'], ['stats', 'Player statistics'], ['lineup', 'Your XI'], ['challenges', 'Keep playing']].map(([v, l]) => `<button role="tab" data-tab="${v}" aria-selected="${tab === v}" aria-controls="result-panel" id="tab-${v}">${l}</button>`).join('')}</div><section id="result-panel" role="tabpanel" aria-labelledby="tab-${tab}">${tab === 'league' ? `<div class="results-layout"><div><h2 class="result-section-title">THE ${S.D}s ERA LEAGUE</h2>${table(R.L.tab)}<p class="roster-note">Double round robin · 38 matches per club · 3 points for a win · Ranked by points, goal difference, then goals scored.</p></div>${awards()}</div>` : tab === 'fixtures' ? fixtures() : tab === 'cup' ? `<h2 class="result-section-title">THE EUROPEAN CUP</h2>${cupRounds(R.K)}<p class="roster-note">Two legs through the semi-finals. A neutral final. Tied aggregates go to extra time and penalties; there is no away-goals rule.</p>` : tab === 'stats' ? stats() : tab === 'lineup' ? `<div class="draft-layout"><div><div class="review-copy"><h2>YOUR FINAL SQUAD</h2><p>Base ratings, fit, era losses and links are all visible. Swaps are locked after kick-off.</p></div>${limits()}</div>${lineup()}</div>` : challenges()}</section><div class="share-strip"><p>Seed ${S.seed} · ${S.D}s · Your draft choices are saved on this browser.</p><div class="actions"><button class="button button--small" id="share">Copy result ↗</button><button class="button button--quiet button--small" id="result-card">Result card ↓</button><button class="button button--quiet button--small" id="download">Download replay ↓</button><button class="button button--quiet button--small" id="replay">Replay this seed ↻</button></div></div>${limits()}`;
}

function ordinal(n) { return `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`; }
function streak(Q) { let b = 0, n = 0; for (const q of Q) { n = q.gf >= q.ga ? n + 1 : 0; b = Math.max(b, n); } return b; }

function challenges() {
  const ga = typeof E.gaunt === 'function', ci = typeof E.circuit === 'function';
  return `<div class="challenge-grid"><article class="challenge-card"><span class="eyebrow">ONE TEAM. EIGHT ERAS.</span><h2>ERA GAUNTLET</h2><p>Take your fifteen through football history. Face the strongest squad in each decade, starting in the 1950s. Lose a match, then retry the same boss with a fresh match seed.</p><button class="button" id="gauntlet-start" ${ga ? '' : 'disabled'}>${B ? 'Restart Gauntlet ↻' : 'Enter the Gauntlet ↗'}</button></article><article class="challenge-card"><span class="eyebrow">THE LONG ROAD TO GLORY</span><h2>TOURNAMENT CIRCUIT</h2><p>A run of 10–20 events across all decades, rotating knockout and league formats. The same squad travels with you; era adjustments are recalculated at every event.</p><label class="field-label" for="circuit-events">EVENTS</label><select id="circuit-events">${Array.from({ length: 11 }, (_, i) => `<option value="${i + 10}" ${i === 2 ? 'selected' : ''}>${i + 10} events</option>`).join('')}</select><button class="button button--small" id="circuit-start" ${ci ? '' : 'disabled'}>Play the circuit ↗</button></article></div>${B ? boss() : ''}${C ? circuit() : ''}`;
}

function boss() {
  const c = B.done ? null : E.boss(B), last = B.history.at(-1);
  return `<section class="boss-card"><span class="eyebrow">ERA GAUNTLET / ${B.done ? 'COMPLETE' : `${B.i + 1} OF 8`}</span><h3>${B.done ? 'EIGHT ERAS. CONQUERED.' : esc(c.nm)}</h3><p>${B.done ? `Your squad beat all eight decade bosses in ${B.history.length} attempts.` : `Playing in the ${B.Ds}s · Boss strength ${num(c.x)} · Your era-adjusted strength ${num(E.rate(club().T, B.Ds).ovr)}`}${last ? ` · Last match: ${last.M.gx}–${last.M.gy}${last.M.pw ? ' (penalties)' : ''}. ${last.won ? 'Victory.' : 'The same boss awaits.'}` : ''}</p>${B.done ? '' : `<button class="button button--acid" id="gauntlet-attempt">${last && !last.won ? 'Retry this boss ↻' : 'Face the boss ↗'}</button>`}</section><div class="mode-log">${B.history.slice().reverse().map(h => `<div class="mode-event"><div>${h.Ds}s · ${esc(h.opn || h.op)}<small>Attempt ${h.attempt} · ${h.M.pw ? 'Decided on penalties' : h.M.et ? 'After extra time' : '90 minutes'}</small></div><b>${h.M.gx}–${h.M.gy} · ${h.won ? 'WIN' : 'RETRY'}</b></div>`).join('')}</div>`;
}

function circuit() {
  return `<div class="page-heading"><div><span class="eyebrow">TOURNAMENT CIRCUIT / COMPLETE</span><h1>${C.totals.titles} TITLES. ${C.events.length} EVENTS.</h1><p>${C.totals.played} matches · ${C.totals.won} wins · ${C.totals.gf} scored · ${C.totals.ga} conceded</p></div></div><div class="mode-log">${C.events.map(c => `<div class="mode-event"><div>EVENT ${c.i} / ${c.Ds}s · ${esc(c.label)}<small>${esc(c.format)} · ${c.matches.filter(f => f.A === 'your-club' || f.B === 'your-club').length} of your matches${c.position ? ` · ${ordinal(c.position)} place` : ''}</small></div><b>${c.won ? 'CHAMPION ★' : c.position ? ordinal(c.position) : 'ELIMINATED'}</b></div>`).join('')}</div><p class="roster-note">Every event uses the same fifteen people. Match seeds and opponent eras change; draft choices stay fixed.</p>`;
}

function render() {
  $('#reset-open').hidden = !S;
  root.innerHTML = !S ? intro() : S.phase === 'manager' ? managers() : S.phase === 'results' ? results() : draft();
  document.body.setAttribute('aria-busy', String(busy));
}

async function play() {
  if (S.phase !== 'review' || busy) return;
  busy = true; render();
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    R = season(); S = { ...S, phase: 'results', season: true }; tab = 'league'; save();
    root.focus(); window.scrollTo({ top: 0, behavior: 'instant' });
  } finally { busy = false; render(); }
}

function share() {
  const i = R.L.tab.findIndex(c => c.me), q = R.L.tab[i];
  return `Football Era Lab · ${S.D}s\n${ordinal(i + 1)} / 20 · ${q.Pts} points · ${q.W}W ${q.D}D ${q.L}L\nEuropean Cup: ${R.K.champ === 'your-club' ? 'WINNERS' : R.K.champN}\n${S.manager.nm} · ${S.manager.f}\nSeed ${S.seed} · ${location.href.split('?')[0]}?seed=${S.seed}&era=${S.D}`;
}

function download() {
  const blob = new Blob([JSON.stringify({ game: 'Football Era Lab', data: G.meta.v, draft: S, result: share() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `Football Era Lab ${S.D}s Seed ${S.seed}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); notice('Replay downloaded with every draft choice.');
}

async function card() {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
  const g = c.getContext('2d'), T = team(G, S), Q = E.rate(T, S.D);
  const i = R.L.tab.findIndex(q => q.me), q = R.L.tab[i];
  const text = (s, x, y, size = 25, color = '#152e28', font = 'Trebuchet MS', max = 1050) => {
    g.fillStyle = color; g.font = `${size}px ${font}`;
    while (g.measureText(String(s)).width > max && size > 13) { size--; g.font = `${size}px ${font}`; }
    g.fillText(String(s), x, y);
  };
  g.fillStyle = '#f5f2e9'; g.fillRect(0, 0, 1200, 900);
  g.fillStyle = '#102823'; g.fillRect(0, 0, 1200, 148);
  text('FOOTBALL ERA LAB', 52, 73, 55, '#f5f2e9', 'Impact');
  text(`${S.D}s / YOUR ERA XI`, 55, 116, 20, '#d7f86c', 'Consolas');
  text(`${ordinal(i + 1)} / 20`, 53, 260, 94, '#152e28', 'Impact', 390);
  text('LEAGUE FINISH', 58, 293, 18, '#67776a', 'Consolas');
  text(`${q.Pts} POINTS`, 490, 216, 44, '#152e28', 'Impact');
  text(`${q.W} WINS · ${q.D} DRAWS · ${q.L} LOSSES`, 490, 257, 21);
  text(R.K.champ === 'your-club' ? 'EUROPEAN CUP WINNERS' : `CUP WINNERS: ${R.K.champN}`, 490, 295, 25, '#152e28', 'Impact', 650);
  g.strokeStyle = '#cdd4c4'; g.beginPath(); g.moveTo(55, 322); g.lineTo(1145, 322); g.stroke();
  text(`${S.manager.nm} / ${S.manager.f}`, 55, 364, 29, '#152e28', 'Georgia', 1090);
  text('STARTING ELEVEN', 55, 412, 18, '#67776a', 'Consolas');
  text('THE BENCH', 705, 412, 18, '#67776a', 'Consolas');
  Q.xi.forEach((p, j) => {
    text(p.s, 55, 449 + j * 30, 18, '#67776a', 'Consolas');
    text(p.c.nm, 125, 449 + j * 30, 23, '#152e28', 'Georgia', 470);
    text(Math.round(p.a), 605, 449 + j * 30, 25, '#152e28', 'Impact');
  });
  Q.bn.forEach((p, j) => {
    text(`B${j + 1}`, 705, 449 + j * 38, 18, '#67776a', 'Consolas');
    text(p.c.nm, 750, 449 + j * 38, 23, '#152e28', 'Georgia', 340);
    text(Math.round(p.a), 1110, 449 + j * 38, 25, '#152e28', 'Impact');
  });
  text(`OVERALL ${num(Q.ovr)}`, 705, 666, 48, '#152e28', 'Impact');
  text(`ATT ${num(Q.A)} / MID ${num(Q.M)} / DEF ${num(Q.Dk)}`, 705, 704, 18, '#67776a', 'Consolas', 440);
  g.fillStyle = '#102823'; g.fillRect(0, 802, 1200, 98);
  text(`REPLAY SEED ${S.seed} / ${S.D}s`, 55, 844, 24, '#d7f86c', 'Consolas');
  text('Simulated results. Historical coverage is incomplete. Every rating has a source in the game.', 55, 876, 17, '#f5f2e9');
  const b = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
  if (!b) throw new Error('Your browser could not create the result card. Copy the result text instead.');
  const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u;
  a.download = `Football Era Lab ${S.D}s Seed ${S.seed}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000); notice('Your result card is downloaded.');
}

root.addEventListener('submit', e => {
  if (e.target.id !== 'start-form') return;
  e.preventDefault();
  try { change(start($('#seed').value, D)); root.focus(); } catch (e) { notice(e.message, true); }
});

root.addEventListener('input', e => {
  if (e.target.id !== 'roster-search') return;
  query = e.target.value; $('#roster-list').innerHTML = rows();
});

root.addEventListener('change', async e => {
  if (e.target.id === 'roster-sort') { sort = e.target.value; $('#roster-list').innerHTML = rows(); }
  if (e.target.id === 'import-replay') {
    const old = { S, R, B, C };
    try {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 1000000) throw new Error('The replay file is too large. Choose a Football Era Lab replay JSON.');
      const raw = JSON.parse(await f.text());
      if (raw.game !== 'Football Era Lab') throw new Error('Choose a Football Era Lab replay JSON.');
      const next = valid(G, raw.draft);
      S = next; R = S.phase === 'results' ? season() : null; restore(); save(); render(); notice('Replay restored with your draft choices.');
    } catch (e) { ({ S, R, B, C } = old); notice(`Replay could not be restored: ${e.message}`, true); }
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
    if (b.dataset.era) { D = b.dataset.era === 'random' ? 'random' : Number(b.dataset.era); const seed = $('#seed').value; render(); $('#seed').value = seed; }
    else if (b.dataset.manager !== undefined) change(choose(G, S, Number(b.dataset.manager)), 'Manager chosen. Your squad picks begin now.');
    else if (b.id === 'manager-reroll') change(reroll(S));
    else if (b.id === 'squad-spin') change(spin(G, S));
    else if (b.id === 'squad-reroll') change(spin(G, S, true), 'Squad re-spun. Your one squad retry has been used.');
    else if (b.dataset.player) {
      sel = sel === b.dataset.player ? null : b.dataset.player; sw = null;
      const scroll = $('#roster-list').scrollTop; render(); $('#roster-list').scrollTop = scroll;
      if (sel && matchMedia('(max-width:780px)').matches) $('#lineup-instruction').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (b.dataset.slot !== undefined) {
      const i = Number(b.dataset.slot);
      if (S.phase === 'results') return;
      if (sel) {
        if (S.slots[i]) throw new Error('This slot is occupied. Choose an empty slot, or cancel the player selection to swap.');
        const n = G.people[sel].nm, next = place(G, S, sel, i);
        change(next, `${n} placed${next.spin !== S.spin ? '. Three picks complete.' : '.'}`);
      } else if (sw !== null) { if (sw === i) { sw = null; render(); } else change(swap(S, sw, i), 'Lineup swapped. Ratings updated.'); }
      else if (S.slots[i]) { sw = i; render(); }
      else notice('Choose a player from the roster first.');
    } else if (b.id === 'simulate') await play();
    else if (b.dataset.tab) { tab = b.dataset.tab; render(); }
    else if (b.id === 'replay') { R = B = C = null; change(start(S.seed, S.D), 'Same seed. A fresh set of choices.'); window.scrollTo({ top: 0, behavior: 'instant' }); }
    else if (b.id === 'share') {
      try { await navigator.clipboard.writeText(share()); notice('Result copied. Share your season and replay seed.'); }
      catch { const el = document.createElement('textarea'); el.value = share(); document.body.append(el); el.select(); const ok = document.execCommand('copy'); el.remove(); notice(ok ? 'Result copied.' : share()); }
    } else if (b.id === 'download') download();
    else if (b.id === 'result-card') await card();
    else if (b.id === 'gauntlet-start') { B = E.gaunt(S.seed, club(), F, { Ds: 1950 }); S = { ...S, mode: { ...S.mode, ga: 0 } }; save(); render(); }
    else if (b.id === 'gauntlet-attempt') { B = E.retry(B); S = { ...S, mode: { ...S.mode, ga: B.history.length } }; save(); render(); }
    else if (b.id === 'circuit-start') {
      const events = Number($('#circuit-events').value); busy = true; document.body.setAttribute('aria-busy', 'true'); b.disabled = true; b.textContent = 'Playing events…';
      try { await new Promise(resolve => setTimeout(resolve, 30)); C = E.circuit(S.seed, club(), F, { events, Ds: S.D }); S = { ...S, mode: { ...S.mode, ci: events } }; save(); } finally { busy = false; render(); }
    }
  } catch (e) { busy = false; document.body.setAttribute('aria-busy', 'false'); notice(e.message, true); }
});

$('#about-open').addEventListener('click', () => $('#about-dialog').showModal());
$('#reset-open').addEventListener('click', () => $('#reset-dialog').showModal());
$('#reset-cancel').addEventListener('click', () => $('#reset-dialog').close());
$('#reset-confirm').addEventListener('click', () => { S = R = B = C = null; sel = sw = null; try { localStorage.removeItem(STORE); } catch {} $('#reset-dialog').close(); render(); window.scrollTo({ top: 0, behavior: 'instant' }); });

function restore() {
  B = C = null;
  if (S.phase !== 'results') return;
  if (S.mode?.ga !== undefined) {
    B = E.gaunt(S.seed, club(), F, { Ds: 1950 });
    for (let i = 0; i < S.mode.ga && !B.done; i++) B = E.retry(B);
  }
  if (S.mode?.ci) C = E.circuit(S.seed, club(), F, { events: S.mode.ci, Ds: S.D });
}

async function boot() {
  try {
    const res = await fetch('../data/game.json');
    if (!res.ok) throw new Error('The archive could not be loaded. Please reload the page.');
    G = await res.json();
    if (!G.meta || !G.people || !G.cards || !G.managers || !G.formations) throw new Error('The football archive is incomplete.');
    if (G.params && typeof E.cfg === 'function') E.cfg(G.params);
    F = fields(G);
    $('#data-status').textContent = `${G.meta.counts.people.toLocaleString()} PEOPLE · ${G.meta.counts.combos} CLUB ERAS`;
    $('#about-content').innerHTML = `<span class="eyebrow">A FOOTBALL HISTORY PLAYGROUND</span><h2>MAKE YOUR ERA XI.</h2><p>Choose the decade your season takes place in. Draft players from across all eight decades; the further they travel in time, the larger their era adjustment.</p><h3>Five choices for the touchline</h3><p>Your first spin offers five manager + formation combinations. Keep one. You have two re-spins before choosing; the formation stays fixed for the draft.</p><h3>Three picks from each squad</h3><p>Spin five club-decade squads. Each shows its complete available archive roster. Select a player, then any empty pitch or bench slot. You choose fifteen unique people. There is one squad re-spin for the entire draft, available before a squad's first pick.</p><h3>Position matters</h3><p>Natural position: no loss. One step away: 10%. Two steps: 22%. More distant: 35%. Keeper to outfield or outfield to keeper: 75%. The four bench slots have no position loss. Selecting a player previews adjusted ratings on empty slots before placing.</p><h3>Get the shape right</h3><p>Click two occupied slots to swap, including the bench. Links between club teammates and duos add small bonuses. Signature players upgrade your manager's grades. Formation balance changes attack, midfield and defence.</p><h3>The season, and beyond</h3><p>Every fixture in the 20-club league is simulated. The European Cup has 16 clubs, two-legged ties and a neutral final. The Gauntlet lets you retry decade bosses; the circuit runs 10–20 tournaments with your final squad.</p><div class="model-callout">Historical coverage is incomplete. Published FIFA ratings, nearby editions, EA Icon/Hero reconstructions and estimated ratings are labelled on every card. The game uses its own fit, era and chemistry rules. Simulated results are for play, not historical forecasts.</div>`;
    let resumed = false;
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) { S = valid(G, JSON.parse(saved)); if (S.phase === 'results') R = season(); restore(); resumed = true; }
    } catch (e) { S = null; R = null; notice(`Your saved run could not be resumed: ${e.message} Start a new draft below.`, true); }
    render();
    const url = new URL(location.href);
    if (!resumed && url.searchParams.has('seed')) {
      $('#seed').value = url.searchParams.get('seed');
      const era = Number(url.searchParams.get('era')); if (DECADES.includes(era)) { D = era; const seed = $('#seed').value; render(); $('#seed').value = seed; }
    }
    if (resumed) notice('Your saved run is back. Every placed player is where you left them.');
  } catch (e) {
    root.innerHTML = `<div class="loading"><span class="eyebrow">ARCHIVE UNAVAILABLE</span><h1>THE ARCHIVE NEEDS A MOMENT.</h1><p>${esc(e.message)}</p><p><a class="button" href="./">Try again ↻</a></p></div>`;
    $('#data-status').textContent = 'ARCHIVE UNAVAILABLE';
  }
}

boot();
