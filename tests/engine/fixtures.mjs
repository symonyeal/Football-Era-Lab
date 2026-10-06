// Test fixtures. S = hand-placed 4-4-2 slots; cd = card; club = fifteen distinct people at one club.
export const S = [
  ['GK', 50, 94], ['LB', 15, 73], ['CB', 38, 77], ['CB', 62, 77], ['RB', 85, 73],
  ['LM', 12, 46], ['CM', 38, 49], ['CM', 62, 49], ['RM', 88, 46], ['ST', 38, 20], ['ST', 62, 20],
].map(([s, x, y]) => ({ s, x, y }));
export const cd = (id, pos, r = 80, D = 1990) => ({ id, nm: id, pos: [pos], r, D, cq: 'Qclub', tg: {}, duo: [] });
export const club = (id, r = 80, D = 1990) => ({
  id, nm: id, x: r, T: { m: { ga: 'C', gd: 'C', sig: [] }, S,
    xi: S.map((s, i) => cd(`${id}-${i}`, s.s, r, D)),
    bn: ['GK', 'CB', 'CM', 'ST'].map((s, i) => cd(`${id}-b${i}`, s, r - 5, D)),
  },
});
export const field = (n = 20, D = 1990, r = 80) => Array.from({ length: n }, (_, i) => club(`c${D}-${i}`, r, D));
export const eras = (r = 80) => Object.fromEntries([1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map(D => [D, field(20, D, r)]));
