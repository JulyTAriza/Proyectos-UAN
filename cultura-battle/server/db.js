'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, icon TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id TEXT NOT NULL REFERENCES categories(id),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('facil','media','dificil')),
  text TEXT NOT NULL UNIQUE,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL UNIQUE, type TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS games (
  code TEXT PRIMARY KEY,
  admin_token_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  config TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  game_code TEXT NOT NULL REFERENCES games(code) ON DELETE CASCADE,
  name TEXT NOT NULL, color TEXT NOT NULL, bonus INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  game_code TEXT NOT NULL REFERENCES games(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  team_id TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  kicked INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_code TEXT NOT NULL,
  run INTEGER NOT NULL,
  question_index INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  team_id TEXT,
  choice INTEGER NOT NULL,
  is_correct INTEGER NOT NULL,
  points INTEGER NOT NULL,
  time_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (game_code, run, question_index, player_id)
);
CREATE TABLE IF NOT EXISTS challenge_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_code TEXT NOT NULL, run INTEGER NOT NULL,
  challenge_id INTEGER, text TEXT NOT NULL,
  player_id TEXT, team_id TEXT,
  result TEXT NOT NULL, points INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS score_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_code TEXT NOT NULL, run INTEGER NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  delta INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_code TEXT NOT NULL, run INTEGER NOT NULL, mode TEXT NOT NULL,
  rank INTEGER NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  name TEXT NOT NULL, score INTEGER NOT NULL, members TEXT,
  created_at INTEGER NOT NULL
);
`;

function openDb(file) {
  const dbFile = file || process.env.DB_FILE || path.join(__dirname, '..', 'data', 'cultura-battle.db');
  if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  return db;
}

/** Carga el banco inicial de preguntas y retos (idempotente). */
function seed(db, { force = false } = {}) {
  const bank = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'questions.json'), 'utf8'));
  const challenges = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'challenges.json'), 'utf8'));
  const count = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  if (count > 0 && !force) return { questions: count, seeded: false };
  db.exec('BEGIN');
  try {
    const upCat = db.prepare('INSERT INTO categories (id,name,color,icon) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, icon=excluded.icon');
    for (const c of bank.categories) upCat.run(c.id, c.name, c.color, c.icon);
    const upQ = db.prepare(`INSERT INTO questions (category_id,difficulty,text,options,correct_index,explanation)
      VALUES (?,?,?,?,?,?) ON CONFLICT(text) DO UPDATE SET category_id=excluded.category_id, difficulty=excluded.difficulty,
      options=excluded.options, correct_index=excluded.correct_index, explanation=excluded.explanation`);
    for (const q of bank.questions) {
      if (!Array.isArray(q.o) || q.o.length !== 4 || new Set(q.o).size !== 4) throw new Error('Pregunta inválida: ' + q.q);
      upQ.run(q.c, q.d, q.q, JSON.stringify(q.o), q.a, q.e);
    }
    const upCh = db.prepare('INSERT INTO challenges (text,type) VALUES (?,?) ON CONFLICT(text) DO UPDATE SET type=excluded.type');
    for (const ch of challenges) upCh.run(ch.text, ch.type);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { questions: db.prepare('SELECT COUNT(*) AS n FROM questions').get().n, seeded: true };
}

module.exports = { openDb, seed };
