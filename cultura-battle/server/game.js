'use strict';
/**
 * Motor de juego de CULTURA BATTLE.
 * Toda la lógica (puntajes, tiempos, respuestas correctas) vive aquí, en el servidor.
 * Los clientes solo reciben "vistas" filtradas según su rol.
 */
const crypto = require('node:crypto');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TEAM_PRESETS = [
  { name: 'Equipo Fuego', color: '#ff4d6d' }, { name: 'Equipo Océano', color: '#2f9bff' },
  { name: 'Equipo Selva', color: '#22c58b' }, { name: 'Equipo Sol', color: '#ffb703' },
  { name: 'Equipo Galaxia', color: '#b45cff' }, { name: 'Equipo Coral', color: '#ff7a29' },
  { name: 'Equipo Hielo', color: '#00c2d1' }, { name: 'Equipo Rosa', color: '#ff5cc8' },
  { name: 'Equipo Tierra', color: '#8d6e63' }, { name: 'Equipo Noche', color: '#5c6bc0' },
];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

const token = () => crypto.randomBytes(24).toString('base64url');
const newId = () => crypto.randomBytes(8).toString('hex');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const clampInt = (v, min, max, def) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};
const cleanText = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

const DEFAULT_CONFIG = {
  mode: 'individual',          // 'individual' | 'teams'
  teamFormation: 'free',       // 'free' | 'auto'
  maxTeamSize: 4,
  numTeams: 2,
  rounds: 10,
  timeLimit: 20,               // segundos
  categories: [],              // vacío = todas
  difficulty: 'mixta',         // 'mixta' | 'facil' | 'media' | 'dificil'
  challengeEvery: 3,           // 0 = solo manuales
  points: { correct: 10, wrong: 0, speedMax: 5, challengeOk: 5, challengeFail: 0, finalMultiplier: 2 },
};

class GameManager {
  constructor(db, { onChange } = {}) {
    this.db = db;
    this.games = new Map();
    this.timers = new Map();
    this.onChange = onChange || (() => {});
    this.categories = db.prepare('SELECT * FROM categories ORDER BY rowid').all();
    this.catById = Object.fromEntries(this.categories.map((c) => [c.id, c]));
    this.questions = db.prepare('SELECT * FROM questions WHERE active = 1').all()
      .map((q) => ({ ...q, options: JSON.parse(q.options) }));
    this.qById = new Map(this.questions.map((q) => [q.id, q]));
    this.challenges = db.prepare('SELECT * FROM challenges WHERE active = 1').all();
    this.stmts = {
      upsertGame: db.prepare(`INSERT INTO games (code,admin_token_hash,status,mode,config,state,created_at,updated_at,finished_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET status=excluded.status, mode=excluded.mode,
        config=excluded.config, state=excluded.state, updated_at=excluded.updated_at, finished_at=excluded.finished_at`),
      upsertPlayer: db.prepare(`INSERT INTO players (id,game_code,name,team_id,score,kicked,joined_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, team_id=excluded.team_id, score=excluded.score, kicked=excluded.kicked`),
      upsertTeam: db.prepare(`INSERT INTO teams (id,game_code,name,color,bonus) VALUES (?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, bonus=excluded.bonus`),
      deleteTeamsNotIn: db.prepare(`DELETE FROM teams WHERE game_code = ? AND id NOT IN (SELECT value FROM json_each(?))`),
      insertAnswer: db.prepare(`INSERT INTO answers (game_code,run,question_index,question_id,player_id,team_id,choice,is_correct,points,time_ms,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`),
      insertChallenge: db.prepare(`INSERT INTO challenge_log (game_code,run,challenge_id,text,player_id,team_id,result,points,created_at) VALUES (?,?,?,?,?,?,?,?,?)`),
      insertAdjust: db.prepare(`INSERT INTO score_adjustments (game_code,run,target_type,target_id,delta,reason,created_at) VALUES (?,?,?,?,?,?,?)`),
      deleteResults: db.prepare('DELETE FROM results WHERE game_code = ? AND run = ?'),
      insertResult: db.prepare(`INSERT INTO results (game_code,run,mode,rank,entity_type,entity_id,name,score,members,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`),
    };
    this.load();
  }

