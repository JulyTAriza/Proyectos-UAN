'use strict';
// Pruebas funcionales de extremo a extremo: servidor real + múltiples clientes Socket.io.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { createServer } = require('../server/index.js');

const DB = path.join(os.tmpdir(), `cb-test-${Date.now()}.db`);
const PASS = 'test-pass';
const results = [];
let srv, URL;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  const s = io(URL, { transports: ['websocket'], forceNew: true });
  s.last = null;
  s.on('state', (st) => { s.last = st; });
  s.call = (ev, d = {}) => new Promise((res) => s.emit(ev, d, res));
  return new Promise((res) => s.on('connect', () => res(s)));
}
async function until(fn, ms = 4000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(20); }
  throw new Error('Timeout esperando condición');
}
async function test(name, fn) {
  try { await fn(); results.push(['✅', name]); console.log('✅', name); }
  catch (e) { results.push(['❌', name, e.message]); console.log('❌', name, '\n   ', e.stack); }
}
async function start() { srv = createServer({ port: 0, dbFile: DB, adminPassword: PASS }); URL = `http://localhost:${await srv.listen()}`; }

(async () => {
  await start();
  let admin, code, adminToken, players = [];

  await test('1-2. Crear partida con código y registrar 6 jugadores simultáneos', async () => {
    admin = await client();
    const bad = await admin.call('admin:create', { password: 'x' });
    assert.equal(bad.ok, false);
    const r = await admin.call('admin:create', { password: PASS, config: { mode: 'individual', rounds: 4, timeLimit: 6, challengeEvery: 2 } });
    assert.ok(r.ok && /^[A-Z0-9]{5}$/.test(r.code));
    ({ code, adminToken } = r);
    players = await Promise.all(['Ana', 'Beto', 'Caro', 'Dani', 'Eli', 'Fer'].map(async (n) => {
      const c = await client(); const j = await c.call('player:join', { code: code.toLowerCase(), name: n });
      assert.ok(j.ok, j.error); c.token = j.token; c.pid = j.playerId; c.name = n; return c;
    }));
    await until(() => admin.last?.players.length === 6 && admin.last.players.every((p) => p.connected));
  });

  await test('Evitar nombres duplicados (sin distinguir mayúsculas) y código inválido', async () => {
    const c = await client();
    assert.equal((await c.call('player:join', { code, name: 'ana' })).ok, false);
    assert.equal((await c.call('player:join', { code: 'ZZZZZ', name: 'Nuevo' })).ok, false);
    c.close();
  });

  await test('Estado "listo" visible en la sala de espera', async () => {
    await players[0].call('player:ready', { ready: true });
    await until(() => admin.last.players.find((p) => p.name === 'Ana').ready);
  });

  await test('15. Permisos: un jugador no puede ejecutar acciones de administrador', async () => {
    for (const ev of ['admin:start', 'admin:adjust', 'admin:kick', 'admin:end', 'admin:reset']) {
      const r = await players[1].call(ev, { targetId: players[1].pid, delta: 100, playerId: players[0].pid });
      assert.equal(r.ok, false, ev);
    }
    assert.equal((await players[1].call('admin:resume', { code, adminToken: 'falso' })).ok, false);
  });

  let correctIdx;
  await test('3/6/7/10. Individual: pregunta oculta, respuestas simultáneas, puntaje y bono de velocidad', async () => {
    assert.ok((await admin.call('admin:start')).ok);
    await until(() => players.every((p) => p.last?.status === 'question'));
    const st = players[0].last;
    assert.equal(st.question.options.length, 4);
    assert.equal(st.admin, undefined);
    assert.ok(!JSON.stringify(st).includes('correctIndex'), 'el jugador no debe recibir la respuesta correcta');
    correctIdx = admin.last.admin.correctIndex;
    // Respuestas simultáneas (incluye intento duplicado en paralelo)
    const wrong = (correctIdx + 1) % 4;
    const res = await Promise.all([
      players[0].call('player:answer', { choice: correctIdx }),
      players[0].call('player:answer', { choice: correctIdx }),
      players[1].call('player:answer', { choice: correctIdx }),
      players[2].call('player:answer', { choice: wrong }),
      players[3].call('player:answer', { choice: correctIdx }),
      players[4].call('player:answer', { choice: wrong }),
      players[5].call('player:answer', { choice: 9 }),
    ]);
    assert.equal(res.filter((r) => r.ok).length, 5, 'una respuesta duplicada y una inválida deben rechazarse');
    assert.ok(!players[0].last.ranking.some((r) => r.score > 0) || players[0].last.status === 'reveal');
    await players[5].call('player:answer', { choice: wrong });
    await until(() => players.every((p) => p.last.status === 'reveal'));
    const rv = players[0].last.reveal;
    assert.equal(rv.correctIndex, correctIdx);
    const ana = players[0].last.ranking.find((r) => r.name === 'Ana');
    assert.ok(ana.score >= 10 && ana.score <= 15, 'correcta: 10 + bono ≤ 5, obtuvo ' + ana.score);
    assert.equal(players[0].last.ranking.find((r) => r.name === 'Caro').score, 0);
    const n = srv.db.prepare('SELECT COUNT(*) n FROM answers WHERE game_code=?').get(code).n;
    assert.equal(n, 6, 'una fila por jugador en la BD');
  });

  await test('8. Ranking en tiempo real con cambios de posición', async () => {
    const r = players[0].last.ranking;
    assert.ok(r[0].rank === 1 && r[0].score >= r[r.length - 1].score);
    assert.ok(r.some((x) => x.delta !== 0), 'debe haber cambios de posición');
  });

  await test('10. Temporizador: la pregunta se cierra sola al agotarse el tiempo; pausa congela el tiempo', async () => {
    await admin.call('admin:next');
    await until(() => admin.last.status === 'question');
    await admin.call('admin:pause');
    await until(() => admin.last.status === 'paused');
    assert.equal((await players[0].call('player:answer', { choice: 0 })).ok, false, 'no se responde en pausa');
    await sleep(1500);
    await admin.call('admin:unpause');
    await until(() => admin.last.status === 'question');
    const rem = admin.last.question.endsAt - Date.now();
    assert.ok(rem > 3500, 'el tiempo pausado se conserva: ' + rem);
    await until(() => admin.last.status === 'reveal', 8000); // nadie responde → cierre por tiempo
    assert.equal((await players[0].call('player:answer', { choice: 0 })).ok, false, 'no se responde tras el cierre');
  });

  await test('9. Reto automático al jugador con menor puntaje y validación por el admin', async () => {
    await admin.call('admin:next'); // challengeEvery=2 → reto
    await until(() => admin.last.status === 'challenge');
    const ch = admin.last.challenge;
    const minScore = Math.min(...admin.last.ranking.map((r) => r.score));
    assert.equal(admin.last.ranking.find((r) => r.id === ch.playerId).score, minScore);
    assert.equal((await admin.call('admin:next')).ok, false, 'no avanza con el reto pendiente');
    const before = minScore;
    assert.ok((await admin.call('admin:resolveChallenge', { success: true })).ok);
    await until(() => admin.last.ranking.find((r) => r.id === ch.playerId).score === before + 5);
    assert.equal(srv.db.prepare('SELECT COUNT(*) n FROM challenge_log WHERE game_code=?').get(code).n, 1);
  });

  await test('11. Reconexión: el jugador recupera su sesión y puntaje', async () => {
    const fer = players[5];
    const score = admin.last.ranking.find((r) => r.name === 'Fer').score;
    fer.close();
    await until(() => !admin.last.players.find((p) => p.name === 'Fer').connected);
    const again = await client();
    const r = await again.call('player:resume', { code, token: fer.token });
    assert.ok(r.ok, r.error);
    await until(() => again.last?.you?.name === 'Fer');
    assert.equal(again.last.you.score, score);
    again.token = fer.token; again.pid = fer.pid; again.name = 'Fer';
    players[5] = again;
  });

  await test('Ajuste manual de puntos y expulsión de un participante', async () => {
    assert.ok((await admin.call('admin:adjust', { targetType: 'player', targetId: players[2].pid, delta: 7, reason: 'Buen espíritu' })).ok);
    await until(() => admin.last.ranking.find((r) => r.name === 'Caro').score >= 7);
    let kickedMsg = false; players[4].on('kicked', () => { kickedMsg = true; });
    assert.ok((await admin.call('admin:kick', { playerId: players[4].pid })).ok);
    await until(() => kickedMsg && !admin.last.players.some((p) => p.name === 'Eli'));
    const c = await client();
    assert.equal((await c.call('player:resume', { code, token: players[4].token })).ok, false, 'no puede volver con su sesión');
    c.close();
  });

  await test('12. Pregunta final con puntaje doble y selección del ganador', async () => {
    await admin.call('admin:next'); // pregunta 3
    await until(() => admin.last.status === 'question');
    await Promise.all(players.filter((_, i) => i !== 4).map((p) => p.call('player:answer', { choice: 0 })));
    await until(() => admin.last.status === 'reveal');
    await admin.call('admin:next'); // pregunta 4 (final)
    await until(() => admin.last.status === 'question');
    assert.ok(admin.last.question.isFinal);
    const ci = admin.last.admin.correctIndex;
    const before = admin.last.ranking.find((r) => r.name === 'Dani').score;
    await players[3].call('player:answer', { choice: ci });
    await Promise.all([0, 1, 2, 5].map((i) => players[i].call('player:answer', { choice: (ci + 1) % 4 })));
    await until(() => admin.last.status === 'reveal');
    const gained = admin.last.ranking.find((r) => r.name === 'Dani').score - before;
    assert.ok(gained >= 20 && gained <= 30, 'final doble: ' + gained);
    await admin.call('admin:next');
    await until(() => players[0].last.status === 'finished');
    assert.ok(players[0].last.final.winners.length >= 1);
    assert.equal(players[0].last.final.winners[0].name, admin.last.ranking[0].name);
  });

  await test('13. Persistencia: resultados guardados y estado intacto tras reiniciar el servidor', async () => {
    const rankBefore = admin.last.ranking.map((r) => [r.name, r.score]);
    for (const p of players) p.close(); admin.close();
    await srv.close();
    await start();
    const a = await client();
    const r = await a.call('admin:resume', { code, adminToken });
    assert.ok(r.ok, r.error);
    await until(() => a.last?.status === 'finished');
    assert.deepEqual(a.last.ranking.map((x) => [x.name, x.score]), rankBefore);
    const res = await (await fetch(`${URL}/api/games/${code}/results`)).json();
    assert.ok(res.length === 5 && res[0].rank === 1);
    const p = await client();
    assert.ok((await p.call('player:resume', { code, token: players[0].token })).ok, 'el jugador también recupera su sesión');
    a.close(); p.close();
  });

  await test('4/5. Equipos libres: crear, unirse, límite, rotación de quien responde y ranking grupal', async () => {
    const ad = await client();
    const r = await ad.call('admin:create', { password: PASS, config: { mode: 'teams', teamFormation: 'free', maxTeamSize: 2, rounds: 3, timeLimit: 6, challengeEvery: 0 } });
    const c2 = r.code;
    const ps = await Promise.all(['A1', 'A2', 'B1', 'B2', 'Xi'].map(async (n) => { const c = await client(); const j = await c.call('player:join', { code: c2, name: n }); c.pid = j.playerId; c.name = n; return c; }));
    const tA = await ps[0].call('player:createTeam', { name: 'Leones', color: '#ff0000' });
    assert.ok(tA.ok);
    assert.equal((await ps[2].call('player:createTeam', { name: 'leones' })).ok, false, 'nombre de equipo duplicado');
    const tB = await ps[2].call('player:createTeam', { name: 'Águilas', color: '#0000ff' });
    assert.ok((await ps[1].call('player:joinTeam', { teamId: tA.teamId })).ok);
    assert.ok((await ps[3].call('player:joinTeam', { teamId: tB.teamId })).ok);
    assert.equal((await ps[4].call('player:joinTeam', { teamId: tA.teamId })).ok, false, 'equipo completo');
    assert.ok((await ad.call('admin:start')).ok);
    await until(() => ad.last.status === 'question');
    const xTeam = ad.last.players.find((p) => p.name === 'Xi').teamId;
    assert.ok(xTeam && ![tA.teamId, tB.teamId].includes(xTeam), 'X fue asignado automáticamente a un equipo nuevo');
    const seen = { [tA.teamId]: new Set(), [tB.teamId]: new Set() };
    for (let q = 0; q < 2; q++) {
      await until(() => ad.last.status === 'question');
      const resp = ad.last.question.responders;
      seen[tA.teamId].add(resp[tA.teamId].id); seen[tB.teamId].add(resp[tB.teamId].id);
      const nonResp = ps.find((p) => p.last.you.teamId === tA.teamId && p.pid !== resp[tA.teamId].id);
      assert.equal((await nonResp.call('player:answer', { choice: 0 })).ok, false, 'solo responde el designado');
      const ci = ad.last.admin.correctIndex;
      for (const [tid, rr] of Object.entries(resp)) await ps.find((p) => p.pid === rr.id).call('player:answer', { choice: ci });
      await until(() => ad.last.status === 'reveal');
      await ad.call('admin:next');
    }
    assert.equal(seen[tA.teamId].size, 2, 'rota entre los integrantes del equipo A');
    assert.equal(seen[tB.teamId].size, 2, 'rota entre los integrantes del equipo B');
    const lt = ad.last.ranking.find((t) => t.id === tA.teamId);
    assert.equal(lt.score, lt.members.reduce((s, m) => s + m.score, 0));
    assert.ok(lt.members.length === 2 && ad.last.playerRanking.length === 5);
    // Reto por equipos: va al equipo con menor puntaje
    await until(() => ad.last.status === 'question');
    await until(() => ad.last.status === 'reveal', 8000);
    assert.ok((await ad.call('admin:challenge')).ok);
    const ch = ad.last.challenge;
    const minT = Math.min(...ad.last.ranking.map((t) => t.score));
    assert.equal(ad.last.ranking.find((t) => t.id === ch.teamId).score, minT);
    assert.ok(ad.last.ranking.find((t) => t.id === ch.teamId).members.some((m) => m.id === ch.playerId));
    await ad.call('admin:resolveChallenge', { success: false });
    await ad.call('admin:next');
    await until(() => ad.last.status === 'finished');
    // Reinicio: puntajes a cero, conserva jugadores
    assert.ok((await ad.call('admin:reset')).ok);
    await until(() => ad.last.status === 'lobby' && ad.last.players.every((p) => p.score === 0) && ad.last.players.length === 5);
    ad.close(); ps.forEach((p) => p.close());
  });

  await test('5. Equipos automáticos: distribución balanceada', async () => {
    const ad = await client();
    const r = await ad.call('admin:create', { password: PASS, config: { mode: 'teams', teamFormation: 'auto', numTeams: 3, maxTeamSize: 5, rounds: 1 } });
    const ps = await Promise.all(Array.from({ length: 9 }, async (_, i) => { const c = await client(); await c.call('player:join', { code: r.code, name: 'J' + i }); return c; }));
    assert.equal((await ps[0].call('player:createTeam', { name: 'Mío' })).ok, false, 'en modo automático no se crean equipos');
    assert.ok((await ad.call('admin:autoTeams')).ok);
    await until(() => ad.last.teams.length === 3);
    assert.deepEqual(ad.last.teams.map((t) => t.members.length), [3, 3, 3]);
    ad.close(); ps.forEach((p) => p.close());
  });

  await srv.close();
  for (const f of [DB, DB + '-wal', DB + '-shm']) fs.rmSync(f, { force: true });
  const failed = results.filter((r) => r[0] === '❌');
  console.log(`\n${results.length - failed.length}/${results.length} pruebas superadas`);
  fs.writeFileSync(path.join(__dirname, 'last-run.txt'), `Ejecutado: ${new Date().toISOString()}\n` + results.map((r) => r.join(' ')).join('\n') + `\n\n${results.length - failed.length}/${results.length} pruebas superadas\n`);
  process.exit(failed.length ? 1 : 0);
})();
