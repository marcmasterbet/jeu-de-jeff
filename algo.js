// Répartition des participants en tables, tour par tour, en minimisant les rencontres en doublon.
// Approche : recherche locale (échanges de deux personnes dans un même tour) avec recuit simulé.
'use strict';

// Tailles des tables : par défaut 4. Le reste est absorbé par des tables de 5 (ou une table de 3).
function tableSizes(n) {
  if (n < 2) return n ? [n] : [];
  if (n < 6) return [n];
  const t = Math.floor(n / 4), r = n % 4;
  const sizes = Array(t).fill(4);
  if (r === 3) sizes.push(3);                    // 4,4,...,3
  else for (let i = 0; i < r; i++) sizes[i] = 5;  // quelques tables de 5
  return sizes;
}

const T28 = [
  [[0,7,14,21],[1,8,15,22],[2,9,16,23],[3,10,17,24],[4,11,18,25],[5,12,19,26],[6,13,20,27]],
  [[0,8,16,24],[1,9,17,25],[2,10,18,26],[3,11,19,27],[4,12,20,21],[5,13,14,22],[6,7,15,23]],
  [[0,9,18,27],[1,10,19,21],[2,11,20,22],[3,12,14,23],[4,13,15,24],[5,7,16,25],[6,8,17,26]],
  [[0,1,2,3],[4,10,16,22],[5,11,17,23],[6,12,18,24],[7,8,9,13],[14,15,19,20],[21,25,26,27]],
  [[0,10,20,23],[1,11,14,24],[2,12,15,25],[3,13,16,26],[4,7,17,27],[5,8,18,21],[6,9,19,22]],
  [[0,11,15,26],[1,12,16,27],[2,13,17,21],[3,7,18,22],[4,8,19,23],[5,9,20,24],[6,10,14,25]],
  [[0,4,5,6],[1,7,20,26],[2,8,14,27],[3,9,15,21],[10,11,12,13],[16,17,18,19],[22,23,24,25]],
  [[0,12,17,22],[1,13,18,23],[2,7,19,24],[3,8,20,25],[4,9,14,26],[5,10,15,27],[6,11,16,21]],
];

