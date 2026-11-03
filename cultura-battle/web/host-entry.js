'use strict';
/**
 * Anfitrión en el navegador (modo GitHub Pages, sin servidor propio).
 * El navegador del administrador ejecuta el MISMO motor de juego que el servidor Node
 * (server/game.js) y se comunica con los jugadores en tiempo real por MQTT sobre WebSocket.
 * La persistencia se guarda en localStorage del dispositivo del administrador.
 */
const { GameManager, GameError } = require('../server/game.js');
const bank = require('../server/data/questions.json');
const challengesSeed = require('../server/data/challenges.json');

const PREFIX = 'cb/v1/';
const LSK = 'cb_host_db_v1';

/* -------- Base de datos en memoria + localStorage (misma interfaz mínima que node:sqlite) -------- */
function createBrowserDb() {
  let data;
  try { data = JSON.parse(localStorage.getItem(LSK)) || null; } catch { data = null; }
  if (!data) data = { games: {}, answers: [], challenge_log: [], score_adjustments: [], results: [] };
  let t = null;
  const persist = () => { clearTimeout(t); t = setTimeout(flush, 30); };
  const flush = () => { try { localStorage.setItem(LSK, JSON.stringify(data)); } catch (e) { console.warn('No se pudo guardar', e); } };
  const categories = bank.categories.map((c) => ({ ...c }));
  const questions = bank.questions.map((q, i) => ({ id: i + 1, category_id: q.c, difficulty: q.d, text: q.q, options: JSON.stringify(q.o), correct_index: q.a, explanation: q.e, active: 1 }));
  const challenges = challengesSeed.map((c, i) => ({ id: i + 1, text: c.text, type: c.type, active: 1 }));
  const S = (sql) => sql.replace(/\s+/g, ' ').trim();
  function prepare(sqlRaw) {
    const sql = S(sqlRaw);
    const st = { run() {}, get() { return undefined; }, all() { return []; } };
    if (sql.startsWith('SELECT * FROM categories')) st.all = () => categories;
    else if (sql.startsWith('SELECT * FROM questions')) st.all = () => questions;
    else if (sql.startsWith('SELECT * FROM challenges')) st.all = () => challenges;
    else if (sql.startsWith('SELECT code, admin_token_hash, state FROM games')) {
      st.all = (since) => Object.values(data.games).filter((g) => g.status !== 'finished' || g.updated_at > since);
    } else if (sql.startsWith('SELECT 1 FROM games')) st.get = (code) => (data.games[code] ? { 1: 1 } : undefined);
    else if (sql.startsWith('INSERT INTO games')) {
      st.run = (code, hash, status, mode, config, state, created, updated, finished) => {
        data.games[code] = { code, admin_token_hash: hash, status, mode, config, state, created_at: created, updated_at: updated, finished_at: finished };
        persist();
      };
    } else if (sql.startsWith('INSERT INTO answers')) {
      st.run = (game_code, run, question_index, question_id, player_id, team_id, choice, is_correct, points, time_ms, created_at) => {
        if (data.answers.some((a) => a.game_code === game_code && a.run === run && a.question_index === question_index && a.player_id === player_id)) {
          throw new Error('UNIQUE constraint failed: answers');
        }
        data.answers.push({ game_code, run, question_index, question_id, player_id, team_id, choice, is_correct, points, time_ms, created_at });
        persist();
      };
    } else if (sql.startsWith('INSERT INTO challenge_log')) {
      st.run = (game_code, run, challenge_id, text, player_id, team_id, result, points, created_at) => { data.challenge_log.push({ game_code, run, challenge_id, text, player_id, team_id, result, points, created_at }); persist(); };
    } else if (sql.startsWith('INSERT INTO score_adjustments')) {
      st.run = (game_code, run, target_type, target_id, delta, reason, created_at) => { data.score_adjustments.push({ game_code, run, target_type, target_id, delta, reason, created_at }); persist(); };
    } else if (sql.startsWith('DELETE FROM results')) {
      st.run = (code, run) => { data.results = data.results.filter((r) => !(r.game_code === code && r.run === run)); persist(); };
    } else if (sql.startsWith('INSERT INTO results')) {
      st.run = (game_code, run, mode, rank, entity_type, entity_id, name, score, members, created_at) => { data.results.push({ game_code, run, mode, rank, entity_type, entity_id, name, score, members, created_at }); persist(); };
    }
    // players / teams se guardan dentro del estado de la partida (games.state).
    return st;
  }
  return { prepare, exec() {}, flush, data };
}

