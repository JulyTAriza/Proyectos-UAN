/* CULTURA BATTLE — cliente web (jugador y administrador) */
(() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  if (qs.get('server')) localStorage.setItem('cb_server', qs.get('server'));
  const SERVER = (qs.get('server') || window.CB_SERVER_URL || localStorage.getItem('cb_server') || location.origin).replace(/\/$/, '');
  const IS_ADMIN = location.hash.startsWith('#/admin');
  const LS = { player: 'cb_player', admin: 'cb_admin' };
  const store = {
    get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };
  const LETTERS = ['A', 'B', 'C', 'D'];
  const DIFF = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' };
  const COLORS = ['#ff4d6d', '#2f9bff', '#22c58b', '#ffb703', '#b45cff', '#ff7a29', '#00c2d1', '#ff5cc8'];
  const STATUS = { lobby: 'Sala de espera', question: 'Pregunta en curso', paused: 'En pausa', reveal: 'Resultados de la pregunta', challenge: 'Reto sorpresa', finished: 'Finalizada' };

  let socket = null, S = null, offset = 0, connected = false, kicked = null, error = '', busy = false;
  const ui = { teamColor: COLORS[0], celebrated: new Set(), cats: null };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r = document) => r.querySelector(s);
  const now = () => Date.now() + offset;

  /* ---------------- Conexión ---------------- */
  function boot() {
    const sc = document.createElement('script');
    sc.src = SERVER + '/socket.io/socket.io.js';
    sc.onload = connect;
    sc.onerror = () => {
      $('#app').innerHTML = `<div class="center card"><h2>⚠️ No se pudo contactar el servidor</h2>
        <p class="muted">Servidor configurado: <b>${esc(SERVER)}</b></p>
        <p class="muted">Si el servidor está en un plan gratuito puede tardar ~1 minuto en despertar. Recarga la página en unos segundos.</p>
        <button class="btn block" onclick="location.reload()">Reintentar</button></div>`;
    };
    document.head.appendChild(sc);
  }

  function connect() {
    socket = io(SERVER, { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    socket.on('connect', () => { connected = true; resumeSession(); render(); });
    socket.on('disconnect', () => { connected = false; render(); });
    socket.on('state', (st) => {
      offset = st.serverNow - Date.now();
      const prev = S; S = st;
      effects(prev, st);
      render();
    });
    socket.on('kicked', (m) => { kicked = m.message; store.del(LS.player); S = null; render(); });
    socket.on('replaced', () => { toast('Abriste la partida en otra pestaña o dispositivo.', true); S = null; render(); });
  }

  function emit(ev, data = {}) {
    return new Promise((resolve) => {
      if (!socket || !socket.connected) { toast('Sin conexión con el servidor. Reintentando…', true); return resolve({ ok: false }); }
      socket.timeout(8000).emit(ev, data, (err, res) => {
        if (err) { toast('El servidor no respondió. Intenta de nuevo.', true); return resolve({ ok: false }); }
        if (!res.ok && res.error) toast(res.error, true);
        resolve(res);
      });
    });
  }

  async function resumeSession() {
    if (IS_ADMIN) {
      const a = store.get(LS.admin);
      if (a) { const r = await emit('admin:resume', a); if (!r.ok) { store.del(LS.admin); S = null; render(); } }
    } else {
      const p = store.get(LS.player);
      if (p) { const r = await emit('player:resume', p); if (!r.ok) { store.del(LS.player); S = null; render(); } }
    }
  }

  /* ---------------- Render con "slots" (no pisa inputs con foco) ---------------- */
  let curScreen = null, cache = {}, deferred = false;
  function mount(id, layout, slots) {
    const root = $('#app');
    if (curScreen !== id) { root.innerHTML = layout; curScreen = id; cache = {}; }
    for (const [k, html] of Object.entries(slots)) {
      const el = root.querySelector(`[data-slot="${k}"]`);
      if (!el || cache[k] === html) continue;
      const a = document.activeElement;
      if (a && el.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { deferred = true; continue; }
      el.innerHTML = html; cache[k] = html;
    }
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (deferred) { deferred = false; render(); } }, 50));

  const top = () => `<div class="top"><div class="logo">⚡ <b>CULTURA BATTLE</b></div>
    <div class="conn ${connected ? '' : 'off'}"><i></i>${connected ? 'Conectado' : 'Reconectando…'}</div></div>`;

  function render() {
    if (!socket) return;
    if (IS_ADMIN) return renderAdmin();
    if (kicked) return mount('kicked', `${top()}<div class="center card" style="text-align:center"><div style="font-size:3rem">🚫</div><h2>${esc(kicked)}</h2><button class="btn block" data-act="home">Volver al inicio</button></div>`, {});
    if (!S || !S.you) return renderHome();
    const scr = { lobby: lobby, question: question, paused: question, reveal: reveal, challenge: challenge, finished: finished }[S.status];
    scr();
  }

  /* ---------------- Jugador ---------------- */
  function renderHome() {
    const code = (qs.get('code') || '').toUpperCase();
    mount('home', `${top()}<div class="hero"><h1>CULTURA <span>BATTLE</span></h1><p>Preguntas, retos y mucha competencia 🏆</p></div>
      <div class="center card"><form data-form="join">
        <label>Código de la partida</label><input class="code" name="code" maxlength="5" autocomplete="off" placeholder="ABCDE" value="${esc(code)}" required>
        <label>Tu nombre o apodo</label><input name="name" maxlength="20" placeholder="Ej: La Máquina" required minlength="2">
        <div data-slot="err"></div>
        <button class="btn block" type="submit">¡Entrar a jugar! 🚀</button></form></div>
      <a class="link" href="#/admin" onclick="setTimeout(()=>location.reload())">Soy administrador</a>`, { err: error ? `<div class="err">${esc(error)}</div>` : '' });
  }

  function lobby() {
    const me = S.you, teams = S.config.mode === 'teams';
    const people = S.players.map((p) => `<span class="chip ${p.ready ? 'ready' : ''}"><i class="dot ${p.connected ? 'on' : ''}"></i>${esc(p.name)}${p.ready ? ' ✅' : ''}${p.id === me.id ? ' (tú)' : ''}</span>`).join('');
    let teamHtml = '';
    if (teams) {
      const free = S.config.teamFormation === 'free';
      teamHtml = `<h3>Equipos ${free ? `(máx. ${S.config.maxTeamSize} por equipo)` : '— los asigna el administrador'}</h3>` +
        (S.teams.length ? S.teams.map((t) => {
          const mine = me.teamId === t.id, full = t.members.length >= S.config.maxTeamSize;
          return `<div class="team" style="border-color:${t.color}"><h4><span><i class="tdot" style="background:${t.color}"></i>${esc(t.name)} <span class="muted">(${t.members.length}/${S.config.maxTeamSize})</span></span>
            ${free ? (mine ? `<button class="btn sm gray" data-act="leaveTeam">Salir</button>` : `<button class="btn sm blue" data-act="joinTeam" data-id="${t.id}" ${full ? 'disabled' : ''}>${full ? 'Completo' : 'Unirme'}</button>`) : (mine ? '<span class="badge">Tu equipo</span>' : '')}</h4>
            <div class="chips">${t.members.map((id) => S.players.find((p) => p.id === id)).filter(Boolean).map((p) => `<span class="chip">${esc(p.name)}</span>`).join('')}</div></div>`;
        }).join('') : '<p class="muted">Aún no hay equipos.</p>');
    }
    const form = teams && S.config.teamFormation === 'free' && !me.teamId ? `<form data-form="team" class="card" style="margin-top:14px;box-shadow:none;border:2px dashed #e6e1f5">
        <b>Crear un equipo</b><input name="name" maxlength="24" placeholder="Nombre del equipo" required minlength="2" style="margin-top:8px">
        <div class="swatches">${COLORS.map((c) => `<span class="sw ${c === ui.teamColor ? 'sel' : ''}" style="background:${c}" data-act="color" data-c="${c}"></span>`).join('')}</div>
        <button class="btn green block" type="submit">Crear equipo</button></form>` : '';
    mount('lobby', `${top()}<div class="center card" style="max-width:640px">
        <div style="text-align:center"><span class="muted">Código de la partida</span><div class="codebox">${esc(S.code)}</div>
        <span class="badge">${teams ? '👥 Por equipos' : '👤 Individual'}</span> <span class="badge">${S.config.rounds} preguntas · ${S.config.timeLimit}s</span></div>
        <div data-slot="me"></div><div data-slot="players"></div><div data-slot="teams"></div><div data-slot="form"></div></div>`, {
      me: `<div class="waiting">¡Hola, ${esc(me.name)}! Espera a que el administrador inicie la partida ⏳
        <button class="btn ${me.ready ? 'gray' : 'green'} block" data-act="ready">${me.ready ? 'Ya no estoy listo' : '¡Estoy listo! ✋'}</button></div>`,
      players: `<h3>Participantes (${S.players.length}) · listos: ${S.players.filter((p) => p.ready).length}</h3><div class="chips">${people}</div>`,
      teams: teamHtml, form,
    });
  }

  function qHeader(q) {
    return `<div class="qhead"><div class="catcard" style="background:${q.category.color}"><span class="ic">${q.category.icon}</span><span>${esc(q.category.name)}<br><small style="font-weight:500">Pregunta ${q.index + 1} de ${q.total}</small></span></div>
      <div class="timer" id="timer"><svg width="74" height="74"><circle cx="37" cy="37" r="32" stroke="#ffffff33" stroke-width="8" fill="none"/><circle id="ring" cx="37" cy="37" r="32" stroke="#ffd23f" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="201" stroke-dashoffset="0"/></svg><b id="tnum">${q.timeLimit}</b></div></div>
      <div class="progress"><i style="width:${((q.index + 1) / q.total) * 100}%"></i></div>`;
  }

  function myTeamResponder() {
    if (S.config.mode !== 'teams' || !S.you.teamId) return null;
    return S.question.responders[S.you.teamId] || null;
  }

  function question() {
    const q = S.question, ans = S.yourAnswer;
    const resp = myTeamResponder();
    let info = '';
    if (S.status === 'paused') info = '<div class="waiting">⏸️ El administrador pausó la partida</div>';
    else if (ans) info = `<div class="waiting">✅ Respuesta enviada: <b>${LETTERS[ans.choice]}</b>. Esperando a los demás…</div>`;
    else if (S.config.mode === 'teams' && resp && resp.id !== S.you.id) info = `<div class="waiting">🗣️ En esta pregunta responde <b>${esc(resp.name)}</b> por tu equipo. ¡Ayúdale!</div>`;
    else if (S.config.mode === 'teams' && resp && resp.id === S.you.id) info = `<div class="waiting" style="background:#dcfbee">🎯 ¡Te toca responder por tu equipo!</div>`;
    const opts = q.options.map((o, i) => `<button class="opt o${i} ${ans ? (ans.choice === i ? 'mine' : 'dim') : ''}" data-l="${LETTERS[i]}" data-act="answer" data-i="${i}" ${S.canAnswer ? '' : 'disabled'}>${esc(o)}</button>`).join('');
    mount('question-' + q.index, `${top()}<div data-slot="head"></div><div class="card"><div data-slot="body"></div></div><div data-slot="ov"></div>`, {
      head: qHeader(q),
      body: `${q.isFinal ? '<div class="final-banner">🔥 PREGUNTA FINAL · ¡PUNTOS DOBLES! 🔥</div>' : ''}
        <div style="text-align:center"><span class="badge ${q.difficulty}">${DIFF[q.difficulty]}</span></div>
        <div class="qtext">${esc(q.text)}</div><div class="opts">${opts}</div>${info}`,
      ov: S.status === 'paused' ? '<div class="overlay">⏸️<br>Partida en pausa</div>' : '',
    });
  }

  function rankList(rows, meId, limit = 50) {
    return `<ul class="rank">${rows.slice(0, limit).map((r) => {
      const d = r.delta > 0 ? `<span class="delta up">▲${r.delta}</span>` : r.delta < 0 ? `<span class="delta down">▼${-r.delta}</span>` : '';
      const isMe = meId && (r.id === meId || (r.members && r.members.some((m) => m.id === meId)));
      const sub = r.members ? `<small>${r.members.map((m) => `${esc(m.name)} (${m.score})`).join(' · ') || 'sin integrantes'}</small>` : '';
      return `<li class="${r.rank <= 3 ? 'p' + r.rank : ''} ${isMe ? 'me' : ''}"><span class="pos">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
        <span class="nm">${r.color ? `<i class="tdot" style="background:${r.color}"></i>` : ''}${esc(r.name)}${d}${sub}</span><span class="sc">${r.score}</span></li>`;
    }).join('')}</ul>`;
  }

  function reveal() {
    const q = S.question, rv = S.reveal;
    if (!q || !rv) return;
    const mine = rv.results[S.you.id];
    const resp = myTeamResponder();
    let fb;
    if (mine) fb = mine.correct ? `<div class="feedback ok">¡Correcto! 🎉<small>+${mine.points} puntos</small></div>` : `<div class="feedback bad">Incorrecto 😬<small>${mine.points} puntos</small></div>`;
    else if (resp && resp.id !== S.you.id && rv.results[resp.id]) {
      const r = rv.results[resp.id];
      fb = `<div class="feedback ${r.correct ? 'ok' : 'bad'}">${r.correct ? '¡Tu equipo acertó! 🎉' : 'Tu equipo falló 😬'}<small>${esc(resp.name)} sumó ${r.points} puntos</small></div>`;
    } else fb = '<div class="feedback none">⏰ Sin respuesta<small>0 puntos</small></div>';
    const opts = q.options.map((o, i) => `<button class="opt o${i} ${i === rv.correctIndex ? 'right' : 'wrong'} ${mine && mine.choice === i ? 'mine' : ''}" data-l="${LETTERS[i]}" disabled>${esc(o)}<span class="cnt">${rv.distribution[i]}</span></button>`).join('');
    const myRank = (S.config.mode === 'teams' ? S.ranking.find((r) => r.id === S.you.teamId) : S.ranking.find((r) => r.id === S.you.id));
    mount('reveal-' + q.index, `${top()}<div data-slot="fb"></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="card" data-slot="q"></div><div class="card" data-slot="rank"></div></div>`, {
      fb,
      q: `<div class="qtext" style="font-size:1.2rem">${esc(q.text)}</div><div class="opts">${opts}</div><div class="explain">💡 ${esc(rv.explanation)}</div>`,
      rank: `<h2>🏆 Ranking ${myRank ? `<span class="badge">Vas en el puesto ${myRank.rank}</span>` : ''}</h2>${rankList(S.ranking, S.you.id, 10)}<p class="muted" style="text-align:center">Esperando la siguiente pregunta…</p>`,
    });
  }

  function challengeCard(c, meId) {
    const isMe = c.playerId === meId;
    const result = c.status === 'done' ? `<div class="feedback ok" style="margin-top:12px">✅ ¡Reto cumplido! +${c.points}</div>` : c.status === 'failed' ? `<div class="feedback bad" style="margin-top:12px">❌ Reto no cumplido ${c.points ? c.points : ''}</div>` : '';
    return `<div class="card challenge"><div class="big">🎭</div><h2>¡RETO SORPRESA!</h2><div class="txt">${esc(c.text)}</div>
      <div class="target ${isMe && c.status === 'pending' ? 'its-you' : ''}">${isMe ? '🫵 ¡TE TOCA A TI!' : `Le toca a: ${esc(c.playerName)}`}${c.teamName ? ` <span class="muted">(${esc(c.teamName)})</span>` : ''}</div>${result}</div>`;
  }

  function challenge() {
    const c = S.challenge;
    mount('challenge', `${top()}<div data-slot="c"></div><div class="card" style="margin-top:14px" data-slot="r"></div>`, {
      c: c ? challengeCard(c, S.you.id) : '<div class="card">Preparando…</div>',
      r: `<h2>🏆 Ranking</h2>${rankList(S.ranking, S.you.id, 10)}`,
    });
  }

  function finalScreen(meId, extra = '') {
    const r = S.ranking, w = S.final?.winners || [];
    const pod = [r[1], r[0], r[2]].map((x, i) => x ? `<div class="s${[2, 1, 3][i]}">${['🥈', '🥇', '🥉'][i]}<br>${esc(x.name)}<br>${x.score}</div>` : '<div style="visibility:hidden"></div>').join('');
    return `<div class="card winner"><div class="trophy">🏆</div><p class="muted">${w.length > 1 ? '¡Empate en el primer lugar!' : '¡Tenemos ganador!'}</p>
      <h1>${w.map((x) => esc(x.name)).join(' & ') || '—'}</h1><div class="podium">${pod}</div>${extra}</div>
      <div class="card" style="margin-top:14px"><h2>Clasificación final</h2>${rankList(r, meId)}
      ${S.playerRanking ? `<h3>Puntajes individuales</h3>${rankList(S.playerRanking, meId)}` : ''}</div>`;
  }

  function finished() {
    mount('finished', `${top()}<div data-slot="f"></div>`, {
      f: finalScreen(S.you.id, `<button class="btn gray" data-act="leave">Salir</button>`),
    });
  }

  /* ---------------- Administrador ---------------- */
  function configForm(c, cats, creating) {
    const sel = (n, v, opts) => `<select name="${n}">${opts.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const chosen = c.categories && c.categories.length ? c.categories : cats.map((x) => x.id);
    return `<form data-form="${creating ? 'create' : 'config'}">
      ${creating ? '<label>Contraseña de administrador</label><input type="password" name="password" required autocomplete="current-password">' : ''}
      <div class="two"><div><label>Modalidad</label>${sel('mode', c.mode, [['individual', '👤 Individual'], ['teams', '👥 Por equipos']])}</div>
      <div><label>Formación de equipos</label>${sel('teamFormation', c.teamFormation, [['free', 'Libre (los jugadores eligen)'], ['auto', 'Automática']])}</div></div>
      <div class="three"><div><label>Máx. por equipo</label><input type="number" name="maxTeamSize" min="1" max="20" value="${c.maxTeamSize}"></div>
      <div><label>N.º equipos (auto)</label><input type="number" name="numTeams" min="2" max="10" value="${c.numTeams}"></div>
      <div><label>Preguntas</label><input type="number" name="rounds" min="1" max="50" value="${c.rounds}"></div>
      <div><label>Tiempo (s)</label><input type="number" name="timeLimit" min="5" max="120" value="${c.timeLimit}"></div>
      <div><label>Reto cada N preg.</label><input type="number" name="challengeEvery" min="0" max="20" value="${c.challengeEvery}"></div>
      <div><label>Dificultad</label>${sel('difficulty', c.difficulty, [['mixta', 'Mixta'], ['facil', 'Fácil'], ['media', 'Media'], ['dificil', 'Difícil']])}</div></div>
      <label>Categorías</label><div class="cats">${cats.map((k) => `<label><input type="checkbox" name="cat" value="${k.id}" ${chosen.includes(k.id) ? 'checked' : ''}>${k.icon} ${esc(k.name)}</label>`).join('')}</div>
      <details style="margin-top:10px"><summary><b>Puntuación</b></summary><div class="three">
        <div><label>Correcta</label><input type="number" name="p_correct" value="${c.points.correct}"></div>
        <div><label>Incorrecta</label><input type="number" name="p_wrong" value="${c.points.wrong}" max="0"></div>
        <div><label>Bono velocidad máx.</label><input type="number" name="p_speedMax" value="${c.points.speedMax}"></div>
        <div><label>Reto cumplido</label><input type="number" name="p_challengeOk" value="${c.points.challengeOk}"></div>
        <div><label>Reto fallido</label><input type="number" name="p_challengeFail" value="${c.points.challengeFail}" max="0"></div>
        <div><label>Multiplicador final</label><input type="number" name="p_finalMultiplier" value="${c.points.finalMultiplier}" min="1" max="5"></div></div></details>
      <button class="btn ${creating ? '' : 'blue'} block" type="submit">${creating ? 'Crear partida 🎮' : 'Guardar configuración'}</button></form>`;
  }

  function readConfig(f) {
    const v = (n) => f.elements[n]?.value;
    return {
      mode: v('mode'), teamFormation: v('teamFormation'), maxTeamSize: +v('maxTeamSize'), numTeams: +v('numTeams'),
      rounds: +v('rounds'), timeLimit: +v('timeLimit'), challengeEvery: +v('challengeEvery'), difficulty: v('difficulty'),
      categories: [...f.querySelectorAll('input[name=cat]:checked')].map((x) => x.value),
      points: { correct: +v('p_correct'), wrong: +v('p_wrong'), speedMax: +v('p_speedMax'), challengeOk: +v('p_challengeOk'), challengeFail: +v('p_challengeFail'), finalMultiplier: +v('p_finalMultiplier') },
    };
  }

  const DEFAULTS = { mode: 'individual', teamFormation: 'free', maxTeamSize: 4, numTeams: 2, rounds: 10, timeLimit: 20, challengeEvery: 3, difficulty: 'mixta', categories: [], points: { correct: 10, wrong: 0, speedMax: 5, challengeOk: 5, challengeFail: 0, finalMultiplier: 2 } };

  function renderAdmin() {
    if (!S || !S.admin) {
      if (!ui.cats) { ui.cats = []; fetch(SERVER + '/api/categories').then((r) => r.json()).then((c) => { ui.cats = c; curScreen = null; render(); }).catch(() => {}); }
      return mount('admin-login', `${top()}<div class="center card" style="max-width:720px"><h2>🛠️ Crear partida</h2><div data-slot="f"></div></div>
        <a class="link" href="./" onclick="setTimeout(()=>location.reload())">Ir a la vista de jugador</a>`, { f: configForm(DEFAULTS, ui.cats, true) });
    }
    const A = S.admin, q = S.question, st = S.status;
    const joinUrl = location.href.split('#')[0].split('?')[0] + '?code=' + S.code + (qs.get('server') ? '&server=' + encodeURIComponent(qs.get('server')) : '');
    let qr = '';
    try { const g = qrcode(0, 'M'); g.addData(joinUrl); g.make(); qr = `<div class="qr"><img alt="QR" src="${g.createDataURL(4, 2)}"></div>`; } catch {}
    const B = (act, label, cls = '', dis = false) => `<button class="btn ${cls}" data-act="${act}" ${dis ? 'disabled' : ''}>${label}</button>`;
    const controls = `<div class="controls">
      ${B('a:start', '▶️ Iniciar', 'green', st !== 'lobby')}
      ${st === 'paused' ? B('a:resume', '▶️ Reanudar', 'green') : B('a:pause', '⏸️ Pausar', 'yellow', st !== 'question')}
      ${B('a:next', st === 'question' ? '⏭️ Revelar ya' : '⏭️ Siguiente', 'blue', !['question', 'reveal', 'challenge'].includes(st) || (st === 'challenge' && S.challenge?.status === 'pending'))}
      ${B('a:challenge', '🎭 Reto sorpresa', '', st !== 'reveal')}
      ${B('a:end', '🏁 Finalizar', 'red', st === 'finished' || st === 'lobby')}
      ${B('a:reset', '🔄 Reiniciar', 'gray', st === 'lobby')}</div>`;

    let stage = '';
    if (st === 'lobby') {
      stage = `<div style="text-align:center"><p class="muted">Los participantes entran en <b>${esc(joinUrl.split('?')[0])}</b> con el código:</p><div class="codebox">${S.code}</div>${qr}
        <p><b>${S.players.length}</b> conectados · <b>${S.players.filter((p) => p.ready).length}</b> listos</p>
        ${S.config.mode === 'teams' ? B('a:autoTeams', '🎲 Distribuir equipos automáticamente', 'blue') : ''}</div>`;
    } else if (q && ['question', 'paused', 'reveal'].includes(st)) {
      const answered = A.answers.length;
      stage = `${qHeader(q)}<div class="card" style="box-shadow:none;padding:6px 0">${q.isFinal ? '<div class="final-banner">🔥 PREGUNTA FINAL · PUNTOS x' + S.config.points.finalMultiplier + '</div>' : ''}
        <div class="qtext">${esc(q.text)}</div><div class="opts">${q.options.map((o, i) => `<button class="opt o${i} ${i === A.correctIndex ? (st === 'reveal' ? 'right' : 'mine') : (st === 'reveal' ? 'wrong' : '')}" data-l="${LETTERS[i]}" disabled>${esc(o)}${st === 'reveal' ? `<span class="cnt">${S.reveal.distribution[i]}</span>` : ''}</button>`).join('')}</div>
        <p class="muted" style="text-align:center">Respuestas recibidas: <b>${answered}</b> / ${A.expected} · (la opción con borde es la correcta, solo la ve el administrador)</p>
        ${st === 'reveal' ? `<div class="explain">💡 ${esc(A.explanation)}</div>` : ''}
        ${S.config.mode === 'teams' ? `<p class="muted">Responden: ${S.teams.map((t) => `<i class="tdot" style="background:${t.color}"></i>${esc(q.responders[t.id]?.name || '—')}`).join(' · ')}</p>` : ''}
        ${answered ? `<table class="ans">${A.answers.map((a) => `<tr><td>${esc(a.name)}</td><td>${LETTERS[a.choice]}</td><td>${a.correct ? '✅' : '❌'}</td><td>${(a.timeMs / 1000).toFixed(1)}s</td><td>${st === 'reveal' ? '+' + a.points : '…'}</td></tr>`).join('')}</table>` : ''}</div>`;
    } else if (st === 'challenge' && S.challenge) {
      stage = challengeCard(S.challenge, null) + (S.challenge.status === 'pending' ? `<div class="controls" style="margin-top:12px">${B('a:chOk', '✅ Cumplido (+' + S.config.points.challengeOk + ')', 'green')}${B('a:chFail', '❌ No cumplido (' + S.config.points.challengeFail + ')', 'red')}${B('a:reroll', '🎲 Otro reto', 'gray')}</div>` : '<p class="muted" style="text-align:center">Pulsa «Siguiente» para continuar.</p>');
    } else if (st === 'finished') {
      stage = finalScreen(null);
    }
    const people = `<ul class="plist">${S.players.map((p) => {
      const t = S.teams.find((x) => x.id === p.teamId);
      return `<li><i class="dot" style="width:9px;height:9px;border-radius:50%;background:${p.connected ? '#22c58b' : '#bbb'}"></i><span>${t ? `<i class="tdot" style="background:${t.color}"></i>` : ''}${esc(p.name)} ${p.ready && st === 'lobby' ? '✅' : ''}<br><small class="muted">${p.score} pts</small></span>
        <button class="btn sm gray" data-act="a:plus" data-id="${p.id}" title="+5">+5</button><button class="btn sm gray" data-act="a:minus" data-id="${p.id}" title="-5">−5</button>
        <button class="btn sm red" data-act="a:kick" data-id="${p.id}" data-name="${esc(p.name)}" title="Desconectar">✖</button></li>`;
    }).join('') || '<li class="muted">Aún no hay participantes</li>'}</ul>`;
    const targets = [...S.players.map((p) => [`player:${p.id}`, '👤 ' + p.name]), ...S.teams.map((t) => [`team:${t.id}`, '👥 ' + t.name])];
    const adjust = `<form data-form="adjust"><div class="row"><select name="target">${targets.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <input type="number" name="delta" placeholder="± puntos" required style="max-width:110px"></div><input name="reason" maxlength="80" placeholder="Motivo (opcional)" style="margin-top:8px">
      <button class="btn blue block" type="submit" ${targets.length ? '' : 'disabled'}>Aplicar puntos</button></form>
      ${A.adjustments.length ? `<p class="muted">${A.adjustments.slice().reverse().map((a) => `${esc(a.name)}: ${a.delta > 0 ? '+' : ''}${a.delta}${a.reason ? ' (' + esc(a.reason) + ')' : ''}`).join('<br>')}</p>` : ''}`;
    mount('admin', `${top()}<div class="card" style="margin-bottom:14px"><div class="row" style="justify-content:space-between"><div data-slot="hd" style="flex:2"></div></div><div data-slot="ctl" style="margin-top:12px"></div></div>
      <div class="admin-grid"><div><div class="card" data-slot="stage"></div><div class="card" style="margin-top:14px" data-slot="cfg"></div></div>
      <div><div class="card" data-slot="rank"></div><div class="card" style="margin-top:14px" data-slot="people"></div><div class="card" style="margin-top:14px" data-slot="adj"></div><div class="card" style="margin-top:14px" data-slot="log"></div></div></div>`, {
      hd: `<h2 style="margin:0">Panel del administrador · <span style="color:var(--pri);letter-spacing:.15em">${S.code}</span></h2>
        <span class="status">${STATUS[st]}</span> <span class="badge">${S.config.mode === 'teams' ? '👥 Equipos' : '👤 Individual'}</span> <span class="badge">${A.availableQuestions} preguntas disponibles</span>
        <button class="btn sm gray" data-act="a:logout" style="float:right">Cerrar sesión</button>`,
      ctl: controls, stage,
      cfg: st === 'lobby' ? `<h2>⚙️ Configuración</h2>${configForm(S.config, S.categories, false)}` : `<h2>⚙️ Configuración</h2><p class="muted">${S.config.rounds} preguntas · ${S.config.timeLimit}s · dificultad ${S.config.difficulty} · reto cada ${S.config.challengeEvery || '—'} · correcta ${S.config.points.correct} · velocidad hasta ${S.config.points.speedMax} · final x${S.config.points.finalMultiplier}</p><p class="muted">Reinicia la partida para cambiar la configuración.</p>`,
      rank: `<h2>🏆 Ranking en vivo</h2>${rankList(S.ranking, null)}${S.playerRanking ? `<h3>Individual</h3>${rankList(S.playerRanking, null)}` : ''}`,
      people: `<h2>👥 Participantes (${S.players.length})</h2>${people}`,
      adj: `<h2>✍️ Puntos manuales</h2>${adjust}`,
      log: `<h2>🎭 Retos realizados</h2>${S.challengeLog.length ? S.challengeLog.map((c) => `<p class="muted">${c.result === 'done' ? '✅' : '❌'} <b>${esc(c.playerName)}</b>${c.teamName ? ' (' + esc(c.teamName) + ')' : ''}: ${esc(c.text)} (${c.points})</p>`).join('') : '<p class="muted">Ninguno todavía.</p>'}`,
    });
  }

  /* ---------------- Eventos ---------------- */
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const kind = f.dataset.form;
      if (kind === 'join') {
        const code = f.code.value.trim().toUpperCase(), name = f.name.value.trim();
        if (!/^[A-Z0-9]{5}$/.test(code)) { error = 'El código tiene 5 caracteres.'; render(); return; }
        if (name.length < 2) { error = 'Escribe un nombre de al menos 2 caracteres.'; render(); return; }
        const r = await emit('player:join', { code, name });
        if (r.ok) { error = ''; store.set(LS.player, { code: r.code, token: r.token }); }
        else { error = r.error || ''; render(); }
      } else if (kind === 'team') {
        const r = await emit('player:createTeam', { name: f.name.value, color: ui.teamColor });
        if (r.ok) f.reset();
      } else if (kind === 'create') {
        const r = await emit('admin:create', { password: f.password.value, config: readConfig(f) });
        if (r.ok) store.set(LS.admin, { code: r.code, adminToken: r.adminToken });
      } else if (kind === 'config') {
        const r = await emit('admin:config', { config: readConfig(f) });
        if (r.ok) { toast('Configuración guardada ✅'); cache.cfg = null; }
      } else if (kind === 'adjust') {
        const [targetType, targetId] = f.target.value.split(':');
        const r = await emit('admin:adjust', { targetType, targetId, delta: +f.delta.value, reason: f.reason.value });
        if (r.ok) { f.delta.value = ''; f.reason.value = ''; toast('Puntos aplicados'); }
      }
    } finally { busy = false; }
  });

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act, id = el.dataset.id;
    switch (a) {
      case 'home': kicked = null; render(); break;
      case 'ready': emit('player:ready', { ready: !S.you.ready }); break;
      case 'joinTeam': emit('player:joinTeam', { teamId: id }); break;
      case 'leaveTeam': emit('player:leaveTeam'); break;
      case 'color': ui.teamColor = el.dataset.c; document.querySelectorAll('.sw').forEach((s) => s.classList.toggle('sel', s === el)); break;
      case 'answer': {
        document.querySelectorAll('.opt').forEach((b) => { b.disabled = true; b.classList.add(b === el ? 'mine' : 'dim'); });
        const r = await emit('player:answer', { choice: +el.dataset.i });
        if (!r.ok) { curScreen = null; render(); }
        break;
      }
      case 'leave': await emit('player:leave'); store.del(LS.player); S = null; render(); break;
      case 'a:start': emit('admin:start'); break;
      case 'a:pause': emit('admin:pause'); break;
      case 'a:resume': emit('admin:unpause'); break;
      case 'a:next': emit('admin:next'); break;
      case 'a:challenge': emit('admin:challenge'); break;
      case 'a:reroll': emit('admin:challenge', { reroll: true }); break;
      case 'a:chOk': emit('admin:resolveChallenge', { success: true }); break;
      case 'a:chFail': emit('admin:resolveChallenge', { success: false }); break;
      case 'a:autoTeams': emit('admin:autoTeams'); break;
      case 'a:plus': emit('admin:adjust', { targetType: 'player', targetId: id, delta: 5, reason: 'Ajuste rápido' }); break;
      case 'a:minus': emit('admin:adjust', { targetType: 'player', targetId: id, delta: -5, reason: 'Ajuste rápido' }); break;
      case 'a:end': if (confirmTwice(el, '¿Seguro? Pulsa otra vez')) emit('admin:end'); break;
      case 'a:reset': if (confirmTwice(el, '¿Reiniciar? Pulsa otra vez')) emit('admin:reset'); break;
      case 'a:kick': if (confirmTwice(el, '¿Retirar?')) emit('admin:kick', { playerId: id }); break;
      case 'a:logout': store.del(LS.admin); S = null; curScreen = null; render(); break;
    }
  });

  // Confirmación sin diálogos bloqueantes: requiere un segundo clic en 3 s.
  function confirmTwice(el, msg) {
    if (el.dataset.armed) return true;
    el.dataset.armed = '1'; const old = el.innerHTML; el.innerHTML = msg;
    setTimeout(() => { delete el.dataset.armed; el.innerHTML = old; }, 3000);
    return false;
  }

  function toast(msg, bad = false) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }

  /* ---------------- Temporizador y efectos ---------------- */
  setInterval(() => {
    if (!S || !S.question || !['question', 'paused'].includes(S.status)) return;
    const q = S.question;
    const rem = S.status === 'paused' ? q.remainingMs : Math.max(0, q.endsAt - now());
    const frac = rem / (q.timeLimit * 1000);
    const ring = $('#ring'), num = $('#tnum'), box = $('#timer');
    if (ring) { ring.style.strokeDashoffset = String(201 * (1 - frac)); ring.style.stroke = frac < 0.25 ? '#ff4d4d' : frac < 0.5 ? '#ffb703' : '#ffd23f'; }
    if (num) num.textContent = Math.ceil(rem / 1000);
    if (box) box.classList.toggle('low', frac < 0.25);
  }, 100);

  function effects(prev, st) {
    if (st.status === 'reveal' && st.reveal) {
      const key = st.run + '-r' + st.reveal.questionIndex;
      const me = st.you && st.reveal.results[st.you.id];
      if (!ui.celebrated.has(key) && me && me.correct) { ui.celebrated.add(key); confetti(120); }
    }
    if (st.status === 'finished' && !ui.celebrated.has(st.run + '-f')) { ui.celebrated.add(st.run + '-f'); confetti(300); }
  }

  function confetti(n) {
    const c = $('#confetti'), ctx = c.getContext('2d');
    c.width = innerWidth; c.height = innerHeight;
    const parts = Array.from({ length: n }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5, r: 4 + Math.random() * 6, vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4, a: Math.random() * 6, col: COLORS[(Math.random() * COLORS.length) | 0] }));
    let t = 0;
    (function frame() {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.a += 0.1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.col; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); ctx.restore(); }
      if (++t < 200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
    })();
  }

  boot();
})();
