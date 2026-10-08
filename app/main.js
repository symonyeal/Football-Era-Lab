import * as E from './engine/index.js';
import { STORE, DECADES, start, choose, reroll, spin, place, swap, form, preview, valid, shape } from './draft.js';
import { fields } from './data.js';
import * as Rn from './run.js';
import { wk, code, uncode, h2h } from './play.js';
import { U, esc, nm, club, kv, rules } from './ui/kit.js';
import { intro, teams } from './ui/lobby.js';
import { desk, rosterList } from './ui/desk.js';
import { results, about, season, me, shareText, cardImage, signing } from './ui/season.js';

// Browser game controller. Views render from the shared state U (app/ui/kit.js); this module turns
// events into new states. change(next, msg, o): commit a draft state; o.edit marks a lineup edit
// (swap, move, formation) that undo can reverse; any other change ends the undo history, so a pick,
// spin or kick-off is final. render() rebuilds the screen and restores focus to the element with
// the same data-key, or to U.focus when an action names the next target.
const root = document.querySelector('#game'), $ = s => document.querySelector(s);
const rM = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const phone = () => window.matchMedia?.('(max-width: 767px)').matches;
let timer;

function notice(msg, error = false) {
  const n = $('#notice'); n.textContent = msg; n.hidden = false;
  n.classList.toggle('toast--error', error); n.setAttribute('role', error ? 'alert' : 'status'); clearTimeout(timer);
  timer = setTimeout(() => { n.hidden = true; }, error ? 9000 : 4000);
}
function save() {
  try { if (U.S) localStorage.setItem(STORE, JSON.stringify(U.S)); }
  catch { notice('This browser cannot save the run. Keep this page open or download your replay.', true); }
}
function change(next, msg, o = {}) {
  if (o.edit) { U.undo.push({ f: U.S.f, slots: U.S.slots }); U.redo = []; } else { U.undo = []; U.redo = []; }
  U.S = next; U.sel = o.keepSel ? U.sel : null; U.sw = null; U.tgt = null; U.pv = null; U.moved = o.moved || new Set();
  save(); render(); if (msg) notice(msg);
}

function steps(S) {
  const k = S.phase === 'manager' ? 1 : S.phase === 'draft' ? 2 : S.phase === 'review' ? 3 : 4;
  const st = (lab, j) => `<li class="stp ${k === j ? 'on' : k > j ? 'ok' : ''}" ${k === j ? 'aria-current="step"' : ''}><span class="pp">${k > j ? '✓' : j}</span>${lab}${j === 2 ? `<span class="sqp" aria-label="${Math.min(5, S.spin)} of 5 squads drafted">${[0, 1, 2, 3, 4].map(i => `<i class="${i < S.spin ? 'ok' : i === S.spin && k === 2 ? 'on' : ''}"></i>`).join('')}</span>` : ''}</li>`;
  return `<ol>${st('Team', 1)}${st('Squads', 2)}${st('Review', 3)}${st('Season', 4)}</ol>`;
}
function bar() {
  const S = U.S, edit = !!S && ['draft', 'review'].includes(S.phase);
  $('#reset-open').hidden = !S;
  $('#undo').hidden = !edit; $('#undo').disabled = !U.undo.length;
  $('#redo').hidden = !edit; $('#redo').disabled = !U.redo.length;
  $('#run-meta').textContent = S ? `${S.wk ? `Weekly ${S.wk} · ` : ''}${rules(S)} · ${S.D}s · seed ${S.seed}` : '';
  $('#steps').innerHTML = S ? steps(S) : '';
}
function render() {
  const a = document.activeElement, key = a?.dataset?.key || (a?.id && root.contains(a) ? `#${a.id}` : null);
  bar();
  const v = !U.S ? 'intro' : U.S.phase === 'manager' ? 'teams' : U.S.phase === 'results' ? 'results' : 'desk';
  root.innerHTML = v === 'intro' ? intro() : v === 'teams' ? teams() : v === 'results' ? results() : desk();
  if (document.body.dataset.screen && document.body.dataset.screen !== v) $('#notice').hidden = true;
  document.body.dataset.screen = v;
  document.body.dataset.era = U.S?.D || (U.D === 'random' ? '' : U.D);
  document.body.setAttribute('aria-busy', String(U.busy));
  const k = U.focus || key; U.focus = null;
  if (k) (k.startsWith('#') ? document.getElementById(k.slice(1)) : root.querySelector(`[data-key="${CSS.escape(k)}"]`))?.focus({ preventScroll: !k.startsWith('#') && !phone() });
}

