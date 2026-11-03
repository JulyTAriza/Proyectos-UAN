'use strict';
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const { Server } = require('socket.io');
const { openDb, seed } = require('./db');
const { GameManager, GameError } = require('./game');

function createServer({ port = Number(process.env.PORT) || 3000, dbFile, adminPassword } = {}) {
  const ADMIN_PASSWORD = adminPassword || process.env.ADMIN_PASSWORD || 'admin123';
  const origins = (process.env.CLIENT_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const corsOrigin = origins.includes('*') ? '*' : origins;

  const db = openDb(dbFile);
  seed(db);

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
    pingInterval: 10000, pingTimeout: 8000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  const room = (code) => `game:${code}`;
  const manager = new GameManager(db, { onChange: (g) => broadcast(g) });

  // Cada socket recibe una vista distinta según su rol (admin ve más que los jugadores).
  const pending = new Set();
  function broadcast(g) {
    if (pending.has(g.code)) return;
    pending.add(g.code);
    setImmediate(() => {
      pending.delete(g.code);
      for (const s of io.sockets.adapter.rooms.get(room(g.code)) || []) {
        const sock = io.sockets.sockets.get(s);
        if (!sock) continue;
        const d = sock.data;
        sock.emit('state', manager.view(g, d.role, d.playerId));
      }
    });
  }

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin === '*' ? '*' : (origins.includes(req.headers.origin) ? req.headers.origin : origins[0]));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/health', (req, res) => res.json({ ok: true, games: manager.games.size, questions: manager.questions.length }));
  app.get('/api/categories', (req, res) => {
    const counts = db.prepare('SELECT category_id, difficulty, COUNT(*) n FROM questions WHERE active=1 GROUP BY 1,2').all();
    res.json(manager.categories.map((c) => ({ ...c, counts: Object.fromEntries(counts.filter((x) => x.category_id === c.id).map((x) => [x.difficulty, x.n])) })));
  });
  app.get('/api/games/:code/results', (req, res) => {
    const code = String(req.params.code).toUpperCase().slice(0, 8);
    const rows = db.prepare('SELECT run, mode, rank, entity_type, name, score, members FROM results WHERE game_code = ? ORDER BY run DESC, entity_type DESC, rank').all(code);
    if (!rows.length) return res.status(404).json({ error: 'Sin resultados para esa partida.' });
    res.json(rows.map((r) => ({ ...r, members: r.members ? JSON.parse(r.members) : null })));
  });
  app.use(express.static(path.join(__dirname, '..', 'docs'), { extensions: ['html'] }));

  /* ------------------------------ Sockets ------------------------------ */
  io.on('connection', (socket) => {
    socket.data = { role: null, code: null, playerId: null, fails: 0, hits: [] };

    // Limitador simple: máx. 30 eventos cada 5 s por conexión.
    const limited = () => {
      const now = Date.now();
      socket.data.hits = socket.data.hits.filter((t) => now - t < 5000);
      socket.data.hits.push(now);
      return socket.data.hits.length > 30;
    };

    const handle = (event, fn) => socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (limited()) return reply({ ok: false, error: 'Demasiadas solicitudes, espera un momento.' });
      try {
        const out = await fn(payload && typeof payload === 'object' ? payload : {});
        reply({ ok: true, ...(out || {}) });
      } catch (e) {
        if (!(e instanceof GameError)) console.error(`[${event}]`, e);
        reply({ ok: false, error: e instanceof GameError ? e.message : 'Error interno del servidor.' });
      }
    });

    const asAdmin = () => {
      if (socket.data.role !== 'admin') throw new GameError('Acción reservada para el administrador.');
      return manager.get(socket.data.code);
    };
    const asPlayer = () => {
      if (socket.data.role !== 'player') throw new GameError('Debes unirte a una partida.');
      const g = manager.get(socket.data.code);
      const p = g.players[socket.data.playerId];
      if (!p || p.kicked) throw new GameError('No perteneces a esta partida.');
      return { g, p };
    };
    const bind = (g, role, playerId = null) => {
      if (socket.data.code) socket.leave(room(socket.data.code));
      socket.data.role = role; socket.data.code = g.code; socket.data.playerId = playerId;
      socket.join(room(g.code));
    };

    /* --------- Administrador --------- */
    handle('admin:create', ({ password, config }) => {
      if (socket.data.fails >= 5) throw new GameError('Demasiados intentos fallidos. Recarga la página.');
      const a = Buffer.from(String(password || '')), b = Buffer.from(ADMIN_PASSWORD);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { socket.data.fails += 1; throw new GameError('Contraseña de administrador incorrecta.'); }
      const { code, adminToken } = manager.createGame(config);
      const g = manager.get(code);
      bind(g, 'admin');
      broadcast(g);
      return { code, adminToken };
    });
    handle('admin:resume', ({ code, adminToken }) => {
      const g = manager.authAdmin(code, adminToken);
      bind(g, 'admin');
      socket.emit('state', manager.view(g, 'admin'));
      return { code: g.code };
    });
    const adminAction = (event, fn) => handle(event, (data) => { const g = asAdmin(); return fn(g, data); });
    adminAction('admin:config', (g, d) => manager.updateConfig(g, d.config || {}));
    adminAction('admin:autoTeams', (g) => manager.autoTeams(g));
    adminAction('admin:start', (g) => manager.start(g));
    adminAction('admin:next', (g) => manager.next(g));
    adminAction('admin:pause', (g) => manager.pause(g));
    adminAction('admin:unpause', (g) => manager.resume(g));
    adminAction('admin:end', (g) => manager.finish(g));
    adminAction('admin:reset', (g) => manager.reset(g));
    adminAction('admin:challenge', (g, d) => manager.startChallenge(g, !!d.reroll));
    adminAction('admin:resolveChallenge', (g, d) => manager.resolveChallenge(g, !!d.success));
    adminAction('admin:adjust', (g, d) => manager.adjust(g, d));
    adminAction('admin:kick', (g, d) => {
      const p = manager.kick(g, String(d.playerId || ''));
      for (const s of io.sockets.adapter.rooms.get(room(g.code)) || []) {
        const sock = io.sockets.sockets.get(s);
        if (sock && sock.data.playerId === p.id) { sock.emit('kicked', { message: 'El administrador te retiró de la partida.' }); sock.leave(room(g.code)); sock.data.role = null; sock.data.playerId = null; }
      }
    });

    /* --------- Jugadores --------- */
    handle('player:join', ({ code, name }) => {
      const { g, p, token } = manager.join(code, name);
      bind(g, 'player', p.id);
      manager.setConnected(g, p, true);
      return { code: g.code, token, playerId: p.id };
    });
    handle('player:resume', ({ code, token }) => {
      const { g, p } = manager.resumePlayer(code, String(token || ''));
      // Si el mismo jugador tenía otra pestaña abierta, esa conexión queda reemplazada.
      for (const s of io.sockets.adapter.rooms.get(room(g.code)) || []) {
        const sock = io.sockets.sockets.get(s);
        if (sock && sock.id !== socket.id && sock.data.playerId === p.id) { sock.emit('replaced'); sock.data.role = null; sock.data.playerId = null; sock.leave(room(g.code)); }
      }
      bind(g, 'player', p.id);
      if (p.connected) broadcast(g); else manager.setConnected(g, p, true);
      socket.emit('state', manager.view(g, 'player', p.id));
      return { code: g.code, playerId: p.id };
    });
    handle('player:ready', ({ ready }) => { const { g, p } = asPlayer(); manager.setReady(g, p, ready); });
    handle('player:createTeam', (d) => { const { g, p } = asPlayer(); const t = manager.createTeam(g, p, d); return { teamId: t.id }; });
    handle('player:joinTeam', ({ teamId }) => { const { g, p } = asPlayer(); manager.joinTeam(g, p, String(teamId || '')); });
    handle('player:leaveTeam', () => { const { g, p } = asPlayer(); manager.leaveTeam(g, p); });
    handle('player:answer', ({ choice }) => { const { g, p } = asPlayer(); manager.answer(g, p, choice); });
    handle('player:leave', () => {
      if (socket.data.role === 'player') {
        const { g, p } = asPlayer();
        socket.leave(room(g.code));
        socket.data.role = null; socket.data.playerId = null;
        manager.setConnected(g, p, false);
      }
    });

    socket.on('disconnect', () => {
      const { role, code, playerId } = socket.data;
      if (role !== 'player' || !code) return;
      const g = manager.games.get(code);
      const p = g && g.players[playerId];
      if (!p) return;
      // Solo marcar desconectado si no tiene otra conexión activa.
      const other = [...(io.sockets.adapter.rooms.get(room(code)) || [])].some((s) => s !== socket.id && io.sockets.sockets.get(s)?.data.playerId === playerId);
      if (!other) manager.setConnected(g, p, false);
    });
  });

  return {
    app, server, io, manager, db,
    listen: () => new Promise((resolve) => server.listen(port, () => resolve(server.address().port))),
    close: () => new Promise((resolve) => { for (const t of manager.timers.values()) clearTimeout(t); io.close(); server.close(() => { db.close(); resolve(); }); }),
  };
}

if (require.main === module) {
  const s = createServer();
  s.listen().then((port) => {
    console.log(`\n🎮 CULTURA BATTLE escuchando en http://localhost:${port}`);
    console.log(`   Preguntas cargadas: ${s.manager.questions.length} · Retos: ${s.manager.challenges.length}`);
    if (!process.env.ADMIN_PASSWORD) console.log('   ⚠️  ADMIN_PASSWORD no definido: se usa la contraseña de prueba "admin123".');
  });
  const stop = () => s.close().then(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

module.exports = { createServer };
