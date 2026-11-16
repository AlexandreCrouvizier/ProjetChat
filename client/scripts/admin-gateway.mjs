/**
 * scripts/admin-gateway.mjs — Passerelle du panel admin (lancement : npm run admin)
 *
 * 🔐 Principe
 *  - Écoute UNIQUEMENT sur ce PC (127.0.0.1 / ::1) : le téléphone, la tablette ou un autre PC
 *    du Wi-Fi ne peuvent pas l'atteindre, même si le pare-feu est ouvert.
 *  - Transmet les requêtes au client Next.js (port du chat) en ajoutant l'en-tête secret
 *    `x-chatapp-admin-gateway` (ADMIN_GATEWAY_SECRET du .env racine).
 *  - Sans cet en-tête, Next.js cache /panel (404) et le serveur refuse les routes admin.
 *  - Ne sert que ce dont le panel a besoin ; le reste est redirigé vers le chat.
 *  - Fermé par défaut : tant que la passerelle n'est pas lancée, le panel est inaccessible.
 *
 * Aucune dépendance : uniquement des modules Node.js intégrés.
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEADER = 'x-chatapp-admin-gateway';

function readRootEnv() {
  const envPath = resolve(ROOT, '.env');
  const vars = {};
  if (!existsSync(envPath)) return vars;
  for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    vars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return vars;
}

const fileEnv = readRootEnv();
const env = (key, fallback = '') => process.env[key] || fileEnv[key] || fallback;

const SECRET = env('ADMIN_GATEWAY_SECRET');
const ADMIN_PORT = parseInt(env('ADMIN_PORT', '2025'), 10);
const CHAT_PORT = parseInt(new URL(env('APP_URL', 'http://localhost:1608')).port || '1608', 10);
const SLUG = env('ADMIN_PANEL_SLUG', 'admin');

if (SECRET.length < 32 || /^CHANGE_ME/i.test(SECRET)) {
  console.error('❌ ADMIN_GATEWAY_SECRET absent ou trop court dans le .env racine : passerelle non démarrée.');
  console.error('   Générer : node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  process.exit(1);
}

// Chemins autorisés sur la passerelle (le reste → redirection vers le chat)
const ALLOWED = [
  /^\/panel(\/|$|\?)/,
  /^\/_next\//,          // fichiers JS/CSS de Next.js + rechargement à chaud
  /^\/__nextjs/,         // outils de développement Next.js
  /^\/api\//,            // API (réécrite par Next.js vers le serveur Express)
  /^\/uploads\//,        // images signalées affichées dans le panel
  /^\/(favicon\.ico|manifest\.json)$/,
];
const isAllowed = (url) => ALLOWED.some((re) => re.test(url));

// Seuls ces noms d'hôte sont acceptés (protection contre le DNS rebinding)
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
function localHostname(req) {
  const host = String(req.headers.host || '').toLowerCase();
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  return LOCAL_HOSTS.has(name) ? name : null;
}

function upstreamHeaders(req) {
  const headers = { ...req.headers };
  delete headers[HEADER];          // jamais la valeur envoyée par le navigateur
  headers[HEADER] = SECRET;
  return headers;
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

const handler = (req, res) => {
  const hostname = localHostname(req);
  if (!hostname) return sendText(res, 403, 'Accès refusé.');

  const url = req.url || '/';
  if (url === '/' || url.startsWith('/?')) {
    res.writeHead(302, { Location: `/panel/${encodeURIComponent(SLUG)}` });
    return res.end();
  }
  if (!isAllowed(url)) {
    // Ex. « ← Retour au chat » : on renvoie vers le chat (port normal)
    res.writeHead(302, { Location: `http://${hostname}:${CHAT_PORT}${url}` });
    return res.end();
  }

  const upstream = http.request(
    { host: 'localhost', port: CHAT_PORT, method: req.method, path: url, headers: upstreamHeaders(req) },
    (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) {
      sendText(res, 502, `Le client ChatApp ne répond pas sur le port ${CHAT_PORT}.\nLance-le d'abord : npm run dev (dans client/).`);
    } else res.destroy();
  });
  req.pipe(upstream);
};

// WebSocket (rechargement à chaud de Next.js en développement)
const onUpgrade = (req, socket, head) => {
  if (!localHostname(req) || !isAllowed(req.url || '')) return socket.destroy();
  const upstream = http.request({
    host: 'localhost', port: CHAT_PORT, method: req.method, path: req.url, headers: upstreamHeaders(req),
  });
  upstream.on('upgrade', (upRes, upSocket, upHead) => {
    let head101 = 'HTTP/1.1 101 Switching Protocols\r\n';
    for (let i = 0; i < upRes.rawHeaders.length; i += 2) head101 += `${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}\r\n`;
    socket.write(head101 + '\r\n');
    if (upHead?.length) socket.write(upHead);
    if (head?.length) upSocket.write(head);
    upSocket.on('error', () => socket.destroy());
    socket.on('error', () => upSocket.destroy());
    upSocket.pipe(socket).pipe(upSocket);
  });
  upstream.on('response', (upRes) => { socket.end(`HTTP/1.1 ${upRes.statusCode} Refused\r\n\r\n`); });
  upstream.on('error', () => socket.destroy());
  upstream.end();
};

function listen(host) {
  return new Promise((ok) => {
    const server = http.createServer(handler);
    server.on('upgrade', onUpgrade);
    server.once('error', (err) => ok({ host, err }));
    server.listen(ADMIN_PORT, host, () => ok({ host }));
  });
}

const results = await Promise.all([listen('127.0.0.1'), listen('::1')]);
const v4 = results[0];
if (v4.err) {
  console.error(`❌ Impossible d'écouter sur 127.0.0.1:${ADMIN_PORT} (${v4.err.code}). Port déjà utilisé ?`);
  process.exit(1);
}
console.log('');
console.log('🔐 Passerelle admin prête');
console.log(`   Panel : http://localhost:${ADMIN_PORT}  (accessible uniquement depuis ce PC)`);
console.log(`   Relais vers le client Next.js sur le port ${CHAT_PORT}`);
console.log('   Ctrl + C pour fermer le panel.');
console.log('');
