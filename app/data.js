import { best, rate } from './engine/index.js';
import { hydrate, shape, DECADES } from './draft.js';

export function fields(G) {
  return Object.fromEntries(DECADES.map(D => [D, (G.opp[D] || []).map(o => {
    const key = `${o.q}:${D}`;
    const cards = (G.cards[key] || []).map(c => hydrate(G, { k: key, p: c.p }));
    const S = shape(G, o.m.f);
    const T = { m: o.m, S, ...best(cards, S, D) };
    return { id: key, nm: `${G.clubs[o.q].nm} · ${D}s`, T, x: rate(T, D).ovr, q: o.q, D };
  })]));
}
