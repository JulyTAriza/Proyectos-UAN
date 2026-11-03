# ⚡ CULTURA BATTLE

Juego web multijugador en tiempo real de cultura general, inspirado en *Preguntados*, para actividades de integración universitaria. Los participantes entran desde el navegador de su celular, tableta o computador (sin instalar nada), se unen con un código y compiten de forma individual o por equipos, con retos sorpresa y ranking en vivo.

## Arquitectura

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | HTML + CSS + JavaScript sin compilación (`/docs`) | Carga rápido en cualquier celular y se publica tal cual en **GitHub Pages**. |
| Tiempo real | **Socket.io** (WebSocket con respaldo de *long-polling*) | Reconexión automática, salas por partida y confirmación (*ack*) de cada acción. |
| Backend | **Node.js 22 + Express** (`/server`) | Servidor autoritativo: calcula tiempos, respuestas y puntajes. El navegador nunca decide un puntaje. |
| Base de datos | **SQLite** (`node:sqlite`, integrado en Node 22) | Persistente, sin servidor adicional ni dependencias nativas. |

> **Importante:** GitHub Pages solo sirve archivos estáticos. El **frontend** va en GitHub Pages y el **backend** debe correr en un servicio que ejecute Node.js (Render, Railway, Fly.io, un VPS o un PC de la sala). Abajo están los pasos.

```
Celulares / PCs ──HTTPS──► GitHub Pages (docs/)        (interfaz)
       │
       └──WebSocket──► Backend Node.js + Socket.io ──► SQLite
```

### Seguridad y consistencia
- La respuesta correcta **nunca** se envía a los jugadores antes de que termine la pregunta; las opciones se barajan en el servidor en cada partida.
- Cada respuesta se valida en el servidor (partida, jugador, turno, tiempo) y queda protegida por una restricción `UNIQUE` en la BD: no hay respuestas duplicadas aunque lleguen solicitudes simultáneas.
- Los puntajes solo se aplican al revelar la pregunta (no se filtra quién acertó durante la pregunta).
- Operaciones de administrador protegidas con contraseña (`ADMIN_PASSWORD`) + token secreto por partida (se guarda solo su hash SHA-256).
- Jugadores identificados por token aleatorio guardado en su navegador → reconexión sin perder progreso. Los expulsados no pueden volver con su sesión ni su nombre.
- Limitador de solicitudes por conexión, saneamiento de textos y escape de HTML en el cliente.

## Dos formas de funcionar (se detecta sola)

1. **Modo GitHub Pages (sin servidor propio)** — el que está publicado. El navegador del **administrador** actúa como anfitrión: ejecuta el mismo motor de juego (`server/game.js`, empaquetado en `docs/host.bundle.js`) y guarda la partida en su `localStorage`. Los jugadores se comunican con él en tiempo real por **MQTT sobre WebSocket** a través del broker público `wss://broker.emqx.io:8084/mqtt` (configurable en `docs/config.js` o con `?mqtt=`). La respuesta correcta nunca sale del dispositivo del administrador antes de revelarse y las acciones de administrador solo se ejecutan localmente.
   - El panel del admin debe permanecer abierto durante la partida (si lo recarga, la partida continúa y los jugadores se reconectan solos).
   - Al usar un broker público, cualquiera que conozca el código podría observar los mensajes de la partida; para mayor privacidad usa el modo servidor o un broker propio.
2. **Modo servidor (Node.js)** — si el sitio se abre desde el backend (`npm start`), se usa Socket.io + SQLite con contraseña de administrador.

## Ejecutar localmente (2 minutos)

Requisitos: **Node.js 22.13 o superior**.

```bash
npm install
cp .env.example .env      # edita ADMIN_PASSWORD
npm start
```

- Abre `http://localhost:3000` → vista de jugador.
- Abre `http://localhost:3000/#/admin` → panel del administrador.
- Para que los compañeros entren desde sus celulares en la misma red Wi-Fi: usa la IP del PC, p. ej. `http://192.168.1.20:3000` (el panel muestra un **código QR** con el enlace).

La base de datos se crea sola en `data/cultura-battle.db` y se carga el banco inicial (100 preguntas, 10 categorías, 20 retos). Para recargar el banco tras editar `server/data/*.json`: `npm run seed`.

### Credenciales de prueba
- Contraseña de administrador por defecto (si no defines `ADMIN_PASSWORD`): **`admin123`**. Cámbiala en producción.

## Desplegar para la actividad

