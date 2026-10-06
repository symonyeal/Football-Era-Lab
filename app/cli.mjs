// Shared Node engine bridge: node app/cli.mjs < request.json
// Legend: q = JSON request; op = rate | lam; teams = {id,Ds,T} or {id,Ds,Q,S,m};
// games = {Ds,X,Y} rated line pairs; mu = [home expected goals, away expected goals].
import { readFileSync } from 'node:fs';
import { best, rate, lam, cfg, P } from './engine/index.js';

try {
  const q = JSON.parse(readFileSync(0, 'utf8'));
  if (q.params) cfg(q.params);
  let out;
  if (q.op === 'rate') {
    out = q.teams.map(t => {
      const T = t.T || { m: t.m || { ga: 'C', gd: 'C', sig: [] }, S: t.S, ...best(t.Q, t.S, t.Ds) };
      const R = rate(T, t.Ds);
      return { id: t.id, A: R.A, M: R.M, Dd: R.Dd, K: R.K, Dk: R.Dk, ovr: R.ovr };
    });
  } else if (q.op === 'lam') {
    out = { mu: q.games.map(g => [lam(g.X, g.Y, g.Ds, P.h), lam(g.Y, g.X, g.Ds, 0)]), params: P };
  } else throw new Error('Use op rate or lam.');
  process.stdout.write(JSON.stringify(out));
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exitCode = 1;
}
