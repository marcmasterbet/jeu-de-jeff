// Serveur du speed-meeting : aucune dépendance, Node 18+.
// Lancement : ADMIN_CODE=monCode node server.js   (port 3000 par défaut, ou PORT)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { schedule, numberTables } = require('./algo');

const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || 'jeff2026';
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const PUB = path.join(__dirname, 'public');

// ---------- état ----------
const fresh = () => ({
  eventName: 'Café 100 % Pro Bayonne',
  eventDate: 'Jeudi 12 novembre 2026',
  rounds: 8,
  minutes: 15,
  status: 'open',          // open | closed (parcours générés) | done
  currentRound: 0,         // 0 = pas commencé ; 1..rounds = tour en cours
  roundStartedAt: null,
  participants: [],        // {id, token, name, company, active, joinedAt}
  plan: {},                // id -> [table du tour 1, tour 2, ...] (null si absent à ce tour)
  stats: null,
});
let S = fresh();
try { S = Object.assign(fresh(), JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch { /* premier lancement */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(S));
    fs.renameSync(tmp, DATA_FILE);
  }, 100);
}

const norm = s => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
const key = s => norm(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const active = () => S.participants.filter(p => p.active);

// ---------- calcul des parcours ----------
// Les tours déjà joués (1..currentRound) sont conservés ; on recalcule les suivants pour les présents.
function computePlan() {
  const ppl = active().sort((a, b) => a.num - b.num);   // ordre d'arrivée
  const fixed = S.currentRound;                // tours figés
  const remaining = S.rounds - fixed;
  const idx = new Map(ppl.map((p, i) => [p.id, i]));
  // historique des rencontres déjà faites entre présents
  const history = [];
  const visits = new Map();
  for (let r = 0; r < fixed; r++) {
    const byTable = {};
    for (const p of ppl) {
      const t = S.plan[p.id] && S.plan[p.id][r];
      if (t == null) continue;
      (byTable[t] = byTable[t] || []).push(idx.get(p.id));
      if (!visits.has(idx.get(p.id))) visits.set(idx.get(p.id), new Set());
      visits.get(idx.get(p.id)).add(t - 1);
    }
    for (const t in byTable) { const g = byTable[t]; for (let a = 0; a < g.length; a++) for (let b = a + 1; b < g.length; b++) history.push([g[a], g[b]]); }
  }
  const byArrival = fixed === 0;                // tour 1 = ordre d'arrivée
  const res = schedule(ppl.length, remaining, { history, byArrival, timeMs: 3000, seed: Date.now() & 0xffffff });
  const nums = numberTables(res.groups, res.sizes, visits, byArrival);
  const newPlan = {};
  for (const p of S.participants) {
    const arr = (S.plan[p.id] || []).slice(0, fixed);
    while (arr.length < S.rounds) arr.push(null);
    newPlan[p.id] = arr;
  }
  res.groups.forEach((round, ri) => round.forEach((grp, g) => grp.forEach(pi => { newPlan[ppl[pi].id][fixed + ri] = nums[ri][g]; })));
  S.plan = newPlan;
  S.dirty = false;
  S.stats = computeStats();
}

function computeStats() {
  const ppl = active();
  const met = new Map(ppl.map(p => [p.id, new Map()]));
  let maxTable = 0;
  for (let r = 0; r < S.rounds; r++) {
    const byTable = {};
    for (const p of ppl) { const t = S.plan[p.id] && S.plan[p.id][r]; if (t != null) { (byTable[t] = byTable[t] || []).push(p.id); maxTable = Math.max(maxTable, t); } }
    for (const t in byTable) for (const a of byTable[t]) for (const b of byTable[t]) if (a !== b) met.get(a).set(b, (met.get(a).get(b) || 0) + 1);
  }
  let pairsRepeated = 0, minU = Infinity, maxU = 0, sumU = 0;
  for (const [, m] of met) { const u = m.size; minU = Math.min(minU, u); maxU = Math.max(maxU, u); sumU += u; for (const [, c] of m) if (c > 1) pairsRepeated += 0.5; }
  return { participants: ppl.length, tables: maxTable, minMeet: ppl.length ? minU : 0, maxMeet: maxU, avgMeet: ppl.length ? +(sumU / ppl.length).toFixed(1) : 0, repeatedPairs: Math.round(pairsRepeated) };
}

// ---------- vues ----------
function publicState() {
  return { eventName: S.eventName, eventDate: S.eventDate || '', rounds: S.rounds, minutes: S.minutes, status: S.status, reopened: !!S.reopened, currentRound: S.currentRound, roundStartedAt: S.roundStartedAt, now: Date.now() };
}
function meView(p) {
  const v = Object.assign(publicState(), { known: !!p });
  if (!p) return v;
  v.num = p.num; v.active = p.active;
  // table du tour 1 connue dès l'arrivée : n°1 à 4 → table 1, n°5 à 8 → table 2…
  const rank = active().sort((a, b) => a.num - b.num).findIndex(q => q.id === p.id);
  v.firstTable = rank < 0 ? null : Math.floor(rank / 4) + 1;
  v.count = active().length;
  v.rank = S.participants.indexOf(p) + 1;
  v.plan = S.status !== 'open' && S.plan[p.id] ? S.plan[p.id] : null;
  // co-tables du tour en cours (prénoms) pour se retrouver
  if (v.plan && S.currentRound >= 1) {
    const t = v.plan[S.currentRound - 1];
    v.mates = null;
  }
  return v;
}
function adminView() {
  return Object.assign(publicState(), {
    dirty: !!S.dirty,
    lastAdded: S.lastAdded || null,
    participants: S.participants.map(p => ({ id: p.id, num: p.num, name: p.name, company: p.company, active: p.active, joinedAt: p.joinedAt, plan: S.plan[p.id] || null })),
    stats: S.stats,
  });
}

// ---------- actions ----------
function adminAction(b) {
  switch (b.action) {
    case 'settings':
      if (b.eventName != null) S.eventName = norm(b.eventName) || S.eventName;
      if (b.eventDate != null) S.eventDate = norm(b.eventDate);
      if (S.currentRound > 0) break;            // tours et durée verrouillés pendant l'événement
      if (b.rounds) S.rounds = Math.max(1, Math.min(12, b.rounds | 0));
      if (b.minutes) S.minutes = Math.max(1, Math.min(60, b.minutes | 0));
      if (S.status === 'closed') computePlan();
      break;
    case 'close':                       // clôturer et générer
      if (active().length < 2) throw new Error('Il faut au moins 2 participants.');
      S.status = 'closed'; computePlan(); break;
    case 'reopen':                      // laisser entrer des retardataires
      if (S.currentRound === 0) S.status = 'open'; else S.reopened = true;
      break;
    case 'recompute':                   // mettre à jour les parcours (retardataires, absents)
      if (S.status === 'open') S.status = 'closed';
      S.reopened = false; computePlan(); break;
    case 'next':
      if (S.status === 'open') throw new Error('Clôturez d’abord les inscriptions.');
      if (S.currentRound >= S.rounds) { S.status = 'done'; break; }
      S.currentRound++; S.roundStartedAt = Date.now(); S.reopened = false; break;
    case 'prev':
      if (S.currentRound > 0) { S.currentRound--; S.roundStartedAt = S.currentRound ? Date.now() : null; }
      if (S.status === 'done') S.status = 'closed';
      break;
    case 'restartTimer': if (S.currentRound) S.roundStartedAt = Date.now(); break;
    case 'finish': S.status = 'done'; break;
    case 'toggle': {                    // marquer présent / absent
      const p = S.participants.find(x => x.id === b.id); if (!p) throw new Error('Participant introuvable.');
      p.active = !p.active; if (S.status !== 'open') S.dirty = true; break;
    }
    case 'delete': S.participants = S.participants.filter(x => x.id !== b.id); delete S.plan[b.id]; if (S.status !== 'open') S.dirty = true; break;
    case 'add': {                       // inscription faite par Jeff (téléphone oublié…)
      S.lastAdded = addParticipant().num; if (S.status !== 'open') S.dirty = true; break;
    }
    case 'reset': {
      const keep = { eventName: S.eventName, eventDate: S.eventDate, rounds: S.rounds, minutes: S.minutes };
      S = Object.assign(fresh(), keep); break;
    }
    case 'demo': {                      // remplit avec des faux participants pour tester
      const n = Math.max(2, Math.min(120, b.n | 0));
      for (let i = 1; i <= n; i++) addParticipant();
      break;
    }
    default: throw new Error('Action inconnue.');
  }
  save();
}
function addParticipant() {
  const num = S.participants.reduce((m, x) => Math.max(m, x.num || 0), 0) + 1;
  const p = { id: crypto.randomBytes(6).toString('hex'), token: crypto.randomBytes(16).toString('hex'), num, name: 'n°' + num, company: '', active: true, joinedAt: Date.now() };
  S.participants.push(p);
  return p;
}

// ---------- HTTP ----------
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((ok, ko) => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e5) req.destroy(); }); req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { ko(e); } }); });
}
const MIME = { '.jpg': 'image/jpeg', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/api/state') return send(res, 200, publicState());
    if (p === '/api/me') {
      const t = url.searchParams.get('t');
      return send(res, 200, meView(S.participants.find(x => x.token === t)));
    }
    if (p === '/api/join' && req.method === 'POST') {
      const b = await readBody(req);
      // « J'ai déjà un numéro » : retrouver son parcours après avoir fermé la page
      if (b.num != null) {
        const ex = S.participants.find(x => x.num === (b.num | 0));
        if (!ex) return send(res, 404, { error: 'Numéro inconnu.' });
        if (!ex.active && S.status !== 'open') S.dirty = true;
        ex.active = true; save(); return send(res, 200, { token: ex.token });
      }
      if (S.status !== 'open' && !S.reopened) return send(res, 403, { error: 'Les inscriptions sont closes. Signalez-vous à Jeff, il peut vous ajouter.' });
      const np = addParticipant(); if (S.status !== 'open') S.dirty = true; save();
      return send(res, 200, { token: np.token });
    }
    if (p === '/api/admin') {
      const code = req.headers['x-admin-code'];
      if (code !== ADMIN_CODE) return send(res, 401, { error: 'Code incorrect.' });
      if (req.method === 'POST') {
        const b = await readBody(req);
        try { adminAction(b); } catch (e) { return send(res, 400, { error: e.message }); }
      }
      return send(res, 200, adminView());
    }
    // fichiers statiques
    let file = p === '/' ? '/index.html' : p === '/jeff' || p === '/admin' ? '/admin.html' : p;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(PUB, file);
    if (!full.startsWith(PUB)) return send(res, 404, 'Not found', 'text/plain');
    fs.readFile(full, (err, data) => err ? send(res, 404, 'Page introuvable', 'text/plain; charset=utf-8') : send(res, 200, data, MIME[path.extname(full)] || 'application/octet-stream'));
  } catch (e) {
    console.error(e); send(res, 500, { error: 'Erreur serveur' });
  }
});
server.listen(PORT, () => {
  console.log(`Speed meeting prêt sur http://localhost:${PORT}  —  espace Jeff : /jeff`);
  if (!process.env.ADMIN_CODE) console.log('⚠  ADMIN_CODE non défini : code par défaut « jeff2026 »');
});
