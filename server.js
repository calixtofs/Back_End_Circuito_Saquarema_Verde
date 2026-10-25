'use strict';

const { createHash, randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { createServer } = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DATABASE_DIRECTORY = path.join(ROOT, 'database');
const DATABASE_PATH = process.env.ADMIN_DATABASE_PATH || path.join(DATABASE_DIRECTORY, 'administrators.sqlite');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_PAGES = new Set([
  '/admin2.html',
  '/trilhas-admin.html',
  '/cachoeiras-admin.html',
  '/eventos-admin.html'
]);
const loginAttempts = new Map();

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
const database = new DatabaseSync(DATABASE_PATH);
database.exec(fs.readFileSync(path.join(ROOT, 'database', 'schema.sql'), 'utf8'));

const hashPassword = (password) => {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
};

const verifyPassword = (password, storedHash) => {
  if (typeof storedHash !== 'string') return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex || !/^[a-f0-9]{128}$/i.test(expectedHex)) return false;

  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
};

database.prepare(
  'INSERT OR IGNORE INTO administrators (slot, username, password_hash, is_master) VALUES (0, ?, ?, 1)'
).run('Admin', hashPassword('saquarema'));
const insertEmptySlot = database.prepare(
  'INSERT OR IGNORE INTO administrators (slot, username, password_hash, is_master) VALUES (?, NULL, NULL, 0)'
);
for (let slot = 1; slot <= 6; slot += 1) insertEmptySlot.run(slot);