// Best open pitch slot for the selected player, by adjusted rating after fit, era and links.
function best() {
  const { G, S } = U, SH = shape(G, S.f);
  let b = -1, a = -Infinity;
  SH.forEach((_, i) => { if (S.slots[i]) return; const v = preview(G, S, U.sel, i).a; if (v > a) { a = v; b = i; } });
  return b;
}
function select(b) {
  const p = b.dataset.player;
  if (b.getAttribute('aria-disabled') === 'true') return notice(b.title || 'This player cannot be picked.');
  if (U.pv) return notice('Apply or keep the previewed formation first.');
  U.sel = U.sel === p ? null : p; U.sw = null; U.tgt = null;
  let i = U.sel ? best() : -1;
  if (U.sel && i < 0) i = U.S.slots.findIndex((r, i) => i >= 11 && !r);
  U.focus = !U.sel ? `p:${p}` : i < 0 ? `p:${p}` : phone() ? `t:${i}` : `s:${i}`;
  render();
}
function pick(i) {
  const S = U.S, p = U.sel, rows = [...root.querySelectorAll('#roster-list .pr:not([aria-disabled])')].map(r => r.dataset.player);
  const next = place(U.G, S, p, i), after = rows[rows.indexOf(p) + 1] || rows[rows.indexOf(p) - 1];
  U.focus = next.combo ? (after ? `p:${after}` : '#roster-search') : next.phase === 'review' ? '#simulate' : '#squad-spin';
  change(next, `${nm(p)} placed${next.spin !== S.spin ? '. Three picks complete.' : '.'}`);
}
function slot(i) {
  const S = U.S;
  if (S.phase === 'results') return;
  if (U.pv) return notice('Apply or keep the previewed formation first.');
  if (U.sel) {
    if (S.slots[i]) throw new Error('This place is taken. Choose an open place, or cancel the selection to swap.');
    return pick(i);
  }
  if (U.sw !== null) {
    if (U.sw === i) { U.sw = null; U.focus = `s:${i}`; return render(); }
    const a = U.sw; U.focus = `s:${i}`;
    return change(swap(S, a, i), S.slots[a] && S.slots[i] ? 'Places swapped.' : 'Player moved.', { edit: true });
  }
  if (S.slots[i]) { U.sw = i; U.focus = `s:${i}`; return render(); }
  notice('Choose a player from the squad first.');
}
function apply() {
  const S = U.S, f = U.pv, next = form(U.G, S, f), i0 = new Map(S.slots.slice(0, 11).map((r, i) => [r?.p, i]));
  const mv = new Set(next.slots.slice(0, 11).filter((r, i) => r && i0.get(r.p) !== i).map(r => r.p));
  U.focus = `f:${f}`;
  change(next, `${f} applied · ${mv.size} player${mv.size === 1 ? '' : 's'} moved. Undo restores ${S.f}.`, { edit: true, keepSel: true, moved: mv });
}
function undo(redo) {
  const A = redo ? U.redo : U.undo, B = redo ? U.undo : U.redo;
  if (!A.length || !U.S || !['draft', 'review'].includes(U.S.phase)) return;
  const x = A.pop(); B.push({ f: U.S.f, slots: U.S.slots });
  U.S = { ...U.S, f: x.f, slots: x.slots }; U.sw = null; U.pv = null; U.tgt = null; U.moved = new Set();
  save(); render(); notice(redo ? 'Lineup change redone.' : `Lineup change undone: ${U.S.f}.`);
}

async function reel(next) {
  const h = $('#reveal-club'), box = $('#reveal');
  const done = () => { U.q = ''; U.ln = 'All'; U.fit = false; U.cmp = []; U.view = 'squad'; U.focus = '#squad-club'; change(next, `${club(next.combo)} drawn.`); };
  if (rM || !h) return done();
  const K = U.G.combos; U.busy = true; document.body.setAttribute('aria-busy', 'true'); box.classList.add('rolling');
  root.querySelectorAll('#squad-spin, [data-act="spin"]').forEach(b => { b.disabled = true; });
  try {
    for (let i = 0; i < 14; i++) {
      const c = K[Math.floor(Math.random() * K.length)];
      h.textContent = club(`${c.q}:${c.D}`); box.style.cssText = kv(c.q);
      await new Promise(r => setTimeout(r, 45 + i * 6));
    }
    const [q] = next.combo.split(':'); h.textContent = club(next.combo); box.style.cssText = kv(q); box.classList.add('landed');
    await new Promise(r => setTimeout(r, 380));
  } finally { U.busy = false; }
  done();
}

