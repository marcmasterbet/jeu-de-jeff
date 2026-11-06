<?php
// Mission 007 — attribution des matricules d'agent dans l'ordre des scans (001 à 064).
// Les tables de chaque agent sont fixes (plan.js) : rien à calculer, rien à clôturer.
declare(strict_types=1);
require __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const DATA_FILE = __DIR__ . '/data/agents.json';
const MAX_AGENTS = 64;
const JEFF = 7;                 // matricule réservé au maître du jeu : jamais attribué par un scan
// n-ième scan → matricule (1..6, puis 8..64)
function num_for(int $k): int { return $k >= JEFF ? $k + 1 : $k; }

function out($d, int $code = 200): void { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }

// lecture / écriture sous verrou : deux téléphones qui scannent en même temps ont deux numéros différents
function with_data(callable $fn) {
  if (!is_dir(dirname(DATA_FILE))) @mkdir(dirname(DATA_FILE), 0775, true);
  $fh = @fopen(DATA_FILE, 'c+');
  if (!$fh) out(['error' => 'Le serveur ne peut pas enregistrer (dossier data non accessible en écriture).'], 500);
  flock($fh, LOCK_EX);
  $raw = stream_get_contents($fh);
  $D = $raw ? json_decode($raw, true) : null;
  if (!is_array($D)) $D = ['agents' => []];          // agents : jeton du téléphone => matricule
  // « édition » du compteur : change à chaque remise à zéro, pour que les téléphones oublient leur ancien numéro
  if (empty($D['epoch'])) { $D['epoch'] = bin2hex(random_bytes(6)); $changed0 = true; }
  $changed = !empty($changed0);
  $res = $fn($D, $changed);
  if ($changed) { ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($D)); fflush($fh); }
  flock($fh, LOCK_UN); fclose($fh);
  return $res;
}

$a = $_GET['a'] ?? '';
$body = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];

// Un téléphone qui scanne reçoit le matricule suivant (ou retrouve le sien s'il revient).
if ($a === 'join' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  out(with_data(function (&$D, &$changed) use ($body) {
    $t = (string) ($body['token'] ?? '');
    if ($t !== '' && isset($D['agents'][$t])) return ['token' => $t, 'num' => $D['agents'][$t], 'epoch' => $D['epoch']];
    $k = count($D['agents']) + 1;
    if ($k > MAX_AGENTS - 1) return ['full' => true];   // 63 places par scan + Jeff (007)
    $n = num_for($k);
    $t = bin2hex(random_bytes(12));
    $D['agents'][$t] = $n; $changed = true;
    return ['token' => $t, 'num' => $n, 'epoch' => $D['epoch']];
  }));
}

// Un téléphone vérifie que son numéro est toujours valable (pas de remise à zéro depuis).
if ($a === 'check') {
  $t = (string) ($_GET['t'] ?? '');
  out(with_data(fn(&$D) => ['epoch' => $D['epoch'], 'valid' => $t !== '' && isset($D['agents'][$t])]));
}

// Page de Jeff (facultative) : nombre d'agents arrivés, remise à zéro.
if ($a === 'admin') {
  $code = $_SERVER['HTTP_X_ADMIN_CODE'] ?? ($body['code'] ?? '');
  if (!hash_equals((string) $ADMIN_CODE, (string) $code)) out(['error' => 'Code incorrect.'], 401);
  out(with_data(function (&$D, &$changed) use ($body) {
    if (($body['action'] ?? '') === 'reset') { $D = ['agents' => [], 'epoch' => bin2hex(random_bytes(6))]; $changed = true; }
    return ['count' => count($D['agents']), 'max' => MAX_AGENTS - 1, 'next' => count($D['agents']) < MAX_AGENTS - 1 ? num_for(count($D['agents']) + 1) : null, 'writable' => is_writable(dirname(DATA_FILE))];
  }));
}
out(['error' => 'Requête inconnue.'], 404);
