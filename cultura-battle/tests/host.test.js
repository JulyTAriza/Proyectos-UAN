// Prueba del modo GitHub Pages (anfitrión en el navegador + MQTT) con navegador real.
// Levanta un broker MQTT local (aedes) y sirve docs/ como sitio estático, igual que GitHub Pages.
const { chromium, devices } = require('playwright');
const http = require('http'), path = require('path'), fs = require('fs');
const express = require('express');
const { WebSocketServer, createWebSocketStream } = require('ws');
(async () => {
  const aedes = require('aedes');
  const broker = aedes();
  const bs = http.createServer(); const wss = new WebSocketServer({ server: bs });
  wss.on('connection', (ws) => broker.handle(createWebSocketStream(ws)));
  await new Promise((r) => bs.listen(0, r));
  const MQTT = `ws://localhost:${bs.address().port}`;
  const app = express(); app.use(express.static(path.join(__dirname, '..', 'docs')));
  const web = http.createServer(app); await new Promise((r) => web.listen(0, r));
  const BASE = `http://localhost:${web.address().port}/`;
  const Q = `mode=host&mqtt=${encodeURIComponent(MQTT)}`;
  const b = await chromium.launch(); const errors = []; const log = (...a) => console.log('✅', ...a);
  const page = async (opt) => { const c = await b.newContext(opt); const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };
  const shot = (p, n) => p.screenshot({ path: `tests/screenshots/${n}.png`, fullPage: true });

  const admin = await page({ viewport: { width: 1366, height: 900 } });
  await admin.goto(`${BASE}?${Q}#/admin`); await admin.waitForSelector('form[data-form=create]');
  if (await admin.$('input[name=password]')) throw new Error('en modo anfitrión no se pide contraseña');
  await admin.selectOption('select[name=mode]', 'teams'); await admin.fill('input[name=rounds]', '3'); await admin.fill('input[name=timeLimit]', '15'); await admin.fill('input[name=maxTeamSize]', '2');
  await admin.click('form[data-form=create] button[type=submit]'); await admin.waitForSelector('.codebox');
  const code = (await admin.textContent('.codebox')).trim(); log('Partida creada en el navegador del admin:', code);

  const names = ['Ana', 'Beto', 'Caro', 'Dani'], ps = [];
  for (const n of names) {
    const p = await page(n === 'Ana' ? { ...devices['iPhone 13'] } : { viewport: { width: 420, height: 860 } });
    await p.goto(`${BASE}?${Q}&code=${code}`); await p.fill('input[name=name]', n); await p.click('button[type=submit]');
    await p.waitForSelector('.codebox'); ps.push(p);
  }
  log('4 jugadores unidos por MQTT');
  // Duplicado
  const dup = await page({}); await dup.goto(`${BASE}?${Q}&code=${code}`); await dup.fill('input[name=name]', 'ana'); await dup.click('button[type=submit]');
  await dup.waitForSelector('.err, .toast'); log('nombre duplicado rechazado');
  // Equipos libres
  await ps[0].fill('form[data-form=team] input[name=name]', 'Leones'); await ps[0].click('form[data-form=team] button[type=submit]');
  await ps[2].fill('form[data-form=team] input[name=name]', 'Águilas'); await ps[2].click('form[data-form=team] button[type=submit]');
  await ps[1].waitForSelector('[data-act=joinTeam]');
  await ps[1].click('.team:has-text("Leones") [data-act=joinTeam]'); await ps[3].click('.team:has-text("Águilas") [data-act=joinTeam]');
  await admin.waitForFunction(() => document.querySelectorAll('.plist .tdot').length === 4); log('equipos creados y completos');
  await shot(ps[0], '09-gh-lobby-equipos');
  await admin.click('[data-act="a:start"]');
  // Solo responde el designado de cada equipo
  for (const p of ps) await p.waitForSelector('.qtext');
  let answered = 0;
  for (const p of ps) { const btn = await p.$('.opt:not([disabled])'); if (btn) { await btn.click(); answered++; } }
  if (answered !== 2) throw new Error('debían responder 2 (uno por equipo), respondieron ' + answered);
  log('rotación por equipos: responde 1 integrante por equipo');
  await ps[0].waitForSelector('.feedback'); await shot(ps[0], '10-gh-resultado'); await shot(admin, '11-gh-admin');
  // Reconexión del jugador (recarga)
  await ps[1].reload(); await ps[1].waitForSelector('.feedback'); log('jugador recarga y recupera su sesión');
  // Reinicio del navegador del admin (persistencia en localStorage)
  await admin.reload(); await admin.waitForSelector('[data-act="a:next"]:not([disabled])'); log('admin recarga y la partida continúa');
  await admin.waitForFunction(() => [...document.querySelectorAll('.plist li .dot')].filter((d) => d.style.background.includes('34, 197, 139') || d.style.background.includes('#22c58b')).length === 4, null, { timeout: 15000 });
  log('tras recargar el admin, los 4 jugadores se reconectan solos');
  await admin.click('[data-act="a:next"]'); await ps[0].waitForSelector('.opt:not([disabled]), .waiting');
  await admin.waitForTimeout(500);
  await admin.click('[data-act="a:kick"] >> nth=3'); await admin.click('[data-act="a:kick"] >> nth=3');
  await ps[3].waitForSelector('text=retiró'); log('expulsión notificada al jugador');
  await admin.click('[data-act="a:end"]'); await admin.click('[data-act="a:end"]');
  await ps[0].waitForSelector('.winner'); await ps[0].waitForTimeout(700); await shot(ps[0], '12-gh-ganador');
  log('partida finalizada con ganador');
  console.log('Errores JS:', errors.length ? errors : 'ninguno');
  await b.close(); web.close(); bs.close(); broker.close(); process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('❌', e); process.exit(1); });