async function play() {
  if (U.S.phase !== 'review' || U.busy) return;
  if (U.pv) return notice('Apply or keep the previewed formation first.');
  U.busy = true; render();
  try {
    await new Promise(r => setTimeout(r, 30));
    U.R = season(); U.S = { ...U.S, phase: 'results' }; U.tab = 'league'; U.undo = []; U.redo = []; save();
    root.focus(); window.scrollTo({ top: 0, behavior: 'instant' });
  } finally { U.busy = false; render(); }
}
function download() {
  const b = new Blob([JSON.stringify({ game: 'Football Era Lab', data: U.G.meta.v, draft: U.S, result: shareText() }, null, 2)], { type: 'application/json' });
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = `Football Era Lab ${U.S.D}s Seed ${U.S.seed}.json`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1000); notice('Replay downloaded with every draft choice.');
}
async function card() {
  const b = await cardImage(), u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = `Football Era Lab ${U.S.D}s Seed ${U.S.seed}.png`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); notice('Your result card is downloaded.');
}
const setRun = (s, msg) => { U.S = { ...U.S, mode: { ...U.S.mode, run: s } }; save(); render(); if (msg) notice(msg); };
async function copy(t, ok) {
  try { await navigator.clipboard.writeText(t); notice(ok); }
  catch { const el = document.createElement('textarea'); el.value = t; document.body.append(el); el.select(); const k = document.execCommand('copy'); el.remove(); notice(k ? ok : t); }
}

root.addEventListener('submit', e => {
  if (e.target.id !== 'start-form') return;
  e.preventDefault();
  try { U.seed = $('#seed').value; U.insp = 0; U.f0 = null; U.view = 'squad'; change(start(U.seed, U.D, U.cap)); root.focus(); } catch (x) { notice(x.message, true); }
});
root.addEventListener('input', e => {
  if (e.target.id === 'roster-search') { U.q = e.target.value; $('#roster-list').innerHTML = rosterList(); }
  if (e.target.id === 'seed') U.seed = e.target.value;
});
root.addEventListener('toggle', e => { if (e.target.id === 'blocked') U.open = e.target.open; }, true);
root.addEventListener('change', async e => {
  const t = e.target;
  if (t.name === 'draft-rules') U.cap = t.value === 'cap';
  if (t.id === 'roster-sort') { U.sort = t.value; $('#roster-list').innerHTML = rosterList(); }
  if (t.id === 'fit-only') { U.fit = t.checked; $('#roster-list').innerHTML = rosterList(); }
  if (t.id === 'form-pick' && t.value) { U.pv = t.value === U.S.f ? null : t.value; U.focus = U.pv ? '#form-status' : '#form-pick'; render(); }
  if (t.id === 'start-formation') { U.f0 = t.value; U.focus = '#start-formation'; render(); }
  if (t.id === 'circuit-events') U.ev = Number(t.value);
  if (t.dataset.fa !== undefined) {
    const j = Number(t.dataset.fa), s = U.S.mode.run, x = signing(s, Rn.offers(U.G, U.F, s)[j], Number($(`#fa-pick-${j}`).value), Number($(`#fa-slot-${j}`).value));
    $(`#fa-price-${j}`).textContent = x.tx; $(`[data-take="${j}"]`).disabled = !x.ok;
  }
  if (t.dataset.upPick !== undefined) {
    const j = Number(t.dataset.upPick), s = U.S.mode.run, u = Rn.offers(U.G, U.F, s)[j].list[Number(t.value)], n = s.pat - u.cost;
    $(`#up-price-${j}`).innerHTML = n < 1 ? '<p class="warn small">Not enough patience: the board keeps at least 1.</p>' : `<p class="small">Leaves ${n} patience${n <= Rn.B_LOSS(s.lost) ? ': one boss loss would end the run' : ''}.</p>`;
    $(`[data-take="${j}"]`).disabled = n < 1;
  }
  if (t.id === 'import-replay') {
    const old = { S: U.S, R: U.R, C: U.C, H: U.H, tab: U.tab };
    try {
      const f = t.files[0]; if (!f) return;
      if (f.size > 2000000) throw new Error('The replay file is too large.');
      const raw = JSON.parse(await f.text());
      if (raw.game !== 'Football Era Lab') throw new Error('Choose a Football Era Lab replay file.');
      U.S = valid(U.G, raw.draft); U.R = U.S.phase === 'results' ? season() : null; U.C = null; U.H = null; U.tab = 'league';
      U.undo = []; U.redo = []; render(); save(); notice('Replay restored with your draft choices.');
    } catch (x) { Object.assign(U, old); render(); notice(`Replay could not be restored: ${x.message}`, true); }
  }
});

