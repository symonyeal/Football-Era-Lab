// WCAG 2.2 contrast of the colours in app/style.css: text 4.5:1 (SC 1.4.3); focus ring and selection outline 3:1 (SC 1.4.11).
// Era and kit colours are decorative (bars, glows, rings beside named text) and carry no text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../app/style.css', import.meta.url), 'utf8');
const root = css.match(/:root\{([^}]*)\}/)[1];
const T = Object.fromEntries([...root.matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
const prism = root.match(/--tS:([^;]*)/)[1].match(/#[0-9A-Fa-f]{6}/g);
const rule = s => css.match(new RegExp(`(?:^|\\})${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`, 'm'))[1];
const prop = (s, k) => rule(s).match(new RegExp(`(?:^|;)${k}:([^;]+)`))?.[1].trim();
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// relative luminance L and contrast (L1 + 0.05)/(L2 + 0.05), WCAG 2.2 §1.4.3
const L = h => { const [r, g, b] = rgb(h).map(u => u / 255).map(u => u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const C = (a, b) => { const [x, y] = [L(a), L(b)].sort((u, v) => v - u); return (x + 0.05) / (y + 0.05); };
// rgba(r, g, b, a) composited over the opaque colour b; a missing background is b itself
const over = (s, b) => {
  if (!s) return b;
  const [r, g, bl, a] = s.match(/rgba\(([^)]*)\)/)[1].split(',').map(Number);
  return '#' + [r, g, bl].map((u, i) => Math.round(a * u + (1 - a) * rgb(b)[i]).toString(16).padStart(2, '0')).join('');
};
const at = (f, b, k) => assert.ok(C(f, b) >= k, `${f} on ${b}: ${C(f, b).toFixed(2)} < ${k}`);
const N = ['n0', 'n1', 'n2', 'n3'].map(k => T[k]), grass = [T.g1, T.g2];

test('text colours reach 4.5:1 on every surface', () => {
  for (const f of ['ink', 'ink2', 'ink3', 'good', 'warn', 'bad']) for (const b of N) at(T[f], b, 4.5);
});

test('dark text reaches 4.5:1 on tier badges, the S prism and white buttons', () => {
  for (const b of [T.tA, T.tB, T.tC, T.tD, ...prism, '#FFFFFF']) at(T.on, b, 4.5);
});

test('pitch names and fit deltas reach 4.5:1 over both grass stripes', () => {
  for (const g of grass) {
    at('#FFFFFF', over(prop('.tk .n', 'background'), g), 4.5);
    for (const f of [prop('.tk .s', 'color'), T.warn, T.bad]) at(f, over(prop('.tk .s', 'background'), g), 4.5);
  }
});

test('the focus ring and the white selection outline reach 3:1 on every surface and on the grass', () => {
  for (const b of [...N, ...grass]) { at(T.focus, b, 3); at('#FFFFFF', b, 3); }
});

test('error notices reach 4.5:1', () => {
  for (const f of [T.ink, T.bad]) at(f, prop('.toast--error', 'background'), 4.5);
});