const statements = {
  findAdministrator: database.prepare(
    'SELECT slot, username, password_hash, is_master FROM administrators WHERE username = ? COLLATE NOCASE'
  ),
  createSession: database.prepare(
    'INSERT INTO administrator_sessions (token_hash, administrator_slot, expires_at) VALUES (?, ?, ?)'
  ),
  findSession: database.prepare(
    `SELECT a.slot, a.username, a.is_master
     FROM administrator_sessions s
     JOIN administrators a ON a.slot = s.administrator_slot
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ),
  deleteSession: database.prepare('DELETE FROM administrator_sessions WHERE token_hash = ?'),
  deleteAdministratorSessions: database.prepare(
    'DELETE FROM administrator_sessions WHERE administrator_slot = ?'
  ),
  deleteExpiredSessions: database.prepare('DELETE FROM administrator_sessions WHERE expires_at <= ?'),
  listAdministratorSlots: database.prepare(
    'SELECT slot, username FROM administrators ORDER BY slot'
  ),
  findDuplicateUsername: database.prepare(
    'SELECT slot FROM administrators WHERE username = ? COLLATE NOCASE AND slot <> ?'
  ),
  getAdministratorSlot: database.prepare(
    'SELECT slot, username FROM administrators WHERE slot = ? AND is_master = 0'
  ),
  setAdministrator: database.prepare(
    'UPDATE administrators SET username = ?, password_hash = ? WHERE slot = ? AND is_master = 0'
  ),
  clearAdministrator: database.prepare(
    'UPDATE administrators SET username = NULL, password_hash = NULL WHERE slot = ? AND is_master = 0'
  )
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(text);
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString('utf8');
    if (Buffer.byteLength(body, 'utf8') > 16 * 1024) {
      const error = new Error('A solicitação excede o tamanho permitido.');
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    const error = new Error('O corpo da solicitação deve ser um JSON válido.');
    error.statusCode = 400;
    throw error;
  }
}

function getCookie(request, name) {
  const cookieHeader = request.headers.cookie || '';
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([A-Za-z0-9_-]+)'));
  return match ? match[1] : '';
}

function getSession(request) {
  const token = getCookie(request, 'admin_session');
  if (!token) return null;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const session = statements.findSession.get(tokenHash, Date.now());
  if (!session) statements.deleteSession.run(tokenHash);
  return session || null;
}

function sessionCookie(token, maxAge) {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return 'admin_session=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge + secure;
}

function getLoginAttempt(ip) {
  const now = Date.now();
  let attempt = loginAttempts.get(ip);
  if (!attempt || attempt.resetAt <= now) {
    attempt = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(ip, attempt);
  }
  return attempt;
}

async function handleApi(request, response, url) {
  if (request.method === 'POST' && url.pathname === '/api/login') {
    const ip = request.socket.remoteAddress || 'unknown';
    const attempt = getLoginAttempt(ip);
    if (attempt.count >= LOGIN_LIMIT) {
      return sendJson(response, 429, { error: 'Muitas tentativas. Aguarde e tente novamente.' });
    }

    const body = await readJson(request);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const administrator = statements.findAdministrator.get(username);
    if (!administrator || !verifyPassword(password, administrator.password_hash)) {
      attempt.count += 1;
      return sendJson(response, 401, { error: 'Usuário ou senha incorretos.' });
    }

    loginAttempts.delete(ip);
    statements.deleteExpiredSessions.run(Date.now());
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    statements.createSession.run(tokenHash, administrator.slot, Date.now() + SESSION_LIFETIME_MS);
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token, SESSION_LIFETIME_MS / 1000),
      'X-Content-Type-Options': 'nosniff'
    });
    return response.end(JSON.stringify({
      username: administrator.username,
      isMaster: administrator.is_master === 1
    }));
  }

  if (request.method === 'GET' && url.pathname === '/api/session') {
    const session = getSession(request);
    if (!session) return sendJson(response, 401, { error: 'Sessão inválida ou expirada.' });
    return sendJson(response, 200, {
      username: session.username,
      isMaster: session.is_master === 1
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/logout') {
    const token = getCookie(request, 'admin_session');
    if (token) {
      statements.deleteSession.run(createHash('sha256').update(token).digest('hex'));
    }
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie('', 0)
    });
    return response.end(JSON.stringify({ success: true }));
  }

  const session = getSession(request);
  if (!session) return sendJson(response, 401, { error: 'Autenticação necessária.' });

  if (request.method === 'GET' && url.pathname === '/api/admins') {
    if (session.is_master !== 1) {
      return sendJson(response, 403, { error: 'Somente o administrador principal pode gerenciar contas.' });
    }
    const administrators = statements.listAdministratorSlots.all()
      .filter((administrator) => administrator.slot !== 0)
      .map((administrator) => ({
        slot: administrator.slot,
        username: administrator.username,
        configured: Boolean(administrator.username)
      }));
    return sendJson(response, 200, { administrators });
  }

  const slotMatch = url.pathname.match(/^\/api\/admins\/([1-6])$/);
  if (slotMatch && request.method === 'PUT') {
    if (session.is_master !== 1) {
      return sendJson(response, 403, { error: 'Somente o administrador principal pode gerenciar contas.' });
    }
    const slot = Number(slotMatch[1]);
    const body = await readJson(request);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const existing = statements.getAdministratorSlot.get(slot);

    if (!existing) return sendJson(response, 404, { error: 'Espaço administrativo não encontrado.' });
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
      return sendJson(response, 400, { error: 'O usuário deve ter de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.' });
    }
    if (!existing.username && password.length < 12) {
      return sendJson(response, 400, { error: 'A senha deve ter pelo menos 12 caracteres.' });
    }
    if (password && password.length < 12) {
      return sendJson(response, 400, { error: 'A senha deve ter pelo menos 12 caracteres.' });
    }
    if (statements.findDuplicateUsername.get(username, slot)) {
      return sendJson(response, 409, { error: 'Este nome de usuário já está em uso.' });
    }

    const passwordHash = password ? hashPassword(password) : null;
    if (passwordHash) {
      statements.setAdministrator.run(username, passwordHash, slot);
    } else {
      database.prepare('UPDATE administrators SET username = ? WHERE slot = ? AND is_master = 0')
        .run(username, slot);
    }
    statements.deleteAdministratorSessions.run(slot);
    return sendJson(response, 200, { success: true });
  }

  if (slotMatch && request.method === 'DELETE') {
    if (session.is_master !== 1) {
      return sendJson(response, 403, { error: 'Somente o administrador principal pode gerenciar contas.' });
    }
    const slot = Number(slotMatch[1]);
    statements.clearAdministrator.run(slot);
    statements.deleteAdministratorSessions.run(slot);
    return sendJson(response, 200, { success: true });
  }

  return sendJson(response, 404, { error: 'Rota não encontrada.' });
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
  }[extension];
}

function isPublicFile(relativePath) {
  if (/^[A-Za-z0-9_-]+\.html$/i.test(relativePath)) return true;
  if (/^assets[\\/](css|js)[\\/][A-Za-z0-9_.-]+\.(css|js)$/i.test(relativePath)) return true;
  return /^[A-Za-z0-9_-]+[\\/][A-Za-z0-9_.-]+\.(svg|png|jpe?g|webp|gif|ico)$/i.test(relativePath);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    return handleApi(request, response, url);
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return sendText(response, 405, 'Método não permitido.');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendText(response, 400, 'Caminho inválido.');
  }
  if (pathname === '/') pathname = '/index.html';

  if (ADMIN_PAGES.has(pathname) && !getSession(request)) {
    response.writeHead(302, { Location: '/admin.html', 'Cache-Control': 'no-store' });
    return response.end();
  }

  const relativePath = pathname.replace(/^\/+/, '');
  if (!isPublicFile(relativePath)) return sendText(response, 404, 'Arquivo não encontrado.');
  const filePath = path.resolve(ROOT, relativePath);
  const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (!filePath.startsWith(rootPrefix)) return sendText(response, 404, 'Arquivo não encontrado.');

  let file;
  try {
    file = fs.readFileSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      return sendText(response, 404, 'Arquivo não encontrado.');
    }
    throw error;
  }
  response.writeHead(200, {
    'Content-Type': contentType(filePath),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': ADMIN_PAGES.has(pathname) ? 'no-store' : 'public, max-age=300'
  });
  return response.end(request.method === 'HEAD' ? undefined : file);
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error('Erro ao processar solicitação:', error);
    if (!response.headersSent) {
      const statusCode = error.statusCode || 500;
      sendJson(response, statusCode, {
        error: statusCode === 500 ? 'Erro interno do servidor.' : error.message
      });
    } else {
      response.destroy();
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log('Servidor iniciado em http://localhost:' + PORT);
  console.log('Banco SQLite: ' + DATABASE_PATH);
});