function rng(seed) { // PRNG déterministe (mulberry32)
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * @param {number} n          nombre de participants (indices 0..n-1)
 * @param {number} rounds     nombre de tours à calculer
 * @param {object} opts       { history: [[i,j],...] paires déjà rencontrées, timeMs, seed }
 * @returns {{groups:number[][][], sizes:number[]}} groups[r][g] = liste d'indices
 */
function schedule(n, rounds, opts = {}) {
  const sizes = tableSizes(n);
  const G = sizes.length;
  const rand = rng(opts.seed || 12345);
  const timeMs = opts.timeMs || 2500;
  if (n === 0 || rounds === 0) return { groups: [], sizes };

  // 25 à 27 participants : on reprend la solution exacte à 28 avec des « places vides »
  // (choisies pour ne jamais tomber à la même table) → tables de 4 ou 3, zéro doublon.
  if (n >= 25 && n < 28 && rounds <= 8 && !(opts.history && opts.history.length)) {
    const metT = (a, b) => T28.slice(0, rounds).some(rd => rd.some(g => g.includes(a) && g.includes(b)));
    const ghosts = [];
    for (let c = 27; c >= 0 && ghosts.length < 28 - n; c--) if (ghosts.every(g => !metT(g, c))) ghosts.push(c);
    if (ghosts.length === 28 - n) {
      const real = [...Array(28).keys()].filter(x => !ghosts.includes(x));
      const labels = real.map((_, i) => i);
      for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
      const id = new Map(real.map((x, i) => [x, labels[i]]));
      const groups = T28.slice(0, rounds).map(rd => rd.map(g => g.filter(x => id.has(x)).map(x => id.get(x))));
      return { groups, sizes: Array(7).fill(4), repeats: 0 };
    }
  }

  const base = new Uint8Array(n * n);            // rencontres déjà faites (tours joués)
  for (const [i, j] of opts.history || []) { base[i * n + j]++; base[j * n + i]++; }
  const meet = new Uint8Array(base);

  // état : asg[r][p] = groupe ; mem[r][g] = membres
  const asg = [], mem = [];
  // 28 participants : cas le plus serré (24 rencontres sur 27 possibles). On part d'une solution
  // exacte connue (8 tours, zéro doublon), puis on mélange les identités au hasard.
  const useT28 = n === 28 && rounds <= 8 && !(opts.history && opts.history.length);
  const labels = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }
  for (let r = 0; r < rounds; r++) {
    let perm = [...Array(n).keys()];
    if (useT28) perm = T28[r].flat().map(x => labels[x]);
    else for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const a = new Int16Array(n), m = sizes.map(() => []);
    let k = 0;
    for (let g = 0; g < G; g++) for (let s = 0; s < sizes[g]; s++) { const p = perm[k++]; a[p] = g; m[g].push(p); }
    asg.push(a); mem.push(m);
    for (const grp of m) for (let x = 0; x < grp.length; x++) for (let y = x + 1; y < grp.length; y++) { meet[grp[x] * n + grp[y]]++; meet[grp[y] * n + grp[x]]++; }
  }
  const pc = c => c * (c - 1) / 2;               // coût d'une paire rencontrée c fois
  let cost = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) cost += pc(meet[i * n + j]);

  const inc = (a, b, d) => { meet[a * n + b] += d; meet[b * n + a] += d; };
  // delta du coût si a (groupe A) et b (groupe B) échangent dans le tour r
  function delta(r, a, b) {
    const A = mem[r][asg[r][a]], B = mem[r][asg[r][b]];
    let d = 0;
    for (const x of A) if (x !== a) { const ca = meet[a * n + x], cb = meet[b * n + x]; d += (pc(ca - 1) - pc(ca)) + (pc(cb + 1) - pc(cb)); }
    for (const y of B) if (y !== b) { const cb = meet[b * n + y], ca = meet[a * n + y]; d += (pc(cb - 1) - pc(cb)) + (pc(ca + 1) - pc(ca)); }
    return d;
  }
  function apply(r, a, b) {
    const ga = asg[r][a], gb = asg[r][b], A = mem[r][ga], B = mem[r][gb];
    for (const x of A) if (x !== a) { inc(a, x, -1); inc(b, x, 1); }
    for (const y of B) if (y !== b) { inc(b, y, -1); inc(a, y, 1); }
    A[A.indexOf(a)] = b; B[B.indexOf(b)] = a; asg[r][a] = gb; asg[r][b] = ga;
  }

  // Recuit simulé guidé par les conflits : on choisit de préférence une personne qui revoit
  // quelqu'un de sa table, et on l'échange avec une personne d'une autre table du même tour.
  let best = cost, bestAsg = asg.map(a => Int16Array.from(a));
  const t0 = Date.now(); let it = 0, T = 0.6, sinceBest = 0;
  const hasConflict = (r, a) => { for (const x of mem[r][asg[r][a]]) if (x !== a && meet[a * n + x] > 1) return true; return false; };
  while (cost > 0 && G > 1) {
    if ((++it & 4095) === 0) {
      if (Date.now() - t0 > timeMs) break;
      T *= 0.97; if (T < 0.08) T = 0.6;           // réchauffes périodiques
    }
    let r, a, tries = 0;
    do { r = Math.floor(rand() * rounds); a = Math.floor(rand() * n); } while (!hasConflict(r, a) && ++tries < 30);
    const b = Math.floor(rand() * n);
    if (asg[r][a] === asg[r][b]) continue;
    const d = delta(r, a, b);
    if (d <= 0 || rand() < Math.exp(-d / T)) {
      apply(r, a, b); cost += d;
      if (cost < best) { best = cost; bestAsg = asg.map(x => Int16Array.from(x)); }
    }
  }
  const groups = bestAsg.map(a => { const m = sizes.map(() => []); for (let p = 0; p < n; p++) m[a[p]].push(p); return m; });
  return { groups, sizes, repeats: best };
}

// Numérotation des tables pour chaque tour : on évite qu'une personne retourne à la même table.
// Seuls les groupes de même taille sont permutés entre eux (une table de 5 reste une table de 5).
function numberTables(groups, sizes, prevVisits /* Map p -> Set(table) */) {
  const visits = prevVisits || new Map();
  const out = [];
  for (const round of groups) {
    const tableOf = new Array(round.length);
    const bySize = {};
    sizes.forEach((s, g) => (bySize[s] = bySize[s] || []).push(g));
    for (const s in bySize) {
      const gs = bySize[s];               // groupes de cette taille ; tables physiques = mêmes indices
      // greedy : groupe le plus "contraint" d'abord
      const score = (g, t) => round[g].reduce((acc, p) => acc + (visits.get(p)?.has(t) ? 1 : 0), 0);
      let bestTot = Infinity, bestMap = null;
      for (let trial = 0; trial < 300 && bestTot > 0; trial++) {
        const order = [...gs];
        if (trial) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const fr = new Set(gs), map = {}; let tot = 0;
        for (const g of order) {
          let bt = -1, bs = Infinity;
          for (const t of fr) { const sc = score(g, t); if (sc < bs) { bs = sc; bt = t; } }
          map[g] = bt; fr.delete(bt); tot += bs;
        }
        if (tot < bestTot) { bestTot = tot; bestMap = map; }
      }
      for (const g of gs) tableOf[g] = bestMap[g];
    }
    round.forEach((grp, g) => grp.forEach(p => { if (!visits.has(p)) visits.set(p, new Set()); visits.get(p).add(tableOf[g]); }));
    out.push(tableOf.map(t => t + 1)); // numéros de table à partir de 1
  }
  return out;
}

module.exports = { schedule, tableSizes, numberTables };
