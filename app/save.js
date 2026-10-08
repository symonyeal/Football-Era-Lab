// Saved drafts retain their own validation rules; the career is validated separately against its draft.
import { valid } from './draft.js';
import { validCareer } from './career.js';

export function restore(G, raw) {
  const s = valid(G, raw), c = raw.mode?.career;
  if (c !== undefined) {
    if (s.phase !== 'results' || c.seed !== s.seed || c.D !== s.D) throw new Error('The saved career does not belong to this draft.');
    s.mode.career = validCareer(G, c, s.manager, s.cap);
  }
  return s;
}
