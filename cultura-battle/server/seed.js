'use strict';
// Recarga el banco de preguntas y retos en la base de datos (actualiza los existentes).
const { openDb, seed } = require('./db');
const db = openDb();
const r = seed(db, { force: true });
console.log(`Banco cargado: ${r.questions} preguntas.`);
db.close();
