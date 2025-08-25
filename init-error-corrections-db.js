const Database = require('better-sqlite3');
const db = new Database('frenchquest.db');

console.log('[DB] Ajout de la table pour tracker les corrections d\'erreurs...');

// Créer une table pour enregistrer les corrections d'erreurs réussies
const createErrorCorrectionsTable = `
CREATE TABLE IF NOT EXISTS error_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    questionId TEXT NOT NULL,
    session TEXT NOT NULL,
    correctedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, questionId, session),
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_error_corrections_user ON error_corrections(username);
CREATE INDEX IF NOT EXISTS idx_error_corrections_question ON error_corrections(questionId, session);
`;

try {
    db.exec(createErrorCorrectionsTable);
    console.log('[DB] Table "error_corrections" créée avec succès.');
} catch (error) {
    console.error('[DB] Erreur lors de la création de la table error_corrections:', error);
}

db.close();
console.log('[DB] Initialisation terminée.');
