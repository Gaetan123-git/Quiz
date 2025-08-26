const Database = require('better-sqlite3');
const db = new Database('frenchquest.db', { verbose: console.log });

console.log('[DB] Connexion à la base de données SQLite réussie.');

// La structure de la table 'users' est mise à jour :
// - googleId: pour stocker l'ID unique de l'utilisateur Google.
// - password: n'est plus requis (NOT NULL a été enlevé).
// - avatarType/avatarUrl/avatarKey: pour stocker l'avatar de profil de l'utilisateur.
const createTableQuery = `
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY NOT NULL UNIQUE,
    password TEXT,
    paymentPhone TEXT,
    googleId TEXT UNIQUE,
    scores TEXT,
    currentScore INTEGER DEFAULT 0,
    lastScoreUpdate TEXT,
    activeSession TEXT,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    achievements TEXT,
    streakCount INTEGER DEFAULT 0,
    lastPlayDate TEXT,
    consecutiveCorrectAnswers INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 100,
    competitionCoins INTEGER DEFAULT 0,
    completedSessions TEXT,
    rewardedQuestionIds TEXT,
    sessionScores TEXT,
    avatarType TEXT,
    avatarUrl TEXT,
    avatarKey TEXT
);
`;

db.exec(createTableQuery);
console.log('[DB] La table "users" a été créée ou existe déjà avec la nouvelle structure.');

// Migration douce: ajouter les colonnes manquantes si la table existante ne les possède pas.
try {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  const names = new Set(columns.map(c => c.name));
  db.exec('BEGIN');
  if (!names.has('paymentPhone')) {
    db.exec('ALTER TABLE users ADD COLUMN paymentPhone TEXT');
    console.log('[DB] Colonne paymentPhone ajoutée.');
  }
  if (!names.has('avatarType')) {
    db.exec('ALTER TABLE users ADD COLUMN avatarType TEXT');
    console.log('[DB] Colonne avatarType ajoutée.');
  }
  if (!names.has('avatarUrl')) {
    db.exec('ALTER TABLE users ADD COLUMN avatarUrl TEXT');
    console.log('[DB] Colonne avatarUrl ajoutée.');
  }
  if (!names.has('avatarKey')) {
    db.exec('ALTER TABLE users ADD COLUMN avatarKey TEXT');
    console.log('[DB] Colonne avatarKey ajoutée.');
  }
  db.exec('COMMIT');
} catch (err) {
  console.error('[DB] Erreur lors de la migration des colonnes avatar:', err);
  try { db.exec('ROLLBACK'); } catch (e) {}
}
db.close();