/* ------------------------------------ Anfitrión ------------------------------------ */
function createHost({ mqttUrl, onState, onStatus }) {
  const db = createBrowserDb();
  const sessions = new Map(); // clientId -> { code, playerId, lastSeen }
  let client = null, game = null;
  const manager = new GameManager(db, { onChange: (g) => { if (game && g.code === game.code) publishAll(); } });

  const T = (code, rest) => `${PREFIX}${code}/${rest}`;
  const pub = (topic, obj, opts = {}) => client && client.connected && client.publish(topic, JSON.stringify(obj), { qos: 1, ...opts });

  let pending = false;
  function publishAll() {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (!game) return;
      const g = game;
      onState(manager.view(g, 'admin'));
      const pubView = manager.view(g, 'public');
      pub(T(g.code, 'state'), pubView, { retain: true });
      for (const [cid, s] of sessions) {
        if (s.code !== g.code || !s.playerId) continue;
        const v = manager.view(g, 'player', s.playerId);
        pub(T(g.code, 'down/' + cid), { type: 'private', data: { you: v.you, yourAnswer: v.yourAnswer, canAnswer: v.canAnswer, serverNow: v.serverNow, status: v.status, qIndex: v.question ? v.question.index : -1 } });
      }
    }, 0);
  }

  function attach(g) {
    if (game && game.code !== g.code) client.unsubscribe(T(game.code, 'up/+'));
    game = g;
    client.subscribe(T(g.code, 'up/+'), { qos: 1 }, () => pub(T(g.code, 'hb'), { t: Date.now(), resync: true }));
    publishAll();
  }

  function connectBroker() {
    return new Promise((resolve, reject) => {
      client = mqtt.connect(mqttUrl, { clientId: 'cbhost_' + Math.random().toString(16).slice(2, 10), clean: true, keepalive: 20, reconnectPeriod: 2000, connectTimeout: 10000 });
      let first = true;
      client.on('connect', () => { onStatus(true); if (game) { client.subscribe(T(game.code, 'up/+'), { qos: 1 }); publishAll(); } if (first) { first = false; resolve(); } });
      client.on('close', () => onStatus(false));
      client.on('offline', () => onStatus(false));
      client.on('error', (e) => { if (first) { first = false; reject(e); } });
      client.on('message', onMessage);
    });
  }

  function reply(code, cid, id, res) { pub(T(code, 'down/' + cid), { type: 'reply', re: id, res }); }

  function onMessage(topic, payload) {
    if (!game) return;
    const m = topic.match(/^cb\/v1\/([A-Z0-9]+)\/up\/([A-Za-z0-9_-]{4,40})$/);
    if (!m || m[1] !== game.code) return;
    const cid = m[2];
    let msg; try { msg = JSON.parse(payload.toString()); } catch { return; }
    const g = game;
    let s = sessions.get(cid);
    if (msg.ev === 'hb' && !s) { pub(T(g.code, 'down/' + cid), { type: 'resync' }); return; }
    if (msg.ev === 'hb') { if (s) { s.lastSeen = Date.now(); const p = g.players[s.playerId]; if (p && !p.connected && !p.kicked) manager.setConnected(g, p, true); } return; }
    if (msg.ev === 'bye') { if (s) { const p = g.players[s.playerId]; sessions.delete(cid); if (p && !hasOtherSession(s.playerId)) manager.setConnected(g, p, false); } return; }
    // Limitador simple por cliente
    const now = Date.now();
    const rl = rate.get(cid) || []; const recent = rl.filter((t) => now - t < 5000); recent.push(now); rate.set(cid, recent);
    if (recent.length > 30) return reply(g.code, cid, msg.id, { ok: false, error: 'Demasiadas solicitudes, espera un momento.' });
    try {
      const out = handle(g, cid, s, msg.ev, msg.data && typeof msg.data === 'object' ? msg.data : {});
      reply(g.code, cid, msg.id, { ok: true, ...(out || {}) });
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      reply(g.code, cid, msg.id, { ok: false, error: e instanceof GameError ? e.message : 'Error interno del anfitrión.' });
    }
  }
  const rate = new Map();
  const hasOtherSession = (pid) => [...sessions.values()].some((x) => x.playerId === pid);

  function handle(g, cid, s, ev, d) {
    if (ev.startsWith('admin:')) throw new GameError('Acción reservada para el administrador.');
    if (ev === 'player:join') {
      if (String(d.code || '').toUpperCase() !== g.code) throw new GameError('No existe una partida con ese código.');
      const { p, token } = manager.join(g.code, d.name);
      sessions.set(cid, { code: g.code, playerId: p.id, lastSeen: Date.now() });
      manager.setConnected(g, p, true);
      publishAll();
      return { code: g.code, token, playerId: p.id };
    }
    if (ev === 'player:resume') {
      const { p } = manager.resumePlayer(g.code, String(d.token || ''));
      for (const [ocid, os] of sessions) if (ocid !== cid && os.playerId === p.id) { pub(T(g.code, 'down/' + ocid), { type: 'replaced' }); sessions.delete(ocid); }
      sessions.set(cid, { code: g.code, playerId: p.id, lastSeen: Date.now() });
      if (p.connected) publishAll(); else manager.setConnected(g, p, true);
      return { code: g.code, playerId: p.id };
    }
    if (!s) throw new GameError('Debes unirte a una partida.');
    const p = g.players[s.playerId];
    if (!p || p.kicked) throw new GameError('No perteneces a esta partida.');
    s.lastSeen = Date.now();
    switch (ev) {
      case 'player:ready': return manager.setReady(g, p, d.ready);
      case 'player:createTeam': return { teamId: manager.createTeam(g, p, d).id };
      case 'player:joinTeam': return manager.joinTeam(g, p, String(d.teamId || ''));
      case 'player:leaveTeam': return manager.leaveTeam(g, p);
      case 'player:answer': return manager.answer(g, p, d.choice);
      case 'player:leave': sessions.delete(cid); if (!hasOtherSession(p.id)) manager.setConnected(g, p, false); return;
      default: throw new GameError('Acción desconocida.');
    }
  }

  // Presencia: si un jugador deja de enviar latidos, se marca desconectado.
  setInterval(() => {
    if (!game) return;
    pub(T(game.code, 'hb'), { t: Date.now() });
    for (const [cid, s] of sessions) {
      if (Date.now() - s.lastSeen > 13000) {
        sessions.delete(cid);
        const p = game.players[s.playerId];
        if (p && p.connected && !hasOtherSession(s.playerId)) manager.setConnected(game, p, false);
      }
    }
  }, 4000);
  addEventListener('beforeunload', () => db.flush());

  /** Acciones del administrador: se ejecutan localmente (nunca llegan desde la red). */
  function admin(ev, d = {}) {
    if (ev === 'admin:create') {
      const r = manager.createGame(d.config || {});
      attach(manager.get(r.code));
      return { code: r.code, adminToken: r.adminToken };
    }
    if (ev === 'admin:resume') {
      const g = manager.authAdmin(d.code, d.adminToken);
      // Tras recargar, los jugadores reaparecen con su latido; mientras tanto figuran desconectados.
      attach(g);
      return { code: g.code };
    }
    if (!game) throw new GameError('No hay una partida activa.');
    const g = game;
    switch (ev) {
      case 'admin:config': return manager.updateConfig(g, d.config || {});
      case 'admin:autoTeams': return manager.autoTeams(g);
      case 'admin:start': return manager.start(g);
      case 'admin:next': return manager.next(g);
      case 'admin:pause': return manager.pause(g);
      case 'admin:unpause': return manager.resume(g);
      case 'admin:end': return manager.finish(g);
      case 'admin:reset': return manager.reset(g);
      case 'admin:challenge': return manager.startChallenge(g, !!d.reroll);
      case 'admin:resolveChallenge': return manager.resolveChallenge(g, !!d.success);
      case 'admin:adjust': return manager.adjust(g, d);
      case 'admin:kick': {
        const p = manager.kick(g, String(d.playerId || ''));
        for (const [cid, s] of sessions) if (s.playerId === p.id) { pub(T(g.code, 'down/' + cid), { type: 'kicked', message: 'El administrador te retiró de la partida.' }); sessions.delete(cid); }
        return;
      }
      default: throw new GameError('Acción desconocida.');
    }
  }

  return {
    connect: connectBroker,
    call(ev, d) {
      try { return { ok: true, ...(admin(ev, d) || {}) }; }
      catch (e) { if (!(e instanceof GameError)) console.error(e); return { ok: false, error: e instanceof GameError ? e.message : 'Error interno.' }; }
    },
    categories: () => manager.categories,
    get connected() { return !!(client && client.connected); },
    manager, db,
  };
}

window.CBHost = { createHost, GameError };