// Keyboard: arrow keys move inside the squad list and around the pitch; tabs follow the ARIA pattern.
function near(el, key) {
  const box = el.closest('.pt, .bn')?.parentElement?.closest('.lineup, .sheet') || el.parentElement;
  const all = [...box.querySelectorAll('[data-slot]:not([disabled]), [data-target]:not([disabled])')].filter(x => x.offsetParent !== null);
  const r = el.getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2], d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[key];
  let best = null, bv = Infinity;
  for (const x of all) {
    if (x === el) continue;
    const q = x.getBoundingClientRect(), v = [q.left + q.width / 2 - c[0], q.top + q.height / 2 - c[1]], along = v[0] * d[0] + v[1] * d[1];
    if (along <= 4) continue;
    const off = Math.abs(v[0] * d[1] - v[1] * d[0]), s = along + 2 * off;
    if (s < bv) { bv = s; best = x; }
  }
  return best;
}
root.addEventListener('keydown', e => {
  const t = e.target;
  if (t.matches('[data-tab]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    const Q = [...root.querySelectorAll('[data-tab]')], i = Q.indexOf(t);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? Q.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + Q.length) % Q.length;
    U.tab = Q[n].dataset.tab; U.focus = `#tab-${U.tab}`; render();
  } else if (t.matches('.pr') && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    const Q = [...root.querySelectorAll('#roster-list .pr')].filter(x => x.offsetParent !== null), i = Q.indexOf(t);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? Q.length - 1 : Math.max(0, Math.min(Q.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    Q.forEach(x => { x.tabIndex = -1; }); Q[n].tabIndex = 0; Q[n].focus();
  } else if ((t.matches('[data-slot]') || t.matches('[data-target]')) && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const x = near(t, e.key); if (x) { t.tabIndex = -1; x.tabIndex = 0; x.focus(); }
  }
});
document.addEventListener('keydown', e => {
  const typing = e.target.matches?.('input, textarea, select');
  if (e.key === 'Escape' && U.S && !$('dialog[open]')) {
    if (U.pv) { U.pv = null; U.focus = `f:${U.S.f}`; render(); }
    else if (U.sel) { const p = U.sel; U.sel = null; U.tgt = null; U.focus = `p:${p}`; render(); }
    else if (U.sw !== null) { const i = U.sw; U.sw = null; U.focus = `s:${i}`; render(); }
  } else if (e.key === '/' && !typing && $('#roster-search')) { e.preventDefault(); $('#roster-search').focus(); }
  else if ((e.ctrlKey || e.metaKey) && !typing && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) { e.preventDefault(); undo(e.key === 'y' || e.shiftKey); }
});

root.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || b.disabled || U.busy) return;
  const { G } = U;
  try {
    if (b.dataset.era) { U.D = b.dataset.era === 'random' ? 'random' : Number(b.dataset.era); render(); root.querySelector(`[data-era="${b.dataset.era}"]`)?.focus(); }
    else if (b.id === 'weekly') { const w = wk(); U.insp = 0; U.f0 = null; change({ ...start(w.seed, w.D, true), wk: w.id }, `Weekly challenge ${w.id}: Salary cap in the ${w.D}s, one club order for everyone.`); }
    else if (b.dataset.inspect !== undefined) { U.insp = Number(b.dataset.inspect); U.f0 = null; U.focus = '#start-formation'; render(); }
    else if (b.dataset.manager !== undefined || b.dataset.choose !== undefined) {
      const i = Number(b.dataset.manager ?? b.dataset.choose), f = i === U.insp && U.f0 ? U.f0 : undefined, s = choose(G, U.S, i, f);
      U.view = 'squad'; U.focus = '#squad-spin';
      change(s, `${s.manager.nm} chosen, starting in ${s.f}. Your squad draws begin now.`);
    }
    else if (b.id === 'manager-reroll') { U.insp = 0; U.f0 = null; U.focus = '#manager-reroll'; change(reroll(U.S)); }
    else if (b.id === 'squad-spin' || b.dataset.act === 'spin') await reel(spin(G, U.S));
    else if (b.id === 'squad-reroll') await reel(spin(G, U.S, true));
    else if (b.dataset.player) select(b);
    else if (b.dataset.slot !== undefined) slot(Number(b.dataset.slot));
    else if (b.dataset.target !== undefined) { U.tgt = Number(b.dataset.target); U.focus = '#place-confirm'; render(); }
    else if (b.id === 'place-confirm' && U.tgt !== null) pick(U.tgt);
    else if (b.id === 'place-best' || b.id === 'sheet-best') { const i = best(); if (i >= 0) pick(i); }
    else if (b.id === 'sheet-close') { const p = U.sel; U.sel = null; U.tgt = null; U.focus = `p:${p}`; render(); }
    else if (b.id === 'sheet-inspect') { const d = $('#sheet-insp'); d.hidden = !d.hidden; b.setAttribute('aria-expanded', String(!d.hidden)); b.textContent = d.hidden ? 'Details' : 'Hide details'; }
    else if (b.dataset.form) {
      const f = b.dataset.form;
      U.pv = f === U.S.f || U.pv === f ? null : f; U.focus = U.pv ? '#form-status' : `f:${f}`; render();
    }
    else if (b.id === 'form-apply' && U.pv) apply();
    else if (b.id === 'form-cancel') { const f = U.pv; U.pv = null; U.focus = f ? `f:${U.S.f}` : null; render(); }
    else if (b.dataset.line) { U.ln = b.dataset.line; render(); root.querySelector(`[data-line="${b.dataset.line}"]`)?.focus(); }
    else if (b.id === 'clear-filters') { U.q = ''; U.ln = 'All'; U.fit = false; U.focus = '#roster-search'; render(); }
    else if (b.dataset.view) { U.view = b.dataset.view; render(); root.querySelector(`.seg2 [data-view="${U.view}"]`)?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); }
    else if (b.dataset.cmp) { const p = b.dataset.cmp; U.cmp = U.cmp.includes(p) ? U.cmp.filter(x => x !== p) : [...U.cmp, p].slice(-3); render(); }
    else if (b.id === 'simulate' || b.dataset.act === 'simulate') await play();
    else if (b.dataset.tab) { U.tab = b.dataset.tab; U.focus = `#tab-${U.tab}`; render(); }
    else if (b.id === 'replay') { U.R = U.C = U.H = null; U.seed = String(U.S.seed); change(start(U.S.seed, U.S.D, !!U.S.cap), `Same seed and ${rules(U.S)} rules. A fresh set of choices.`); window.scrollTo({ top: 0, behavior: 'instant' }); }
    else if (b.id === 'share') await copy(shareText(), 'Result copied. Share your season and replay seed.');
    else if (b.id === 'download') download();
    else if (b.id === 'result-card') await card();
    else if (b.id === 'run-start') { const r = Rn.runNew(U.S.seed, U.S, $('#run-map').value); setRun(r, `The Gauntlet begins in the ${Rn.D_of(r)}s.`); }
    else if (b.id === 'run-round') setRun(Rn.runRound(G, U.F, U.S.mode.run));
    else if (b.id === 'run-boss') setRun(Rn.runPlayBoss(G, U.F, U.S.mode.run));
    else if (b.dataset.respin) setRun(Rn.respin(G, U.F, U.S.mode.run, b.dataset.respin === 'premium'));
    else if (b.id === 'run-hop') {
      const Q = [...root.querySelectorAll('[data-hop-pick]:checked')], sel = { old: [], neu: [], out: [] };
      for (const k of ['old', 'neu']) for (const x of Q.filter(x => x.dataset.hopPick === k)) {
        const v = $(`#hop-out-${k}-${x.value}`).value;
        if (v === '') throw new Error('Choose a departing squad player for each signing.');
        sel[k].push(Number(x.value)); sel.out.push(Number(v));
      }
      setRun(Rn.hop(G, U.S.mode.run, sel));
    }
    else if (b.id === 'run-form-apply') { const f = $('#run-form').value; setRun(Rn.runForm(G, U.S.mode.run, f), `Formation changed to ${f}. Cards, bench and cap charges unchanged.`); }
    else if (b.id === 'run-swap') setRun(Rn.runSwap(U.S.mode.run, Number($('#run-swap-a').value), Number($('#run-swap-b').value)));
    else if (b.id === 'run-next') setRun(Rn.nextAct(U.S.mode.run));
    else if (b.dataset.take !== undefined) {
      const j = Number(b.dataset.take), o = { pick: Number($(`#fa-pick-${j}`)?.value ?? $(`#up-pick-${j}`)?.value ?? 0), slot: Number($(`#fa-slot-${j}`)?.value ?? 0), player: Number($(`#dev-player-${j}`)?.value ?? 0) };
      setRun(Rn.take(G, U.F, U.S.mode.run, j, o));
    } else if (b.id === 'circuit-start') {
      U.busy = true; document.body.setAttribute('aria-busy', 'true'); b.textContent = 'Playing events…';
      try { await new Promise(r => setTimeout(r, 30)); U.C = E.circuit(U.S.seed, me(), U.F, { events: U.ev, Ds: U.S.D }); U.S = { ...U.S, mode: { ...U.S.mode, ci: U.ev } }; save(); }
      finally { U.busy = false; render(); }
    } else if (b.id === 'copy-code') await copy(code(G, U.S), 'Team code copied. Send it to a friend.');
    else if (b.id === 'h2h-play') {
      const t = uncode(G, $('#their-code').value);
      if (t.cap !== !!U.S.cap) throw new Error(`Your team uses ${rules(U.S)} rules. Ask your friend for a matching ${rules(U.S)} team code, or start a draft with their rules.`);
      U.H = h2h(U.S.seed, { id: 'your-club', nm: 'Your Era XI', T: me().T, D: U.S.D }, { id: 'friend', nm: "Friend's XI", T: t.T, D: t.D });
      render(); notice(U.H.w === 'your-club' ? 'You won the tie.' : 'Your friend won the tie.');
    }
  } catch (x) { U.busy = false; document.body.setAttribute('aria-busy', 'false'); notice(x.message, true); }
});
$('#undo').addEventListener('click', () => undo(false));
$('#redo').addEventListener('click', () => undo(true));
$('#about-open').addEventListener('click', () => $('#about-dialog').showModal());
$('#reset-open').addEventListener('click', () => $('#reset-dialog').showModal());
$('#reset-cancel').addEventListener('click', () => $('#reset-dialog').close());
$('#reset-confirm').addEventListener('click', () => {
  Object.assign(U, { S: null, R: null, C: null, H: null, sel: null, sw: null, pv: null, undo: [], redo: [], cap: true, seed: String(Math.floor(Math.random() * 4294967296)) });
  try { localStorage.removeItem(STORE); } catch { /* storage blocked */ }
  $('#reset-dialog').close(); render(); window.scrollTo({ top: 0, behavior: 'instant' });
});

