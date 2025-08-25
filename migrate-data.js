const fs = require('fs');
const Database = require('better-sqlite3');

// On se connecte à la base de données que nous venons de créer.
const db = new Database('frenchquest.db');

console.log('[MIGRATE] Lecture du fichier utilisateur.json...');

// On lit les données des utilisateurs depuis l'ancien fichier.
const usersData = JSON.parse(fs.readFileSync('utilisateur.json', 'utf8'));

// On prépare notre commande d'insertion. Le '?' est une précaution de sécurité
// pour s'assurer que les données sont insérées proprement.
const insert = db.prepare(`
    INSERT OR REPLACE INTO users (
        username, password, scores, currentScore, lastScoreUpdate, activeSession,
        xp, level, achievements, streakCount, lastPlayDate, consecutiveCorrectAnswers,
        coins, competitionCoins, completedSessions, rewardedQuestionIds, sessionScores
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// On commence une "transaction" pour que l'opération soit beaucoup plus rapide.
db.transaction((users) => {
    for (const user of users) {
        console.log(`[MIGRATE] Migration de l'utilisateur : ${user.username}`);
        
        // La base de données ne peut pas stocker directement des listes (arrays) ou des objets.
        // La solution la plus simple est de les convertir en texte au format JSON.
        // On fera l'opération inverse (texte -> objet) lors de la lecture.
        insert.run(
            user.username,
            user.password,
            JSON.stringify(user.scores || []),
            user.currentScore || 0,
            user.lastScoreUpdate,
            user.activeSession,
            user.xp || 0,
            user.level || 1,
            JSON.stringify(user.achievements || []),
            user.streakCount || 0,
            user.lastPlayDate,
            user.consecutiveCorrectAnswers || 0,
            user.coins === undefined ? 100 : user.coins,
            user.competitionCoins || 0,
            JSON.stringify(user.completedSessions || []),
            JSON.stringify(user.rewardedQuestionIds || []),
            JSON.stringify(user.sessionScores || {})
        );
    }
})(usersData);

console.log('[MIGRATE] Migration terminée avec succès !');

db.close();