  /* ---------------------------- Persistencia ---------------------------- */
  load() {
    const rows = this.db.prepare("SELECT code, admin_token_hash, state FROM games WHERE status != 'finished' OR updated_at > ?")
      .all(Date.now() - 7 * 24 * 3600 * 1000);
    for (const r of rows) {
      const g = JSON.parse(r.state);
      g.adminTokenHash = r.admin_token_hash;
      for (const p of Object.values(g.players)) p.connected = false;
      this.games.set(g.code, g);
      if (g.status === 'question') this.armTimer(g);
    }
  }

  save(g) {
    const now = Date.now();
    g.updatedAt = now;
    const { adminTokenHash, ...state } = g;
    this.db.exec('BEGIN');
    try {
      this.stmts.upsertGame.run(g.code, adminTokenHash, g.status, g.config.mode, JSON.stringify(g.config),
        JSON.stringify(state), g.createdAt, now, g.status === 'finished' ? now : null);
      for (const t of Object.values(g.teams)) this.stmts.upsertTeam.run(t.id, g.code, t.name, t.color, t.bonus || 0);
      this.stmts.deleteTeamsNotIn.run(g.code, JSON.stringify(Object.keys(g.teams)));
      for (const p of Object.values(g.players)) this.stmts.upsertPlayer.run(p.id, g.code, p.name, p.teamId, p.score, p.kicked ? 1 : 0, p.joinedAt);
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  commit(g) { this.save(g); this.onChange(g); }

  get(code) {
    const g = this.games.get(String(code || '').toUpperCase().trim());
    if (!g) fail('No existe una partida con ese código.');
    return g;
  }

  /* ------------------------------ Admin ------------------------------ */
  normalizeConfig(input = {}, base = DEFAULT_CONFIG) {
    const c = JSON.parse(JSON.stringify(base));
    if (input.mode !== undefined) c.mode = input.mode === 'teams' ? 'teams' : 'individual';
    if (input.teamFormation !== undefined) c.teamFormation = input.teamFormation === 'auto' ? 'auto' : 'free';
    if (input.maxTeamSize !== undefined) c.maxTeamSize = clampInt(input.maxTeamSize, 1, 20, c.maxTeamSize);
    if (input.numTeams !== undefined) c.numTeams = clampInt(input.numTeams, 2, TEAM_PRESETS.length, c.numTeams);
    if (input.rounds !== undefined) c.rounds = clampInt(input.rounds, 1, 50, c.rounds);
    if (input.timeLimit !== undefined) c.timeLimit = clampInt(input.timeLimit, 5, 120, c.timeLimit);
    if (input.challengeEvery !== undefined) c.challengeEvery = clampInt(input.challengeEvery, 0, 20, c.challengeEvery);
    if (input.difficulty !== undefined) c.difficulty = ['facil', 'media', 'dificil'].includes(input.difficulty) ? input.difficulty : 'mixta';
    if (Array.isArray(input.categories)) c.categories = input.categories.filter((id) => this.catById[id]);
    if (input.points && typeof input.points === 'object') {
      const p = input.points;
      c.points = {
        correct: clampInt(p.correct, 0, 100, c.points.correct),
        wrong: clampInt(p.wrong, -50, 0, c.points.wrong),
        speedMax: clampInt(p.speedMax, 0, 50, c.points.speedMax),
        challengeOk: clampInt(p.challengeOk, 0, 100, c.points.challengeOk),
        challengeFail: clampInt(p.challengeFail, -50, 0, c.points.challengeFail),
        finalMultiplier: clampInt(p.finalMultiplier, 1, 5, c.points.finalMultiplier),
      };
    }
    if (this.availableQuestions(c).length === 0) fail('No hay preguntas para las categorías y dificultad elegidas.');
    return c;
  }

  availableQuestions(config) {
    return this.questions.filter((q) =>
      (!config.categories.length || config.categories.includes(q.category_id)) &&
      (config.difficulty === 'mixta' || q.difficulty === config.difficulty));
  }

  createGame(configInput) {
    const config = this.normalizeConfig(configInput);
    let code;
    do { code = Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join(''); }
    while (this.games.has(code) || this.db.prepare('SELECT 1 FROM games WHERE code = ?').get(code));
    const adminToken = token();
    const now = Date.now();
    const g = {
      code, adminTokenHash: sha(adminToken), createdAt: now, updatedAt: now, run: 1,
      status: 'lobby', pausedFrom: null, config,
      players: {}, teams: {}, bannedTokens: [], bannedNames: [],
      questionIds: [], currentIndex: -1, current: null, lastReveal: null,
      rotation: {}, rankSnapshot: {}, challenge: null, challengeLog: [], usedChallenges: [],
      adjustments: [], challengeDoneAt: -1, final: null,
    };
    this.games.set(code, g);
    this.commit(g);
    return { code, adminToken };
  }

  authAdmin(code, adminToken) {
    const g = this.get(code);
    if (!adminToken || !safeEq(sha(adminToken), g.adminTokenHash)) fail('Credenciales de administrador inválidas.');
    return g;
  }

  updateConfig(g, input) {
    if (g.status !== 'lobby') fail('Solo se puede configurar la partida en la sala de espera.');
    const before = g.config.mode;
    g.config = this.normalizeConfig(input, g.config);
    if (before !== g.config.mode) {
      g.teams = {};
      for (const p of Object.values(g.players)) p.teamId = null;
    }
    this.commit(g);
  }

  start(g) {
    if (g.status !== 'lobby') fail('La partida ya fue iniciada.');
    const active = this.activePlayers(g);
    if (active.length < 1) fail('Se necesita al menos un jugador conectado.');
    if (g.config.mode === 'teams') {
      if (g.config.teamFormation === 'auto' || Object.keys(g.teams).length === 0) this.autoTeams(g, false);
      else this.assignUnteamed(g);
      this.pruneTeams(g);
      if (Object.keys(g.teams).length < 1) fail('No hay equipos válidos.');
    }
    const pool = this.availableQuestions(g.config);
    let picked = shuffle(pool).slice(0, Math.min(g.config.rounds, pool.length));
    // Progresión de dificultad: de fácil a difícil (la final suele ser la más difícil).
    const order = { facil: 0, media: 1, dificil: 2 };
    picked = picked.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
    g.questionIds = picked.map((q) => q.id);
    g.currentIndex = -1;
    this.nextQuestion(g);
  }

  next(g) {
    if (g.status === 'question') { this.reveal(g); return; }
    if (g.status === 'challenge') {
      if (g.challenge && g.challenge.status === 'pending') fail('Primero marca el reto como cumplido o no cumplido.');
      g.challenge = null;
      return this.nextQuestion(g);
    }
    if (g.status !== 'reveal') fail('No se puede avanzar en este momento.');
    const answeredCount = g.currentIndex + 1;
    const isLast = answeredCount >= g.questionIds.length;
    if (!isLast && g.config.challengeEvery > 0 && answeredCount % g.config.challengeEvery === 0 && g.challengeDoneAt !== g.currentIndex) {
      this.startChallenge(g);
      return;
    }
    if (isLast) return this.finish(g);
    this.nextQuestion(g);
  }

  nextQuestion(g) {
    g.currentIndex += 1;
    if (g.currentIndex >= g.questionIds.length) return this.finish(g);
    const q = this.qById.get(g.questionIds[g.currentIndex]);
    const order = shuffle([0, 1, 2, 3]);
    const now = Date.now();
    g.current = {
      questionId: q.id, order, correctIndex: order.indexOf(q.correct_index),
      startedAt: now, endsAt: now + g.config.timeLimit * 1000, remainingMs: null,
      answers: {}, responders: {},
      isFinal: g.currentIndex === g.questionIds.length - 1,
    };
    g.lastReveal = null;
    g.challenge = null;
    if (g.config.mode === 'teams') this.pickResponders(g);
    g.status = 'question';
    this.armTimer(g);
    this.commit(g);
  }

  /** Rotación: en cada pregunta responde un integrante distinto de cada equipo. */
  pickResponders(g) {
    for (const t of Object.values(g.teams)) {
      const members = this.teamMembers(g, t.id).filter((p) => p.connected);
      if (!members.length) continue;
      const idx = g.rotation[t.id] || 0;
      g.current.responders[t.id] = members[idx % members.length].id;
      g.rotation[t.id] = idx + 1;
    }
  }

  armTimer(g) {
    this.clearTimer(g);
    const ms = Math.max(0, g.current.endsAt - Date.now());
    this.timers.set(g.code, setTimeout(() => {
      this.timers.delete(g.code);
      if (g.status === 'question') { try { this.reveal(g); } catch (e) { console.error(e); } }
    }, ms + 50));
  }
  clearTimer(g) { const t = this.timers.get(g.code); if (t) clearTimeout(t); this.timers.delete(g.code); }

  pause(g) {
    if (g.status !== 'question') fail('Solo se puede pausar mientras hay una pregunta en curso.');
    this.clearTimer(g);
    g.current.remainingMs = Math.max(0, g.current.endsAt - Date.now());
    g.status = 'paused';
    g.pausedFrom = 'question';
    this.commit(g);
  }

  resume(g) {
    if (g.status !== 'paused') fail('La partida no está en pausa.');
    g.current.endsAt = Date.now() + g.current.remainingMs;
    g.current.remainingMs = null;
    g.status = 'question';
    g.pausedFrom = null;
    this.armTimer(g);
    this.commit(g);
  }

  reveal(g) {
    if (g.status !== 'question') return;
    this.clearTimer(g);
    const q = this.qById.get(g.current.questionId);
    g.rankSnapshot = this.rankMap(g);
    const results = {};
    const distribution = [0, 0, 0, 0];
    for (const [pid, a] of Object.entries(g.current.answers)) {
      const p = g.players[pid];
      distribution[a.choice] += 1;
      if (p) { p.score += a.points; if (a.correct) p.correctCount += 1; p.answeredCount += 1; p.totalTimeMs += a.timeMs; }
      results[pid] = { choice: a.choice, correct: a.correct, points: a.points };
    }
    g.lastReveal = {
      questionIndex: g.currentIndex, correctIndex: g.current.correctIndex,
      explanation: q.explanation, distribution, results,
    };
    g.status = 'reveal';
    this.commit(g);
  }

  finish(g) {
    this.clearTimer(g);
    if (g.status === 'question') this.reveal(g);
    g.status = 'finished';
    g.challenge = null;
    const ranking = this.ranking(g);
    const top = ranking.filter((r) => r.rank === 1);
    g.final = { finishedAt: Date.now(), winners: top.map((r) => ({ id: r.id, name: r.name, score: r.score, color: r.color })) };
    const now = Date.now();
    this.stmts.deleteResults.run(g.code, g.run);
    for (const r of ranking) {
      this.stmts.insertResult.run(g.code, g.run, g.config.mode, r.rank, r.type, r.id, r.name, r.score,
        r.members ? JSON.stringify(r.members.map((m) => m.name)) : null, now);
    }
    if (g.config.mode === 'teams') {
      for (const r of this.playerRanking(g)) {
        this.stmts.insertResult.run(g.code, g.run, g.config.mode, r.rank, 'player', r.id, r.name, r.score, null, now);
      }
    }
    this.commit(g);
  }

  reset(g) {
    this.clearTimer(g);
    g.run += 1;
    g.status = 'lobby';
    g.pausedFrom = null;
    g.questionIds = []; g.currentIndex = -1; g.current = null; g.lastReveal = null;
    g.rotation = {}; g.rankSnapshot = {}; g.challenge = null; g.challengeLog = []; g.usedChallenges = [];
    g.adjustments = []; g.challengeDoneAt = -1; g.final = null;
    for (const t of Object.values(g.teams)) t.bonus = 0;
    for (const p of Object.values(g.players)) Object.assign(p, { score: 0, correctCount: 0, answeredCount: 0, totalTimeMs: 0, ready: false });
    this.commit(g);
  }

  kick(g, playerId) {
    const p = g.players[playerId];
    if (!p || p.kicked) fail('Jugador no encontrado.');
    p.kicked = true; p.connected = false; p.ready = false;
    g.bannedTokens.push(sha(p.token));
    g.bannedNames.push(p.name.toLowerCase());
    if (g.current && g.current.responders) {
      for (const [tid, rid] of Object.entries(g.current.responders)) if (rid === playerId) this.reassignResponder(g, tid);
    }
    p.teamId = p.teamId; // se conserva para auditoría pero no cuenta en el equipo
    this.pruneTeams(g);
    this.commit(g);
    this.maybeAutoReveal(g);
    return p;
  }

  adjust(g, { targetType, targetId, delta, reason }) {
    const d = clampInt(delta, -1000, 1000, 0);
    if (!d) fail('Indica una cantidad de puntos distinta de cero.');
    g.rankSnapshot = this.rankMap(g);
    let name;
    if (targetType === 'team') {
      const t = g.teams[targetId]; if (!t) fail('Equipo no encontrado.');
      t.bonus = (t.bonus || 0) + d; name = t.name;
    } else {
      const p = g.players[targetId]; if (!p || p.kicked) fail('Jugador no encontrado.');
      p.score += d; name = p.name;
    }
    const r = cleanText(reason, 80);
    g.adjustments.push({ targetType: targetType === 'team' ? 'team' : 'player', targetId, name, delta: d, reason: r, at: Date.now() });
    this.stmts.insertAdjust.run(g.code, g.run, targetType === 'team' ? 'team' : 'player', targetId, d, r, Date.now());
    this.commit(g);
  }

  /* ------------------------------ Retos ------------------------------ */
  startChallenge(g, reroll = false) {
    if (!['reveal', 'challenge'].includes(g.status)) fail('Los retos se activan entre preguntas (después de revelar la respuesta).');
    if (g.challenge && g.challenge.status === 'pending' && !reroll) fail('Ya hay un reto en curso.');
    let pool = this.challenges.filter((c) => !g.usedChallenges.includes(c.id));
    if (!pool.length) { g.usedChallenges = []; pool = this.challenges; }
    const ch = pool[crypto.randomInt(pool.length)];
    g.usedChallenges.push(ch.id);
    let target;
    if (g.config.mode === 'teams') {
      const teams = this.teamRanking(g).filter((t) => this.teamMembers(g, t.id).some((p) => p.connected));
      if (!teams.length) fail('No hay equipos con integrantes conectados.');
      const minScore = Math.min(...teams.map((t) => t.score));
      const lows = teams.filter((t) => t.score === minScore);
      const team = lows[crypto.randomInt(lows.length)];
      const members = this.teamMembers(g, team.id).filter((p) => p.connected);
      const member = members[crypto.randomInt(members.length)];
      target = { teamId: team.id, teamName: team.name, teamColor: team.color, playerId: member.id, playerName: member.name };
    } else {
      const players = this.activePlayers(g);
      if (!players.length) fail('No hay jugadores conectados.');
      const minScore = Math.min(...players.map((p) => p.score));
      const lows = players.filter((p) => p.score === minScore);
      const p = lows[crypto.randomInt(lows.length)];
      target = { playerId: p.id, playerName: p.name };
    }
    g.challenge = { id: ch.id, text: ch.text, type: ch.type, status: 'pending', ...target, startedAt: Date.now() };
    g.challengeDoneAt = g.currentIndex;
    g.status = 'challenge';
    this.commit(g);
  }

  resolveChallenge(g, success) {
    if (g.status !== 'challenge' || !g.challenge || g.challenge.status !== 'pending') fail('No hay un reto pendiente.');
    g.rankSnapshot = this.rankMap(g);
    const pts = success ? g.config.points.challengeOk : g.config.points.challengeFail;
    const p = g.players[g.challenge.playerId];
    if (p && !p.kicked) p.score += pts;
    g.challenge.status = success ? 'done' : 'failed';
    g.challenge.points = pts;
    g.challengeLog.push({ text: g.challenge.text, playerName: g.challenge.playerName, teamName: g.challenge.teamName || null, result: g.challenge.status, points: pts });
    this.stmts.insertChallenge.run(g.code, g.run, g.challenge.id, g.challenge.text, g.challenge.playerId, g.challenge.teamId || null,
      g.challenge.status, pts, Date.now());
    this.commit(g);
  }

  /* ----------------------------- Jugadores ----------------------------- */
  join(code, rawName) {
    const g = this.get(code);
    if (g.status === 'finished') fail('Esta partida ya terminó.');
    const name = cleanText(rawName, 20);
    if (name.length < 2) fail('El nombre debe tener al menos 2 caracteres.');
    const lower = name.toLowerCase();
    if (g.bannedNames.includes(lower)) fail('Este nombre fue retirado de la partida por el administrador.');
    if (Object.values(g.players).some((p) => !p.kicked && p.name.toLowerCase() === lower)) {
      fail('Ese nombre ya está en uso en esta partida. Si eras tú, vuelve a entrar desde el mismo dispositivo para recuperar tu progreso.');
    }
    if (Object.values(g.players).filter((p) => !p.kicked).length >= 200) fail('La partida está llena.');
    const t = token();
    const p = {
      id: newId(), token: t, name, teamId: null, score: 0, connected: false, ready: false, kicked: false,
      correctCount: 0, answeredCount: 0, totalTimeMs: 0, joinedAt: Date.now(),
    };
    g.players[p.id] = p;
    if (g.config.mode === 'teams' && (g.status !== 'lobby' || g.config.teamFormation === 'auto') && Object.keys(g.teams).length) {
      this.assignUnteamed(g);
    }
    this.commit(g);
    return { g, p, token: t };
  }

  resumePlayer(code, playerToken) {
    const g = this.get(code);
    if (g.bannedTokens.includes(sha(playerToken))) fail('Fuiste retirado de esta partida por el administrador.');
    const p = Object.values(g.players).find((x) => x.token && safeEq(x.token, playerToken));
    if (!p) fail('Sesión no encontrada. Vuelve a registrarte.');
    if (p.kicked) fail('Fuiste retirado de esta partida por el administrador.');
    return { g, p };
  }

  setConnected(g, p, connected) {
    if (p.connected === connected) return;
    p.connected = connected;
    if (!connected && g.status === 'question' && g.current && g.config.mode === 'teams') {
      for (const [tid, rid] of Object.entries(g.current.responders)) if (rid === p.id) this.reassignResponder(g, tid);
    }
    if (connected && g.status === 'question' && g.config.mode === 'teams' && p.teamId && !g.current.responders[p.teamId]) {
      g.current.responders[p.teamId] = p.id;
    }
    this.commit(g);
    if (!connected) this.maybeAutoReveal(g);
  }

  reassignResponder(g, teamId) {
    if (g.current.answers[g.current.responders[teamId]]) return; // ya respondió, no se cambia
    const candidates = this.teamMembers(g, teamId).filter((m) => m.connected && m.id !== g.current.responders[teamId]);
    if (candidates.length) g.current.responders[teamId] = candidates[0].id;
    else delete g.current.responders[teamId];
  }

  setReady(g, p, ready) {
    if (g.status !== 'lobby') return;
    p.ready = !!ready;
    this.commit(g);
  }

  createTeam(g, p, { name, color }) {
    if (g.config.mode !== 'teams') fail('Esta partida es individual.');
    if (g.config.teamFormation !== 'free') fail('El administrador distribuirá los equipos automáticamente.');
    if (g.status !== 'lobby') fail('Los equipos se arman en la sala de espera.');
    const n = cleanText(name, 24);
    if (n.length < 2) fail('El nombre del equipo debe tener al menos 2 caracteres.');
    if (Object.values(g.teams).some((t) => t.name.toLowerCase() === n.toLowerCase())) fail('Ya existe un equipo con ese nombre.');
    if (Object.keys(g.teams).length >= 20) fail('Se alcanzó el número máximo de equipos.');
    const c = COLOR_RE.test(color || '') ? color : TEAM_PRESETS[Object.keys(g.teams).length % TEAM_PRESETS.length].color;
    const t = { id: newId(), name: n, color: c, bonus: 0, createdAt: Date.now() };
    g.teams[t.id] = t;
    p.teamId = t.id;
    this.pruneTeams(g);
    this.commit(g);
    return t;
  }

  joinTeam(g, p, teamId) {
    if (g.config.mode !== 'teams') fail('Esta partida es individual.');
    if (g.config.teamFormation !== 'free') fail('El administrador distribuirá los equipos automáticamente.');
    if (g.status !== 'lobby') fail('Los equipos se arman en la sala de espera.');
    const t = g.teams[teamId];
    if (!t) fail('Equipo no encontrado.');
    if (p.teamId === teamId) return;
    if (this.teamMembers(g, teamId).length >= g.config.maxTeamSize) fail(`El equipo está completo (máximo ${g.config.maxTeamSize}).`);
    p.teamId = teamId;
    this.pruneTeams(g);
    this.commit(g);
  }

  leaveTeam(g, p) {
    if (g.status !== 'lobby') fail('No puedes cambiar de equipo durante la partida.');
    p.teamId = null;
    this.pruneTeams(g);
    this.commit(g);
  }

  /** Reparte a todos los jugadores activos en equipos balanceados. */
  autoTeams(g, doCommit = true) {
    if (g.config.mode !== 'teams') fail('Esta partida es individual.');
    if (g.status !== 'lobby') fail('Los equipos se arman en la sala de espera.');
    const players = shuffle(Object.values(g.players).filter((p) => !p.kicked));
    const byCap = Math.ceil(players.length / g.config.maxTeamSize);
    const n = Math.max(1, Math.min(Math.max(g.config.numTeams, byCap), TEAM_PRESETS.length, players.length || 1));
    g.teams = {};
    const ids = [];
    for (let i = 0; i < n; i++) {
      const t = { id: newId(), ...TEAM_PRESETS[i], bonus: 0, createdAt: Date.now() + i };
      g.teams[t.id] = t; ids.push(t.id);
    }
    players.forEach((p, i) => { p.teamId = ids[i % n]; });
    if (doCommit) this.commit(g);
  }

  assignUnteamed(g) {
    const unteamed = Object.values(g.players).filter((p) => !p.kicked && (!p.teamId || !g.teams[p.teamId]));
    for (const p of unteamed) {
      let teams = Object.values(g.teams).map((t) => ({ t, n: this.teamMembers(g, t.id).length }));
      teams = teams.filter((x) => x.n < g.config.maxTeamSize).sort((a, b) => a.n - b.n);
      if (!teams.length) {
        const used = new Set(Object.values(g.teams).map((t) => t.name));
        const preset = TEAM_PRESETS.find((x) => !used.has(x.name)) || { name: 'Equipo ' + (Object.keys(g.teams).length + 1), color: '#5c6bc0' };
        const t = { id: newId(), ...preset, bonus: 0, createdAt: Date.now() };
        g.teams[t.id] = t;
        p.teamId = t.id;
      } else p.teamId = teams[0].t.id;
    }
  }

  pruneTeams(g) {
    if (g.status !== 'lobby') return; // durante el juego los equipos se conservan
    for (const t of Object.values(g.teams)) if (!this.teamMembers(g, t.id).length) delete g.teams[t.id];
  }

  /* ----------------------------- Respuestas ----------------------------- */
  answer(g, p, rawChoice) {
    if (g.status === 'paused') fail('La partida está en pausa.');
    if (g.status !== 'question' || !g.current) fail('No hay una pregunta activa.');
    const choice = Number(rawChoice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) fail('Opción inválida.');
    if (p.kicked) fail('No perteneces a esta partida.');
    if (g.current.answers[p.id]) fail('Ya respondiste esta pregunta.');
    if (g.config.mode === 'teams') {
      if (!p.teamId || !g.teams[p.teamId]) fail('No perteneces a ningún equipo.');
      if (g.current.responders[p.teamId] !== p.id) fail('En esta pregunta le toca responder a otro integrante de tu equipo.');
    }
    const now = Date.now();
    if (now > g.current.endsAt + 300) fail('Se acabó el tiempo.');
    const correct = choice === g.current.correctIndex;
    const limit = g.config.timeLimit * 1000;
    const remaining = Math.max(0, Math.min(limit, g.current.endsAt - now));
    const P = g.config.points;
    let points = correct ? P.correct + Math.round(P.speedMax * (remaining / limit)) : P.wrong;
    if (g.current.isFinal) points *= P.finalMultiplier;
    const timeMs = Math.max(0, limit - remaining);
    // Restricción UNIQUE en BD: garantiza una sola respuesta aun con solicitudes simultáneas.
    try {
      this.stmts.insertAnswer.run(g.code, g.run, g.currentIndex, g.current.questionId, p.id, p.teamId, choice, correct ? 1 : 0, points, timeMs, now);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) fail('Ya respondiste esta pregunta.');
      throw e;
    }
    g.current.answers[p.id] = { choice, correct, points, timeMs, at: now };
    this.commit(g);
    this.maybeAutoReveal(g);
  }

  maybeAutoReveal(g) {
    if (g.status !== 'question') return;
    let pending;
    if (g.config.mode === 'teams') pending = Object.values(g.current.responders).filter((pid) => !g.current.answers[pid] && g.players[pid]?.connected && !g.players[pid]?.kicked);
    else pending = this.activePlayers(g).filter((p) => !g.current.answers[p.id]);
    const anyAnswer = Object.keys(g.current.answers).length > 0;
    if (pending.length === 0 && anyAnswer) this.reveal(g);
  }

  /* ----------------------------- Rankings ----------------------------- */
  activePlayers(g) { return Object.values(g.players).filter((p) => !p.kicked && p.connected); }
  teamMembers(g, teamId) {
    return Object.values(g.players).filter((p) => !p.kicked && p.teamId === teamId).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  playerRanking(g) {
    const list = Object.values(g.players).filter((p) => !p.kicked)
      .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || a.totalTimeMs - b.totalTimeMs || a.name.localeCompare(b.name));
    let rank = 0, prev = null;
    return list.map((p, i) => {
      if (p.score !== prev) { rank = i + 1; prev = p.score; }
      const team = p.teamId ? g.teams[p.teamId] : null;
      return { type: 'player', id: p.id, name: p.name, score: p.score, rank, correct: p.correctCount, connected: p.connected,
        teamId: p.teamId, color: team ? team.color : null };
    });
  }

  teamRanking(g) {
    const list = Object.values(g.teams).map((t) => {
      const members = this.teamMembers(g, t.id);
      return { type: 'team', id: t.id, name: t.name, color: t.color,
        score: members.reduce((s, m) => s + m.score, 0) + (t.bonus || 0),
        correct: members.reduce((s, m) => s + m.correctCount, 0),
        members: members.map((m) => ({ id: m.id, name: m.name, score: m.score, connected: m.connected })) };
    }).sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name));
    let rank = 0, prev = null;
    return list.map((t, i) => { if (t.score !== prev) { rank = i + 1; prev = t.score; } return { ...t, rank }; });
  }

  ranking(g) { return g.config.mode === 'teams' ? this.teamRanking(g) : this.playerRanking(g); }
  rankMap(g) {
    const m = {};
    for (const r of this.playerRanking(g)) m[r.id] = r.rank;
    if (g.config.mode === 'teams') for (const r of this.teamRanking(g)) m[r.id] = r.rank;
    return m;
  }

  /* ------------------------------ Vistas ------------------------------ */
  view(g, role, playerId) {
    const withDelta = (rows) => rows.map((r) => ({ ...r, delta: g.rankSnapshot[r.id] ? g.rankSnapshot[r.id] - r.rank : 0 }));
    const cur = g.current;
    const showQuestion = cur && ['question', 'paused', 'reveal'].includes(g.status);
    let question = null;
    if (showQuestion) {
      const q = this.qById.get(cur.questionId);
      const cat = this.catById[q.category_id];
      question = {
        index: g.currentIndex, total: g.questionIds.length, text: q.text,
        options: cur.order.map((i) => q.options[i]),
        category: { id: cat.id, name: cat.name, color: cat.color, icon: cat.icon },
        difficulty: q.difficulty, isFinal: cur.isFinal, timeLimit: g.config.timeLimit,
        endsAt: cur.endsAt, remainingMs: cur.remainingMs,
        responders: Object.fromEntries(Object.entries(cur.responders).map(([tid, pid]) => [tid, { id: pid, name: g.players[pid]?.name }])),
        answeredIds: Object.keys(cur.answers),
      };
    }
    const players = Object.values(g.players).filter((p) => !p.kicked).sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, score: p.score, connected: p.connected, ready: p.ready }));
    const teams = Object.values(g.teams).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((t) => ({
      id: t.id, name: t.name, color: t.color, members: this.teamMembers(g, t.id).map((m) => m.id),
    }));
    const { points, ...rest } = g.config;
    const view = {
      code: g.code, run: g.run, status: g.status, serverNow: Date.now(),
      config: { ...rest, points }, players, teams, question,
      reveal: g.status === 'reveal' || (g.status === 'challenge' || g.status === 'finished') ? g.lastReveal : null,
      ranking: withDelta(this.ranking(g)),
      playerRanking: g.config.mode === 'teams' ? withDelta(this.playerRanking(g)) : null,
      challenge: g.challenge, challengeLog: g.challengeLog.slice(-10),
      final: g.final,
      categories: this.categories,
    };
    if (role === 'admin') {
      const q = cur ? this.qById.get(cur.questionId) : null;
      view.admin = {
        correctIndex: cur ? cur.correctIndex : null,
        explanation: q ? q.explanation : null,
        answers: cur ? Object.entries(cur.answers).map(([pid, a]) => ({
          playerId: pid, name: g.players[pid]?.name, teamId: g.players[pid]?.teamId,
          choice: a.choice, correct: a.correct, points: a.points, timeMs: a.timeMs })).sort((a, b) => a.timeMs - b.timeMs) : [],
        expected: g.config.mode === 'teams' && cur ? Object.keys(cur.responders).length : this.activePlayers(g).length,
        adjustments: g.adjustments.slice(-15),
        availableQuestions: this.availableQuestions(g.config).length,
      };
    } else if (role === 'player') {
      const p = g.players[playerId];
      view.you = p ? { id: p.id, name: p.name, teamId: p.teamId, score: p.score, ready: p.ready, correct: p.correctCount } : null;
      const a = cur && p ? cur.answers[p.id] : null;
      view.yourAnswer = a ? { choice: a.choice } : null; // la corrección solo se revela al final de la pregunta
      view.canAnswer = !!(p && g.status === 'question' && !a &&
        (g.config.mode !== 'teams' || cur.responders[p.teamId] === p.id));
    }
    return view;
  }
}

module.exports = { GameManager, GameError, DEFAULT_CONFIG, TEAM_PRESETS };