async function boot() {
  U.seed = String(Math.floor(Math.random() * 4294967296));
  try {
    const res = await fetch(new URL('../data/game.json', import.meta.url));
    if (!res.ok) throw new Error('The archive could not be loaded. Please reload the page.');
    U.G = await res.json();
    if (!U.G.meta || !U.G.people || !U.G.cards || !U.G.managers || !U.G.formations) throw new Error('The football archive is incomplete.');
    if (U.G.params) E.cfg(U.G.params);
    U.F = fields(U.G);
    $('#about-content').innerHTML = about();
    $('#data-status').textContent = `${new Set(U.G.combos.map(c => c.q)).size} clubs · ${U.G.meta.counts.combos} club eras · ${U.G.meta.counts.people.toLocaleString()} people`;
    let resumed = false;
    try {
      const sv = localStorage.getItem(STORE);
      if (sv) {
        U.S = valid(U.G, JSON.parse(sv)); U.cap = !!U.S.cap; if (U.S.phase === 'results') U.R = season();
        if (U.S.mode?.ci) { U.ev = U.S.mode.ci; U.C = E.circuit(U.S.seed, me(), U.F, { events: U.ev, Ds: U.S.D }); }
        resumed = true;
      }
    } catch (x) { U.S = U.R = U.C = null; notice(`Your saved run could not be resumed: ${x.message} Start a new draft below.`, true); }
    const u = new URL(location.href);
    if (!resumed && ['0', '1'].includes(u.searchParams.get('cap'))) U.cap = u.searchParams.get('cap') === '1';
    if (!resumed && u.searchParams.has('seed')) {
      U.seed = u.searchParams.get('seed');
      const era = Number(u.searchParams.get('era')); if (DECADES.includes(era)) U.D = era;
    }
    render();
    if (resumed) notice('Your saved run is back where you left it.');
  } catch (x) {
    root.innerHTML = `<div class="loading"><p class="eyebrow">Archive unavailable</p><h1>The archive needs a moment</h1><p>${esc(x.message)}</p><p><a class="btn" href="./">Try again ↻</a></p></div>`;
    $('#data-status').textContent = 'Archive unavailable';
  }
}
boot();
