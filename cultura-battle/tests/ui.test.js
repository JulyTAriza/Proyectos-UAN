// Prueba de interfaz con navegador real (Playwright): admin + 2 jugadores en distintos tamaños.
const { chromium, devices } = require('playwright');
const { createServer } = require('../server/index.js');
const os = require('os'), path = require('path');
(async () => {
  const srv = createServer({ port: 0, dbFile: path.join(os.tmpdir(), 'cb-ui-' + Date.now() + '.db'), adminPassword: 'admin123' });
  const port = await srv.listen(); const URL = `http://localhost:${port}/`;
  const b = await chromium.launch(); const errors = [];
  const ctx = async (opt) => { const c = await b.newContext(opt); const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };
  const shot = (p, n) => p.screenshot({ path: `tests/screenshots/${n}.png`, fullPage: true });
  const admin = await ctx({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
  await admin.goto(URL + '#/admin'); await admin.waitForSelector('input[name=password]');
  await admin.fill('input[name=password]', 'admin123'); await admin.fill('input[name=rounds]', '3'); await admin.fill('input[name=timeLimit]', '15');
  await admin.click('button[type=submit]'); await admin.waitForSelector('.codebox');
  const code = (await admin.textContent('.codebox')).trim();
  const phone = await ctx({ ...devices['iPhone 13'] }); const tablet = await ctx({ ...devices['iPad Mini'] });
  for (const [p, n] of [[phone, 'Ana'], [tablet, 'Beto']]) {
    await p.goto(URL + '?code=' + code); await p.fill('input[name=name]', n); await p.click('button[type=submit]'); await p.waitForSelector('.codebox');
  }
  await phone.click('[data-act=ready]'); await admin.waitForTimeout(400);
  await shot(phone, '01-lobby-celular'); await shot(admin, '02-admin-lobby');
  await admin.click('[data-act="a:start"]'); await phone.waitForSelector('.opt:not([disabled])'); await tablet.waitForSelector('.opt:not([disabled])');
  await shot(phone, '03-pregunta-celular'); await shot(tablet, '04-pregunta-tablet');
  await phone.click('.opt.o0'); await tablet.click('.opt.o1');
  await phone.waitForSelector('.feedback'); await admin.waitForTimeout(500);
  await shot(phone, '05-resultado-celular'); await shot(admin, '06-admin-revelado');
  await admin.click('[data-act="a:next"]'); await phone.waitForSelector('.opt:not([disabled])');
  await phone.reload(); await phone.waitForSelector('.opt:not([disabled])'); // reconexión tras recargar
  await admin.click('[data-act="a:end"]'); await admin.click('[data-act="a:end"]');
  await phone.waitForSelector('.winner'); await phone.waitForTimeout(800);
  await shot(phone, '07-ganador-celular'); await shot(admin, '08-admin-final');
  await phone.reload(); await phone.waitForSelector('.winner'); // persistencia al recargar
  console.log('UI OK · errores JS:', errors.length ? errors : 'ninguno');
  await b.close(); await srv.close(); process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