### 1) Backend en Render (gratis)
1. Sube este repositorio a GitHub.
2. En [render.com](https://render.com) → **New → Blueprint** → elige el repositorio (usa `render.yaml`), o **New → Web Service** con:
   - Build: `npm install` · Start: `npm start`
   - Variables: `ADMIN_PASSWORD` (tu clave), `CLIENT_ORIGIN=https://TU_USUARIO.github.io`
3. Copia la URL que te da Render, p. ej. `https://cultura-battle.onrender.com`.

> El plan gratuito de Render "duerme" el servicio tras 15 min sin uso: ábrelo unos minutos antes de la actividad. Su disco es efímero; para conservar el historial entre reinicios/despliegues agrega un *Persistent Disk* y define `DB_FILE=/var/data/cultura-battle.db`.

El backend también sirve el frontend, así que **con solo Render ya se puede jugar** desde `https://cultura-battle.onrender.com`.

### 2) Frontend en GitHub Pages
1. Edita `docs/config.js` y pon la URL del backend:
   ```js
   window.CB_SERVER_URL = 'https://cultura-battle.onrender.com';
   ```
2. En GitHub → **Settings → Pages** → *Deploy from a branch* → rama `main`, carpeta **`/docs`**.
3. Comparte `https://TU_USUARIO.github.io/REPO/` con los participantes y usa `.../#/admin` para el panel.

## Cómo se juega

1. **Admin** entra a `#/admin`, escribe la contraseña, elige modalidad (individual / equipos libres / equipos automáticos), número de preguntas, tiempo, categorías, dificultad, cada cuántas preguntas hay reto y la puntuación → **Crear partida**.
2. **Jugadores** entran a la página (o escanean el QR), escriben el código y su apodo, marcan *¡Estoy listo!* y, en modo equipos libres, crean o se unen a un equipo (con límite de integrantes).
3. El admin pulsa **Iniciar**. Cada pregunta tiene temporizador; se cierra sola cuando se agota el tiempo o cuando todos respondieron.
4. Se revela la respuesta, la explicación, cuántos eligieron cada opción y el ranking con flechas de cambio de posición.
5. Cada *N* preguntas (o cuando el admin pulsa **Reto sorpresa**) aparece un reto para el jugador (o un integrante del equipo) con menor puntaje. El admin marca **Cumplido** / **No cumplido**.
6. Al terminar se muestra el podio, el ganador y la clasificación final (se guarda en la BD).

**Equipos:** en cada pregunta responde un integrante distinto de cada equipo (rotación automática); los demás ven la pregunta y pueden ayudar en voz alta. Si el designado se desconecta, el turno pasa a otro integrante.

**Puntuación (configurable):** correcta 10 · incorrecta 0 · velocidad hasta +5 (proporcional al tiempo restante) · reto cumplido +5 · pregunta final ×2.

**Panel del admin:** iniciar, pausar/reanudar, revelar/avanzar, reto sorpresa (o cambiar de reto), finalizar, reiniciar (conserva jugadores y pone puntajes en 0), ver respuestas recibidas en vivo (con tiempo de cada uno), ajustar puntos (±5 rápido o cantidad con motivo, a jugador o equipo), expulsar participantes, distribuir equipos automáticamente y editar la configuración en la sala de espera.

## Pruebas

```bash
npm test                                   # 14 pruebas E2E con servidor real y varios clientes Socket.io
npx playwright install chromium            # (solo la primera vez)
node --disable-warning=ExperimentalWarning tests/ui.test.js   # navegador real: celular, tableta y PC
npm run test:host                          # modo GitHub Pages: broker MQTT local + navegador real (equipos, recargas, expulsión)
npm run build:web                          # regenera docs/host.bundle.js si cambias server/game.js o el banco de preguntas
```

Evidencia: `tests/last-run.txt` (resultado de la última ejecución) y `tests/screenshots/` (capturas en distintos tamaños).

| # | Verificación | Prueba |
|---|---|---|
| 1-2 | Registro de varios jugadores y acceso por código | E2E (6 jugadores simultáneos) + UI |
| 3 | Modalidad individual | E2E |
| 4-5 | Modalidad por equipos, creación y asignación (libre y automática) | E2E |
| 6 | Respuestas simultáneas (incl. duplicado en paralelo) | E2E |
| 7 | Cálculo de puntajes, bono de velocidad, final doble | E2E |
| 8 | Ranking en tiempo real con cambios de posición | E2E + UI |
| 9 | Retos: asignación al de menor puntaje y validación | E2E (individual y equipos) |
| 10 | Temporizador, cierre automático y pausa | E2E |
| 11 | Reconexión sin perder progreso | E2E + UI (recarga de página) |
| 12 | Finalización y ganador | E2E + UI |
| 13 | Persistencia tras reiniciar el servidor y al recargar | E2E + UI |
| 14 | Diferentes tamaños de pantalla | UI (iPhone 13, iPad Mini, 1366 px) |
| 15 | Permisos admin vs. participante | E2E |

## Estructura

```
server/   index.js (HTTP + Socket.io) · game.js (motor de juego) · db.js (esquema SQLite + carga) · seed.js
server/data/questions.json  ← banco de preguntas (100)   server/data/challenges.json ← retos (20)
docs/     index.html · app.js · styles.css · config.js · vendor/qrcode.js   ← frontend (GitHub Pages)
tests/    e2e.test.js · ui.test.js · screenshots/ · last-run.txt
```

### Agregar preguntas
Añade objetos a `server/data/questions.json` con el formato
`{ "c": "categoria", "d": "facil|media|dificil", "q": "texto", "o": ["correcta", "op2", "op3", "op4"], "a": 0, "e": "explicación" }`
(el índice `a` indica la correcta; el orden se baraja en cada partida) y ejecuta `npm run seed`.

## Endpoints útiles
- `GET /health` — estado del servidor.
- `GET /api/categories` — categorías y número de preguntas por dificultad.
- `GET /api/games/:code/results` — resultados finales guardados de una partida.
