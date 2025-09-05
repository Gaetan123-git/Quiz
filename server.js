require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises; // Ajout de cette ligne pour les opérations de fichiers asynchrones
const crypto = require('crypto');
const router = require('json-server').router('db.json');
const multer = require('multer');
const cron = require('node-cron');
const bcrypt = require('bcrypt');
const moment = require('moment-timezone');
const Database = require('better-sqlite3');
const userNotificationClients = new Map();
const { generateHint, generateAnalysis, generateNewQuestions, generateChatResponse, generateCourse, validateAndRefineQuestions } = require('./gemini.js');
let sessionStatusClients = []; // S'assurer que cette ligne est bien présente

// --- NOUVEAU : Gestion de l'historique des questions générées ---
const HISTORY_FILE = path.join(__dirname, 'question_history.json');
let questionHistory = [];

function loadQuestionHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      questionHistory = JSON.parse(data);
      console.log(`[SERVER] Historique de ${questionHistory.length} questions chargé.`);
    } else {
      console.log('[SERVER] Aucun fichier d\'historique de questions trouvé. Un nouveau sera créé.');
    }
  } catch (error) {
    console.error('Erreur lors du chargement de l\'historique des questions:', error);
    questionHistory = [];
  }
}

async function saveQuestionHistory() {
  try {
    // Pour éviter que le fichier ne grandisse indéfiniment, on ne garde que les 500 dernières questions.
    const MAX_HISTORY_SIZE = 500;
    if (questionHistory.length > MAX_HISTORY_SIZE) {
      questionHistory = questionHistory.slice(questionHistory.length - MAX_HISTORY_SIZE);
    }
    await fsp.writeFile(HISTORY_FILE, JSON.stringify(questionHistory, null, 2), 'utf8');
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de l\'historique des questions:', error);
  }
}

// Charger l'historique au démarrage du serveur
loadQuestionHistory();

// --- NOUVEAU : Gestion des règles et des gagnants de la compétition ---
const COMPETITION_RULES_FILE = path.join(__dirname, 'competition_rules.json');
const WINNERS_FILE = path.join(__dirname, 'winners.json');

let competitionRules = { maxWinners: 3, competitionEnded: false, competitionEndTime: null };
let winners = [];

async function loadCompetitionRules() {
    try {
        const data = await fsp.readFile(COMPETITION_RULES_FILE, 'utf8');
        competitionRules = JSON.parse(data);
        console.log(`[SERVER] Règles de compétition chargées : ${competitionRules.maxWinners} gagnants max.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[SERVER] Fichier competition_rules.json non trouvé. Création avec les valeurs par défaut.');
            await saveCompetitionRules();
        } else {
            console.error('Erreur lors du chargement de competition_rules.json:', error);
        }
    }
}

async function saveCompetitionRules() {
    try {
        await fsp.writeFile(COMPETITION_RULES_FILE, JSON.stringify(competitionRules, null, 2), 'utf8');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de competition_rules.json:', error);
    }
}

async function loadWinners() {
    try {
        const data = await fsp.readFile(WINNERS_FILE, 'utf8');
        winners = JSON.parse(data);
        console.log(`[SERVER] ${winners.length} gagnants chargés depuis le fichier.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[SERVER] Fichier winners.json non trouvé. Initialisation à zéro gagnant.');
            winners = [];
            await saveWinners();
        } else {
            console.error('Erreur lors du chargement de winners.json:', error);
        }
    }
}

async function saveWinners() {
    try {
        await fsp.writeFile(WINNERS_FILE, JSON.stringify(winners, null, 2), 'utf8');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de winners.json:', error);
    }
}

// Charger les données au démarrage
loadCompetitionRules();
loadWinners();

// --- Simple JSON file cache (async) ---
const jsonCache = new Map(); // key: absolute or relative file path, value: { mtimeMs, data }

async function readJsonCached(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    const cached = jsonCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.data;
    }
    const content = await fsp.readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    jsonCache.set(filePath, { mtimeMs: stat.mtimeMs, data });
    return data;
  } catch (err) {
    // Passe l'erreur à l'appelant (pour gérer ENOENT etc.)
    throw err;
  }
}

// Sauvegarde tous les utilisateurs en mémoire dans la base SQLite
function saveUsers() {
  try {
    for (const user of users) {
      saveUser(user);
    }
    console.log('[DB] Tous les utilisateurs ont été sauvegardés.');
  } catch (error) {
    console.error('[DB] ERREUR lors de la sauvegarde de tous les utilisateurs :', error);
  }
}
function updateJsonCache(filePath, data) {
  // Appelé après un write réussi pour garder le cache à jour
  try {
    fs.stat(filePath, (err, stat) => {
      if (!err && stat) {
        jsonCache.set(filePath, { mtimeMs: stat.mtimeMs, data });
      } else {
        // Si stat échoue, on stocke quand même sans mtime pour éviter une relecture immédiate
        jsonCache.set(filePath, { mtimeMs: Date.now(), data });
      }
    });
  } catch (_) {}
}

const db = new Database('frenchquest.db');
db.pragma('busy_timeout = 5000'); // Attend jusqu'à 5 secondes (5000ms)
console.log('[DB] Connecté à la base de données SQLite.');
// ==========================================================
// ===         INITIALISATION DE LA BASE DE DONNÉES         ===
// ==========================================================
// Ce bloc de code s'assure que les tables nécessaires existent au démarrage.

// Commande SQL pour créer la table 'users' si elle n'existe pas déjà.
const createUsersTable = `
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    paymentPhone TEXT,
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
    balance REAL DEFAULT 0, -- AJOUT DE LA COLONNE SOLDE
    completedSessions TEXT,
    rewardedQuestionIds TEXT,
    sessionScores TEXT,
    avatarType TEXT,
    avatarUrl TEXT,
    avatarKey TEXT
  );
`;

const createErrorCorrectionsTable = `
  CREATE TABLE IF NOT EXISTS error_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    questionId TEXT NOT NULL,
    session TEXT NOT NULL,
    correctedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, questionId, session)
  );
`;

// NOUVELLE TABLE POUR GÉRER LES DÉPÔTS
const createDepositsTable = `
  CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    amount REAL NOT NULL,
    transaction_ref TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- Statuts : pending, approved, rejected
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    FOREIGN KEY (username) REFERENCES users(username)
  );
`;

// Exécute les commandes de création de table.
db.exec(createUsersTable);
db.exec(createErrorCorrectionsTable);
db.exec(createDepositsTable);

// Migration pour ajouter la colonne balance si elle n'existe pas
try {
    db.exec("ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0");
    console.log("[DB] Colonne 'balance' ajoutée à la table users.");
} catch (error) {
    if (error.code === 'SQLITE_ERROR' && error.message.includes('duplicate column name')) {
        console.log("[DB] Colonne 'balance' existe déjà dans la table users.");
    } else {
        console.error("[DB] Erreur lors de l'ajout de la colonne balance:", error);
    }
}

console.log("[DB] Vérification des tables 'users', 'error_corrections' et 'deposits' terminée.");
const app = express();
console.log(`[TEST] Heure actuelle serveur (locale) : ${new Date().toString()}`);
console.log(`[TEST] Heure à Paris via moment-timezone : ${moment().tz('Europe/Paris').format('YYYY-MM-DD HH:mm:ss Z')}`);
console.log(`[TEST] Heure à Madagascar via moment-timezone : ${moment().tz('Indian/Antananarivo').format('YYYY-MM-DD HH:mm:ss Z')}`);
console.log(`[INFO] Démarrage du serveur. Heure actuelle du serveur : ${new Date().toString()}`);
// --- Configuration Admin ---
const ADMIN_PASSWORD = "admin";
const ADMIN_TOKEN = "un-token-secret-a-changer-12345";

// Variables globales
const sessionChats = new Map();
const typingUsers = new Map();
// Map username -> Set of SSE response objects (allow multiple tabs/windows)
const userStatusClients = new Map();
const userSessionIds = new Map(); // username -> last sessionID

// --- Single-session policy: map username -> current loginId (last active device) ---
const userLoginIds = new Map();

function newLoginId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function isRequestFromActiveLogin(req) {
  const username = req.session?.user?.username;
  if (!username) return false;
  const current = userLoginIds.get(username);
  return current && req.session.loginId && current === req.session.loginId;
}

// Middleware
const SQLiteStore = require('connect-sqlite3')(session);
// On garde une référence explicite au store pour pouvoir invalider d'anciennes sessions (single-session policy)
const sessionStore = new SQLiteStore({
  db: 'sessions.db',
  dir: './'
});
app.use(session({
  store: sessionStore,
  secret: 'votre-secret-pour-les-sessions',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Préparer le stockage des avatars uploadés
const avatarsUploadDir = path.join(__dirname, 'public', 'uploads', 'avatars');
try {
  fs.mkdirSync(avatarsUploadDir, { recursive: true });
} catch (_) {}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarsUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = `${req.session?.user?.username || 'user'}-${Date.now()}${ext}`;
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// --- Gestion des données utilisateur avec SQLite ---

// On initialise notre variable globale qui contiendra les utilisateurs.
let users = [];

/**
 * Charge tous les utilisateurs depuis la base de données SQLite vers la variable `users` en mémoire.
 * Gère la conversion des champs JSON (stockés en texte) en objets JavaScript.
 */
function loadUsersFromDB() {
  try {
    // Prépare la requête SQL pour sélectionner toutes les colonnes de tous les utilisateurs.
    const stmt = db.prepare('SELECT * FROM users');
    // Exécute la requête et récupère tous les résultats.
    const rows = stmt.all();

    // Transforme les données de la base de données en format que notre application comprend.
    users = rows.map(user => {
      // Les listes et objets sont stockés en format texte (JSON) dans la base de données.
      // Nous devons les "parser" pour les transformer en vrais objets/tableaux JavaScript.
      return {
        ...user,
        scores: JSON.parse(user.scores || '[]'),
        achievements: JSON.parse(user.achievements || '[]'),
        completedSessions: JSON.parse(user.completedSessions || '[]'),
        rewardedQuestionIds: JSON.parse(user.rewardedQuestionIds || '[]'),
        sessionScores: JSON.parse(user.sessionScores || '{}')
      };
    });
    console.log(`[DB] ${users.length} utilisateurs chargés depuis la base de données.`);
  } catch (error) {
    console.error('[DB] ERREUR CRITIQUE lors du chargement des utilisateurs depuis la base de données:', error);
    users = []; // En cas d'erreur grave, on repart avec une liste vide pour éviter un crash.
  }
}

// On exécute cette fonction une fois au démarrage du serveur.
loadUsersFromDB();
// ==========================================================
// ===                 NOUVEAU BLOC À AJOUTER             ===
// ==========================================================
// On charge les données des livres depuis books.json
let books = [];
try {
  const bookData = fs.readFileSync('books.json', 'utf8');
  books = JSON.parse(bookData);
  console.log('[SERVER] Livres chargés avec succès :', books.length);
} catch (error) {
  console.error('Erreur lors du chargement de books.json :', error);
  books = []; // En cas d'erreur, on initialise avec une liste vide
}
// ==========================================================
// ===         NOUVEAU : CHARGEMENT DES THÈMES            ===
// ==========================================================
let themeData = { themes: [], currentIndex: 0 };
function loadThemes() {
  try {
    const data = fs.readFileSync('themes.json', 'utf8');
    themeData = JSON.parse(data);
    console.log(`[SERVER] Thèmes chargés. Thème actuel : "${themeData.themes[themeData.currentIndex]}"`);
  } catch (error) {
    console.error('Erreur lors du chargement de themes.json:', error);
    // On garde les données par défaut si le fichier n'existe pas
  }
}
loadThemes(); // On charge les thèmes au démarrage

const sessionQuestions = {};
const questionStartTimes = new Map(); // Stockage des temps de début de question par utilisateur
const sessionFiles = [
  'session1.json', 'session2.json', 'session3.json',
  'session4.json', 'session5.json', 'session6.json',
  'session7.json', 'session8.json', 'session9.json',
  'session10.json'
];

function loadSessionFile(sessionName) {
    const filePath = path.join(__dirname, `${sessionName}.json`);
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const sessionData = JSON.parse(data);
        sessionQuestions[sessionName] = Array.isArray(sessionData.questions) ? sessionData.questions : [];
        console.log(`[SERVER] Questions chargées/rechargées pour ${sessionName}:`, sessionQuestions[sessionName].length);
    } catch (error) {
        console.error(`[SERVER] Erreur lors du chargement de ${filePath}. Initialisation avec un tableau vide.`, error.code);
        sessionQuestions[sessionName] = [];
    }
}
sessionFiles.forEach(file => {
  const sessionName = file.replace('.json', '');
  loadSessionFile(sessionName);
});

// Expose current question IDs per session for client-side history alignment
app.get('/api/current-session-ids', (req, res) => {
  try {
    const result = {};
    Object.keys(sessionQuestions).forEach(sessionName => {
      const ids = (sessionQuestions[sessionName] || []).map(q => String(q.id));
      result[sessionName] = ids;
    });
    res.json(result);
  } catch (err) {
    console.error('[SERVER] Error building current-session-ids:', err);
    res.status(500).json({ error: 'Failed to get current session IDs' });
  }
});

// --- Helpers: normaliser et valider les questions générées ---
function normalizeValue(str) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/^'|'$/g, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .normalize('NFD').replace(/\p{Diacritic}+/gu, '')
    .toLowerCase();
}

function dedupeOptionsKeepFirst(options = []) {
  const seen = new Set();
  const out = [];
  for (const opt of options) {
    const key = normalizeValue(opt);
    if (!seen.has(key) && key) {
      seen.add(key);
      out.push(opt);
    }
  }
  return out;
}

function fixGeneratedQuestion(q) {
  if (!q || !Array.isArray(q.options)) return q;
  // Nettoyer doublons et espaces
  q.options = dedupeOptionsKeepFirst(q.options.map(o => typeof o === 'string' ? o.trim() : o));

  const normOptions = q.options.map(o => normalizeValue(o));
  const normCorrect = normalizeValue(q.correctAnswer);

  // Tenter un mapping par équivalence normalisée
  let matchedIndex = normCorrect ? normOptions.findIndex(no => no === normCorrect) : -1;

  if (matchedIndex >= 0) {
    // Aligner la bonne réponse sur la forme exacte de l'option affichée
    q.correctAnswer = q.options[matchedIndex];
  } else {
    // Si aucune correspondance, insérer la bonne réponse telle que fournie si non vide
    if (normCorrect) {
      // Éviter un doublon logique
      if (!normOptions.includes(normCorrect)) {
        q.options.push(q.correctAnswer);
      }
      // Mettre correctAnswer sur la forme exacte (dernière option ajoutée)
      q.correctAnswer = q.options[q.options.length - 1];
    } else if (q.options.length > 0) {
      // Fallback: sélectionner la première option pour éviter un état invalide côté client
      q.correctAnswer = q.options[0];
    }
  }

  return q;
}

/**
 * Crée une "empreinte" normalisée d'un texte de question pour une détection de doublons sémantiques simple.
 * @param {string} text Le texte de la question.
 * @returns {string} L'empreinte normalisée.
 */
function normalizeQuestionText(text) {
  if (!text) return '';
  // Met en minuscule, supprime les accents et la ponctuation, puis trie les mots.
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Enlève les accents
    .replace(/[^\w\s]/g, '') // Enlève la ponctuation
    .split(/\s+/) // Sépare en mots
    .filter(word => word.length > 2) // Garde les mots significatifs
    .sort() // Trie les mots par ordre alphabétique
    .join(' '); // Rejoint en une chaîne unique
}

/**
 * Sauvegarde un utilisateur spécifique dans la base de données SQLite.
 * C'est beaucoup plus performant que de sauvegarder toute la liste.
 * @param {object} user L'objet utilisateur à sauvegarder.
 */
function saveUser(user) {
  if (!user || !user.username) {
    console.error('[DB] Tentative de sauvegarde d\'un utilisateur invalide.');
    return;
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO users (
        username, password, paymentPhone, scores, currentScore, lastScoreUpdate, activeSession,
        xp, level, achievements, streakCount, lastPlayDate, consecutiveCorrectAnswers,
        coins, competitionCoins, balance, completedSessions, rewardedQuestionIds, sessionScores,
        avatarType, avatarUrl, avatarKey
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    // On exécute la commande en passant les données de l'utilisateur.
    // N'oubliez pas de re-transformer les objets/tableaux en texte JSON.
    stmt.run(
        user.username,
        user.password,
        user.paymentPhone || null,
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
        user.balance || 0, // AJOUTER LE CHAMP BALANCE ICI
        JSON.stringify(user.completedSessions || []),
        JSON.stringify(user.rewardedQuestionIds || []),
        JSON.stringify(user.sessionScores || {}),
        user.avatarType || null,
        user.avatarUrl || null,
        user.avatarKey || null
    );
     // console.log(`[DB] Utilisateur ${user.username} sauvegardé avec succès.`);
  } catch (error) {
     console.error(`[DB] Erreur lors de la sauvegarde de l'utilisateur ${user.username}:`, error);
  }
}
// Fonction pour écrire les modifications dans le fichier books.json
async function saveBooks() {
  try {
    await fsp.writeFile('books.json', JSON.stringify(books, null, 2), 'utf8');
    console.log('[SERVER] Fichier books.json sauvegardé avec succès.');
  } catch (error) {
    console.error('[SERVER] ERREUR lors de la sauvegarde de books.json :', error);
  }
}
async function saveThemes() {
  try {
    await fsp.writeFile('themes.json', JSON.stringify(themeData, null, 2), 'utf8');
    console.log('[SERVER] Fichier themes.json sauvegardé.');
    updateJsonCache('themes.json', themeData);
  } catch (error) {
    console.error('[SERVER] ERREUR lors de la sauvegarde de themes.json :', error);
  }
}

async function saveQuestions(sessionName) {
    const filePath = path.join(__dirname, `${sessionName}.json`);
    const dataToSave = { questions: sessionQuestions[sessionName] || [] };
    try {
        await fsp.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
        console.log(`[SERVER] Questions sauvegardées pour ${sessionName}`);
    } catch (error) {
        console.error(`[SERVER] ERREUR lors de la sauvegarde de ${sessionName}.json:`, error);
    }
}
/**
 * Planifie l'exécution de la rotation du thème.
 */
async function scheduleDailyThemeRotation() {
  console.log('[CRON] Préparation de la tâche de rotation des thèmes.');

  const scheduleTime = '30 23 * * *';
  const scheduleTimezone = 'Indian/Antananarivo';

  console.log(`[CRON] La tâche est planifiée pour s'exécuter à : ${scheduleTime} (Fuseau horaire: ${scheduleTimezone})`);

  cron.schedule(scheduleTime, async () => {
    console.log(`[CRON] Tâche déclenchée à ${moment().tz(scheduleTimezone).format('YYYY-MM-DD HH:mm:ss Z')} ! Rotation du thème...`);

    const newIndex = (themeData.currentIndex + 1) % themeData.themes.length;
    const newTheme = themeData.themes[newIndex];
    console.log(`[CRON] Nouveau thème : "${newTheme}"`);

    try {
      try {
        const currentCourseData = await fsp.readFile('course.json', 'utf8');
        const currentCourse = JSON.parse(currentCourseData);
        let courseHistoryData = [];
        try {
          const historyData = await fsp.readFile('course_history.json', 'utf8');
          courseHistoryData = JSON.parse(historyData);
        } catch (histError) {
          if (histError.code !== 'ENOENT') throw histError;
        }
        courseHistoryData.unshift(currentCourse);
        if (courseHistoryData.length > 30) {
            courseHistoryData = courseHistoryData.slice(0, 30);
        }
        await fsp.writeFile('course_history.json', JSON.stringify(courseHistoryData, null, 2), 'utf8');
        updateJsonCache('course_history.json', courseHistoryData);
        console.log('[CRON] Ancien cours archivé avec succès.');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('[CRON] Erreur lors de l\'archivage de l\'ancien cours:', error);
        }
      }
      
      users.forEach(user => {
        if (user.username !== 'devtest') {
          user.scores = []; user.currentScore = 0; user.activeSession = null;
          user.xp = 0; user.level = 1; user.achievements = []; user.consecutiveCorrectAnswers = 0;
          user.completedSessions = []; user.rewardedQuestionIds = [];
        }
      });
      for (const user of users) { saveUser(user); }
      console.log('[CRON] Progression de tous les utilisateurs réinitialisée.');

      console.log('[CRON] Purge de l\'historique des questions pour le nouveau thème...');
      questionHistory = [];
      await saveQuestionHistory();
      console.log('[CRON] Historique des questions purgé avec succès.');
      
      const courseContent = await generateCourse(newTheme);
      const courseData = { theme: newTheme, content: courseContent, generatedAt: new Date().toISOString() };
      await fsp.writeFile('course.json', JSON.stringify(courseData, null, 2), 'utf8');
      updateJsonCache('course.json', courseData);
      console.log('[CRON] Nouveau cours sauvegardé.');
      
      const allGeneratedInThisRun = [];
      const fingerprints = new Set(); // NOUVEAU : Set d'empreintes pour le CRON

      for (const sessionFile of sessionFiles) {
        const sessionName = sessionFile.replace('.json', '');
        const sessionNumber = parseInt(sessionName.replace('session', ''));
        
        let level = 'intermédiaire';
        if (sessionNumber <= 3) level = 'facile';
        if (sessionNumber >= 8) level = 'difficile';
        
        const targetCount = 15;
        let finalQuestionsForSession = [];
        let attempts = 0;
        const MAX_ATTEMPTS = 5;

        while (finalQuestionsForSession.length < targetCount && attempts < MAX_ATTEMPTS) {
          attempts++;
          const countToGenerate = (targetCount - finalQuestionsForSession.length) + 5;
          const rawQuestions = await generateNewQuestions(newTheme, level, 'Français', countToGenerate, courseContent, allGeneratedInThisRun);
          const correctedQuestions = await validateAndRefineQuestions(rawQuestions, newTheme, courseContent);

          for (const q of correctedQuestions) {
              const qText = q.text ? q.text.trim() : null;
              const fingerprint = normalizeQuestionText(qText);
              
              if (qText && !fingerprints.has(fingerprint) && finalQuestionsForSession.length < targetCount) {
                  finalQuestionsForSession.push(q);
                  fingerprints.add(fingerprint);
                  allGeneratedInThisRun.push(qText);
              }
          }
        }

        const questionsWithIds = finalQuestionsForSession.map(raw => {
          const q = fixGeneratedQuestion({ ...raw });
          return { ...q, id: crypto.randomBytes(8).toString('hex'), type: "standard" };
        });

        sessionQuestions[sessionName] = questionsWithIds;
        await saveQuestions(sessionName);
      }
      
      // Une fois toutes les sessions générées, on met à jour l'historique global sur disque.
      questionHistory = allGeneratedInThisRun;
      await saveQuestionHistory();
      console.log('[CRON] Toutes les questions ont été régénérées et l\'historique global a été sauvegardé.');

      themeData.currentIndex = newIndex;
      await saveThemes();
      console.log('[CRON] Rotation du thème terminée avec succès !');

    } catch (error) {
      console.error('[CRON] ERREUR CRITIQUE pendant la rotation du thème :', error);
    }
  }, {
    scheduled: true,
    timezone: scheduleTimezone
  });
}

// Lancer la planification
scheduleDailyThemeRotation();


// === Competition start time automation ===
function getNextCompetitionStartTime(tz = 'Indian/Antananarivo') {
  // Compute next occurrence of 20:00 in given timezone
  const nowTz = moment().tz(tz);
  const target = nowTz.clone().hour(20).minute(0).second(0).millisecond(0);
  if (nowTz.isAfter(target)) {
    target.add(1, 'day');
  }
  return target.toDate();
}

async function ensureCompetitionStartTime() {
  try {
    let data;
    try {
      data = await readJsonCached('competition.json');
    } catch (_) {
      data = null;
    }
    const current = data && data.startTime ? Date.parse(data.startTime) : NaN;
    const now = Date.now();
    if (!data || isNaN(current) || current < now) {
      const nextStart = getNextCompetitionStartTime('Indian/Antananarivo');
      const payload = { startTime: nextStart.toISOString() };
      await fsp.writeFile('competition.json', JSON.stringify(payload, null, 2), 'utf8');
      updateJsonCache('competition.json', payload);
      console.log('[COMPETITION] startTime auto-set to', payload.startTime);
    } else {
      console.log('[COMPETITION] startTime OK:', new Date(current).toISOString());
    }
  } catch (e) {
    console.error('[COMPETITION] Failed to ensure start time:', e);
  }
}

// On startup, ensure competition.json is valid and in the future
ensureCompetitionStartTime();

// Daily at 00:05 Antananarivo, roll forward if past
cron.schedule('5 0 * * *', async () => {
  try {
    await ensureCompetitionStartTime();
  } catch (e) {
    console.error('[COMPETITION] Cron ensure failed:', e);
  }
}, { timezone: 'Indian/Antananarivo' });

// Liste des utilisateurs connectés
const activeUsers = new Map();
// Throttle simple pour éviter le spam sur certaines routes
const questionsThrottle = new Map(); // key: `${username}|${session}` -> last timestamp
// Throttle SSE par utilisateur pour éviter les reconnexions trop rapides
const sseThrottle = new Map(); // key: `${type}|${username}` -> last timestamp

// --- Constantes et utilitaires de gamification ---
const XP_PER_LEVEL = 1000;
const XP_BASE_CORRECT = 100;
const XP_TIME_BONUS_FACTOR = 2;
const MAX_TIME_BONUS_SECONDS = 30;

const achievements = {
    FIRST_WIN: { id: 'FIRST_WIN', name: 'Première Victoire', description: 'Gagnez votre première partie de quiz !' },
    TEN_CONSECUTIVE_CORRECT: { id: 'TEN_CONSECUTIVE_CORRECT', name: 'Série de 10', description: 'Répondez correctement à 10 questions d\'affilée.' },
};

function awardAchievement(user, achievementId) {
    if (!user.achievements) user.achievements = [];
    if (!user.achievements.includes(achievementId)) {
        user.achievements.push(achievementId);
        console.log(`[SERVER] Succès débloqué pour ${user.username}: ${achievements[achievementId].name}`);
        return true;
    }
    return false;
}

function calculateLevel(xp) {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function broadcastSessionStatus() {
  const sessionCounts = {};
  sessionFiles.forEach(file => {
      const sessionName = file.replace('.json', '');
      sessionCounts[sessionName] = 0;
  });
  users.forEach(user => {
      if (activeUsers.has(user.username) && user.activeSession) {
          if (sessionCounts[user.activeSession] !== undefined) {
              sessionCounts[user.activeSession]++;
          }
      }
  });

  // Nettoyage: retirer les clients terminés et gérer les erreurs d'écriture
  const aliveClients = [];
  for (const client of sessionStatusClients) {
    const res = client && (client.res || client);
    try {
      if (!res || res.writableEnded) continue;
      res.write(`data: ${JSON.stringify(sessionCounts)}\n\n`);
      aliveClients.push(client);
    } catch (e) {
      // On ignore et on n'ajoute pas ce client (nettoyé)
    }
  }
  sessionStatusClients = aliveClients;
}

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
// être déjà fermée, provoquant un crash.
function cleanupInactiveUsers() {
  const now = Date.now();
  console.log('[SERVER] Exécution du nettoyage des utilisateurs inactifs...');

  // Pour optimiser, on ne sauvegardera le fichier que si des changements ont eu lieu.
  let changesMade = false;

  // On parcourt la liste de tous les utilisateurs actuellement considérés comme actifs.
  activeUsers.forEach((lastActivityTimestamp, username) => {
    // On vérifie si le temps écoulé depuis la dernière activité dépasse notre seuil (5 minutes).
    if (now - lastActivityTimestamp > INACTIVITY_TIMEOUT_MS) {
      const user = users.find(u => u.username === username);
      if (!user) {
        // Si l'utilisateur n'est plus dans notre base de données, on le retire des actifs.
        activeUsers.delete(username);
        changesMade = true; // Un changement a eu lieu.
        return; // On passe au suivant.
      }
      
      console.log(`[SERVER] Utilisateur "${username}" inactif. Déconnexion.`);

      // ====================================================================
      // ===                 CORRECTION CRITIQUE APPLIQUÉE ICI            ===
      // ====================================================================
      // Avant de tenter d'écrire au client, on VÉRIFIE s'il existe bien
      // une connexion SSE (Server-Sent Events) active pour lui dans notre map.
      const client = userNotificationClients.get(username);
      // Supporte les deux formats possibles: res directement, ou {res}
      const clientRes = client && typeof client.write === 'function' ? client
                        : (client && client.res && typeof client.res.write === 'function' ? client.res : null);
      if (clientRes) {
        try {
            clientRes.write('event: inactivity-timeout\n');
            clientRes.write(`data: {"message": "Vous avez été déconnecté pour inactivité"}\n\n`);
        } catch (e) {
            console.warn(`[SERVER] Impossible d'envoyer la notification d'inactivité à ${username}, la connexion est probablement rompue.`);
        }
      }

      // On procède à la déconnexion logique de l'utilisateur.
      user.activeSession = null; // On annule sa session active.
      activeUsers.delete(username); // On le retire de la liste des joueurs actifs.
      saveUser(user); // On sauvegarde l'utilisateur déconnecté.
      changesMade = true; // On marque qu'un changement a été fait.
    }
  });

  // Si au moins un utilisateur a été déconnecté, on sauvegarde les changements.
  if (changesMade) {
    console.log('[SERVER] Nettoyage terminé, les utilisateurs modifiés ont été sauvegardés individuellement.');
    // On notifie également tous les clients que le statut des sessions a pu changer.
    broadcastSessionStatus();
  }

  console.log(`[SERVER] Nettoyage terminé. ${activeUsers.size} utilisateurs restent actifs.`);
}
setInterval(cleanupInactiveUsers, 10 * 60 * 1000); // 10 minutes en millisecondes
app.post('/register', async (req, res) => {
  const { username, password, paymentPhone } = req.body; // On récupère le numéro
  
  // Vérifie si un utilisateur avec ce nom existe déjà
  const existingUser = users.find(user => user.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: 'Ce nom d\'utilisateur est déjà pris.' });
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = {
      username,
      password: hashedPassword,
      paymentPhone: paymentPhone || null, // On ajoute le numéro ici
      googleId: null,
      scores: [],
      currentScore: 0,
      lastScoreUpdate: null,
      activeSession: null,
      xp: 0,
      level: 1,
      achievements: [],
      streakCount: 0,
      lastPlayDate: null,
      consecutiveCorrectAnswers: 0,
      coins: 100, 
      competitionCoins: 0,
      completedSessions: [],
      rewardedQuestionIds: []
    };
    users.push(newUser);
    saveUser(newUser);
    res.json({ message: 'Inscription réussie.' });

  } catch (error) {
    console.error('[SERVER] Erreur lors du hachage du mot de passe :', error);
    res.status(500).json({ error: 'Une erreur interne est survenue lors de l\'inscription.' });
  }
});
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  // ==========================================================
  // ===         VÉRIFICATION SÉCURISÉE DU MOT DE PASSE     ===
  // ==========================================================
  
  // 1. On trouve d'abord l'utilisateur uniquement par son nom.
  const user = users.find(u => u.username === username);
  if (!user) {
    // Message d'erreur générique pour ne pas indiquer si c'est le pseudo ou le mot de passe qui est faux.
    return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect.' });
  }

  try {
    // 2. On compare le mot de passe fourni par le client avec le hash stocké dans la base de données.
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      // Si les mots de passe ne correspondent pas, on renvoie la même erreur générique.
      return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect.' });
    }

    // Si la comparaison réussit, le reste de la logique de connexion s'exécute.
    console.log(`[SERVER] Réinitialisation de l'état de jeu pour "${username}" lors de la connexion.`);
    user.currentScore = 0;
    user.activeSession = null;
    user.consecutiveCorrectAnswers = 0;

    if (user.username === 'devtest') {
      console.log('[SERVER] Compte développeur "devtest" détecté ! Déverrouillage de toutes les sessions.');
      user.completedSessions = [
        'session1', 'session2', 'session3', 'session4', 'session5', 
        'session6', 'session7', 'session8', 'session9', 'session10'
      ];
    }

    const loginId = newLoginId();
    const previousSessionId = userSessionIds.get(username);
    req.session.user = user;
    req.session.loginId = loginId;
    userLoginIds.set(username, loginId);
    activeUsers.set(username, Date.now());

    try {
      if (previousSessionId && previousSessionId !== req.sessionID) {
        try { sessionStore.destroy(previousSessionId, () => {}); } catch (_) {}
        const clientSet = userStatusClients.get(username);
        if (clientSet && clientSet.size > 0) {
          for (const prevClient of clientSet) {
            if (prevClient && !prevClient.writableEnded) {
              try { prevClient.write(`data: ${JSON.stringify({ type: 'force_logout', reason: 'Nouvelle connexion détectée sur un autre appareil.' })}\n\n`); } catch (_) {}
              try { prevClient.end(); } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}
    userSessionIds.set(username, req.sessionID);

    if (user.xp === undefined) user.xp = 0;
    if (user.level === undefined) user.level = 1;
    if (user.achievements === undefined) user.achievements = [];
    if (user.streakCount === undefined) user.streakCount = 0;
    if (user.lastPlayDate === undefined) user.lastPlayDate = null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (user.lastPlayDate) {
        const lastPlay = new Date(user.lastPlayDate);
        lastPlay.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil(Math.abs(today.getTime() - lastPlay.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
            user.streakCount += 1;
        } else if (diffDays > 1) {
            user.streakCount = 1;
        }
    } else {
        user.streakCount = 1;
    }
    user.lastPlayDate = today.toISOString().split('T')[0];
    saveUser(user);

    res.json({ message: 'Connexion réussie.' });

  } catch (error) {
    console.error('[SERVER] Erreur lors de la comparaison du mot de passe :', error);
    res.status(500).json({ error: 'Une erreur interne est survenue lors de la connexion.' });
  }
});
app.get('/check-session', (req, res) => {
  if (req.session.user) {
    const user = users.find(u => u.username === req.session.user.username);
    if (user) {
      // Initialisation des valeurs par défaut si elles n'existent pas
      if (user.xp === undefined) user.xp = 0;
      if (user.level === undefined) user.level = 1;
      if (user.achievements === undefined) user.achievements = [];
      if (user.streakCount === undefined) user.streakCount = 0;
      if (user.completedSessions === undefined) user.completedSessions = [];
      
      // La logique spéciale pour le compte 'devtest' est conservée.
      if (user.username === 'devtest') {
        const sessionNames = ['session1', 'session2', 'session3', 'session4', 'session5', 'session6', 'session7', 'session8', 'session9', 'session10'];
        const fullUnlock = [...sessionNames];
        const originalCompleted = user.completedSessions || [];
        // On s'assure que devtest a toujours tout de débloqué
        if (JSON.stringify(originalCompleted.sort()) !== JSON.stringify(fullUnlock.sort())) {
          console.log(`[SERVER] Admin devtest détecté: forçage des sessions complètes.`);
          user.completedSessions = fullUnlock;
          saveUser(user);
        }
      }

      // ==========================================================
      // ===          LA CORRECTION DÉFINITIVE EST ICI          ===
      // ==========================================================
      // NOUS SUPPRIMONS LA LOGIQUE DE RECALCUL POUR LES UTILISATEURS NORMAUX.
      // Cette route se contente maintenant de lire et de renvoyer les données de l'utilisateur
      // telles qu'elles sont, sans les modifier. C'est la route '/end-quiz-session'
      // qui est la seule responsable de l'ajout d'une session à la liste des sessions complétées.

      res.json({
        loggedIn: true,
        username: user.username,
        xp: user.xp,
        level: user.level,
        scores: user.scores,
        achievements: user.achievements,
        streakCount: user.streakCount,
        coins: user.coins,
        competitionCoins: user.competitionCoins,
        balance: user.balance || 0,
        completedSessions: user.completedSessions, // On renvoie la liste telle quelle.
        avatarType: user.avatarType || null,
        avatarUrl: user.avatarUrl || null,
        avatarKey: user.avatarKey || null
      });
    } else {
      res.json({ loggedIn: false });
    }
  } else {
    res.json({ loggedIn: false });
  }
});
// REMPLACEZ l'intégralité de la fonction app.get('/user-ranking', ...) par cette nouvelle version.
app.get('/user-ranking', (req, res) => {
  // Si l'utilisateur n'est pas connecté, on ne peut pas calculer son rang.
  if (!req.session.user) {
      return res.status(401).json({ error: 'Non connecté.' });
  }

  // Étape 1 : Obtenir le nom de l'utilisateur actuel et la session ciblée.
  const session = req.query.session || 'session1';
  const currentUsername = req.session.user.username;

  // ====================================================================
  // ===                 CORRECTION DU BUG DE CLASSEMENT              ===
  // ====================================================================

  // Étape 2 : Créer une liste de tous les joueurs ayant un score pour cette session.
  // Cette logique est maintenant la même que pour le classement en temps réel, garantissant la cohérence.
  const rankedUsers = users
      // On filtre d'abord pour ne garder que les utilisateurs qui ont au moins un score dans cette session.
      .filter(user => user.scores.some(s => s.session === session))
      // Ensuite, on transforme ("map") chaque utilisateur en un objet simple contenant son pseudo et son score total pour la session.
      .map(user => {
          const scoreForSession = user.scores
              .filter(s => s.session === session)
              .reduce((total, s) => total + s.score, 0);
          return { username: user.username, score: scoreForSession };
      })
      // Étape 3 : Trier la liste des joueurs par score, de manière décroissante (le plus haut score en premier).
      .sort((a, b) => b.score - a.score);

  // Étape 4 : Trouver la position (le rang) de l'utilisateur actuel dans cette liste fraîchement triée.
  // .findIndex() nous donne l'index (0 pour le premier, 1 pour le deuxième, etc.), donc on ajoute 1 pour avoir le rang réel.
  const userRank = rankedUsers.findIndex(user => user.username === currentUsername) + 1;

  // Étape 5 : Renvoyer le rang correct au client.
  // Si l'utilisateur n'est pas trouvé (par exemple, il n'a aucun score), on renvoie 0.
  res.json({ rank: userRank > 0 ? userRank : 'N/A' });
});
app.post('/logout', (req, res) => {
  // On vérifie d'abord si un utilisateur est bien connecté dans la session
  if (req.session.user) {
    const username = req.session.user.username; // On sauvegarde le pseudo avant de détruire la session

    // On retire l'utilisateur de la liste des joueurs actifs en temps réel
    activeUsers.delete(username);

    // On détruit la session dans la base de données.
    // La fonction à l'intérieur ne s'exécutera que lorsque la destruction sera terminée.
    req.session.destroy(err => {
      if (err) {
        console.error('[SERVER] Erreur lors de la destruction de la session:', err);
        return res.status(500).json({ error: 'Déconnexion échouée.' });
      }

      // Maintenant que la session est détruite et la table 'sessions' déverrouillée,
      // nous pouvons modifier la table 'users' en toute sécurité.
      const user = users.find(u => u.username === username);
      if (user) {
        user.activeSession = null;
        saveUser(user); // On sauvegarde l'utilisateur déconnecté
        broadcastSessionStatus();
      }
      
      // On envoie la réponse de succès au client
      res.json({ message: 'Déconnexion réussie.' });
    });
  } else {
    // S'il n'y avait pas de session, on renvoie simplement une réponse de succès.
    res.json({ message: 'Déconnexion réussie.' });
  }
});

app.post('/reset-score', (req, res) => {
  if (req.session.user) {
    const user = users.find(u => u.username === req.session.user.username);
    if (user) {
      user.currentScore = 0;
      user.activeSession = null; 
      user.consecutiveCorrectAnswers = 0;
      saveUser(user);
    }
  }
  res.json({ message: 'Score réinitialisé avec succès.' });
});
// AJOUTEZ CETTE NOUVELLE ROUTE (par exemple, après la route /reset-score)
app.post('/reset-session-attempt', (req, res) => {
  // On vérifie si l'utilisateur est bien connecté.
  if (!req.session.user) {
    return res.status(401).json({ error: 'Non connecté.' });
  }

  // On récupère le nom de la session à réinitialiser depuis la requête du client.
  const { session } = req.body;
  if (!session) {
    return res.status(400).json({ error: 'Session non spécifiée.' });
  }

  // On trouve l'utilisateur correspondant dans notre base de données.
  const user = users.find(u => u.username === req.session.user.username);
  if (user) {
    console.log(`[SERVER] Réinitialisation de la tentative pour ${user.username} sur la session ${session}.`);
    
    // C'est ici que la magie opère :
    // On filtre le tableau des scores de l'utilisateur pour ne garder que les scores
    // qui N'APPARTIENNENT PAS à la session que l'on veut réinitialiser.
    user.scores = user.scores.filter(score => score.session !== session);
    
    // On réinitialise également son score actuel pour être propre.
    user.currentScore = 0;
    
    // On sauvegarde les changements dans le fichier utilisateur.json.
    saveUser(user);
    
    // On envoie une réponse de succès au client.
    res.json({ success: true, message: `Tentative pour la session ${session} réinitialisée.` });
  } else {
    res.status(404).json({ error: 'Utilisateur non trouvé.' });
  }
});
app.use(['/quiz', '/chat'], (req, res, next) => {
  // Ce code s'exécute à chaque fois que l'utilisateur navigue vers le quiz ou le chat.
  if (req.session.user) {
    // On récupère la session vers laquelle l'utilisateur TENTE d'aller.
    const sessionQuery = req.query.session || (req.body && req.body.session) || 'session1';
    const user = users.find(u => u.username === req.session.user.username);

    // On vérifie si l'utilisateur existe et s'il essaie de changer de session.
    if (user && isRequestFromActiveLogin(req) && user.activeSession !== sessionQuery) {
      
      const sessionNumber = parseInt(sessionQuery.replace('session', ''), 10);
      let isAccessAllowed = true; // On part du principe que l'accès est autorisé...

      // ====================================================================
      // ===               CORRECTION AVEC L'EXCEPTION DEVTEST            ===
      // ====================================================================
      // On applique la règle de verrouillage UNIQUEMENT si l'utilisateur N'EST PAS 'devtest'.
      if (user.username !== 'devtest') {
        // ...et si c'est une session supérieure à 1.
        if (sessionNumber > 1) {
          const requiredSession = `session${sessionNumber - 1}`;
          // On vérifie que la session précédente est bien dans la liste des sessions terminées.
          if (!user.completedSessions || !user.completedSessions.includes(requiredSession)) {
            isAccessAllowed = false; // L'accès est refusé pour un utilisateur normal !
          }
        }
      }
      // Pour 'devtest', isAccessAllowed restera toujours `true` par défaut.

      // Si, et seulement si, l'accès est autorisé (valable pour tous ou pour devtest).
      if (isAccessAllowed) {
        console.log(`[SERVER] Accès autorisé pour ${user.username} à ${sessionQuery}. Mise à jour du statut.`);
        user.activeSession = sessionQuery;
        
        // On recalcule le score actuel pour la nouvelle session.
        user.currentScore = user.scores
          .filter(s => s.session === sessionQuery)
          .reduce((total, score) => total + score.score, 0);
        
        // On notifie tout le monde du changement de statut avec un léger debounce
        try {
          const key = `broadcast|${user.username}`;
          const now = Date.now();
          const last = sseThrottle.get(key) || 0;
          if (now - last >= 500) { // au plus 2 diffusions par seconde par utilisateur
            broadcastSessionStatus();
            sseThrottle.set(key, now);
          }
        } catch (_) {
          // En cas de problème avec le throttle, on diffuse quand même pour ne pas bloquer l'UX
          try { broadcastSessionStatus(); } catch (_) {}
        }
      } else {
        // Si l'accès est refusé, on ne fait RIEN.
        console.log(`[SERVER] Accès refusé pour ${user.username} à ${sessionQuery}. Le statut reste sur ${user.activeSession || 'aucune session'}.`);
      }
    }
  }
  // On passe à la suite, pour que la route /questions puisse quand même envoyer le message d'erreur officiel si besoin.
  next();
});

function findQuestionByText(query) {
    const queryWords = query.toLowerCase().replace(/[?,.']/g, '').split(' ').filter(w => w.length > 3);
    if (queryWords.length === 0) return null;
    for (const sessionName in sessionQuestions) {
        for (const question of sessionQuestions[sessionName]) {
            let matches = 0;
            const questionTextLower = question.text.toLowerCase();
            for (const word of queryWords) {
                if(questionTextLower.includes(word)) {
                    matches++;
                }
            }
            if (matches >= 2 && matches >= queryWords.length / 2) { 
                return question;
            }
        }
    }
    return null;
}

app.get('/session-status', (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: 'Non connecté.' });
  }
  const sessionCounts = {};
  sessionFiles.forEach(file => {
      const sessionName = file.replace('.json', '');
      sessionCounts[sessionName] = 0;
  });
  users.forEach(user => {
      if (activeUsers.has(user.username) && user.activeSession) {
          if (sessionCounts[user.activeSession] !== undefined) {
              sessionCounts[user.activeSession]++;
          }
      }
  });
  res.json(sessionCounts);
});

app.get('/session-status-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Backoff de reconnexion client pour limiter les tempêtes de reconnexion
  res.write('retry: 5000\n');
  const clientId = Date.now();
  // Ping keep-alive pour maintenir la connexion ouverte via certains proxies
  const keepAliveInterval = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch (_) {}
  }, 25000);
  const newClient = { id: clientId, res, keepAliveInterval };
  sessionStatusClients.push(newClient);
  broadcastSessionStatus();
  const cleanup = () => {
    try { clearInterval(keepAliveInterval); } catch (_) {}
    sessionStatusClients = sessionStatusClients.filter(client => client.id !== clientId);
  };
  req.on('close', cleanup);
});
// REMPLACEZ CETTE ROUTE ENTIÈREMENT
app.get('/questions', async (req, res) => {
  if (competitionRules.competitionEnded) {
      const timeSinceEnd = Date.now() - new Date(competitionRules.competitionEndTime).getTime();
      const tenMinutes = 10 * 60 * 1000;
      if (timeSinceEnd < tenMinutes) {
          return res.status(403).json({
              error: 'La compétition est terminée ! Les résultats sont affichés. Les quiz reprendront dans quelques minutes.',
              competitionOver: true,
              winners: winners
          });
      }
  }

  if (!req.session.user) return res.status(401).json({ error: 'Non connecté.' });

  const session = req.query.session || 'session1';
  const user = users.find(u => u.username === req.session.user.username);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  if (!sessionQuestions[session]) return res.status(404).json({ error: 'Session non trouvée.' });

  const sessionNumber = parseInt(session.replace('session', ''), 10);
  if (isNaN(sessionNumber)) return res.status(400).json({ error: 'Format de session invalide.' });

  // ==========================================================
  // ==         NOUVELLE LOGIQUE DE PAIEMENT DU TOURNOI      ==
  // ==========================================================
  const isTournamentSession = sessionNumber >= 4;
  
  // On applique la logique de paiement uniquement pour les sessions de compétition et si ce n'est pas le compte devtest
  if (isTournamentSession && user.username !== 'devtest') {
      const tournamentEntryFee = competitionRules.price !== undefined ? competitionRules.price : 1000; // Prix depuis les règles, avec un fallback

      // A-t-il déjà payé pour ce tournoi ?
      // On considère qu'il a payé s'il a déjà répondu à une question des sessions 4 à 10.
      const hasAlreadyPaidOrStarted = user.scores.some(s => parseInt(s.session.replace('session', ''), 10) >= 4);

      if (!hasAlreadyPaidOrStarted) {
          // C'est sa première tentative d'entrer dans le tournoi.
          const currentBalance = user.balance || 0;
          if (currentBalance < tournamentEntryFee) {
              console.log(`[PAIEMENT REFUSÉ] ${user.username} - Solde: ${currentBalance} Ar, Requis: ${tournamentEntryFee} Ar`);
              return res.status(402).json({ // 402 = Payment Required
                  error: `Solde insuffisant. L'entrée au tournoi coûte ${tournamentEntryFee} Ar. Votre solde actuel: ${currentBalance} Ar. Veuillez recharger votre portefeuille.`
              });
          } else {
              user.balance = currentBalance - tournamentEntryFee;
              saveUser(user);
              console.log(`[PAIEMENT ACCEPTÉ] ${user.username} a payé ${tournamentEntryFee} Ar pour le tournoi. Nouveau solde: ${user.balance} Ar.`);
          }
      }
  }
  // === FIN DE LA LOGIQUE DE PAIEMENT ===

  if (user.username !== 'devtest') {
      if (sessionNumber >= 4) {
          try {
              const competitionData = await readJsonCached('competition.json');
              const startTime = new Date(competitionData.startTime);
              if (Date.now() < startTime.getTime()) {
                  const formattedTime = startTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Antananarivo' });
                  return res.status(403).json({ error: `La compétition commence à ${formattedTime}. Accès non autorisé.` });
              }
          } catch (e) {
              return res.status(500).json({ error: 'Erreur de configuration de la compétition.' });
          }
      }

      const isSequentialSession = (sessionNumber > 1 && sessionNumber < 4) || sessionNumber > 4;
      if (isSequentialSession) {
          const requiredSession = `session${sessionNumber - 1}`;
          if (!user.completedSessions || !user.completedSessions.includes(requiredSession)) {
              return res.status(403).json({ error: `Accès non autorisé. Vous devez d'abord terminer la ${requiredSession}.` });
          }
      }
  }

  const allQuestionsForSession = sessionQuestions[session];
  const answeredQuestionIds = new Set(user.scores.filter(s => s.session === session).map(s => s.questionId));
  const nextQuestionToSend = allQuestionsForSession.find(q => !answeredQuestionIds.has(q.id));

  if (nextQuestionToSend) {
      const { correctAnswer, ...questionForClient } = nextQuestionToSend;
      const userKey = `${req.session.user.username}_${nextQuestionToSend.id}`;
      questionStartTimes.set(userKey, Date.now());
      return res.json(questionForClient);
  } else {
      return res.json(null);
  }
});

app.post('/submit', (req, res) => {
  if (!isRequestFromActiveLogin(req)) {
    return res.status(409).json({ error: 'Session invalide: un autre appareil est actif. Rechargez et reconnectez-vous.' });
  }
  // ... (le reste du code reste inchangé)
  const { questionId, answer, timeTaken, session: currentSession, isErrorReplay } = req.body;
  const user = users.find(u => u.username === req.session.user.username);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });
  
  // Calculer le temps réel côté serveur
  const userKey = `${req.session.user.username}_${questionId}`;
  const questionStartTime = questionStartTimes.get(userKey);
  let serverTimeTaken = timeTaken; // Fallback vers le temps client si pas de temps serveur
  
  if (questionStartTime) {
    const now = Date.now();
    serverTimeTaken = Math.round((now - questionStartTime) / 1000); // Temps en secondes
    questionStartTimes.delete(userKey); // Nettoyer après utilisation
    
    // Log pour débogage (optionnel)
    console.log(`[SECURITY] Question ${questionId} - Temps client: ${timeTaken}s, Temps serveur: ${serverTimeTaken}s`);
  } else {
    console.warn(`[SECURITY] Pas de temps de début trouvé pour ${userKey}, utilisation du temps client`);
  }

  // LOG DE DÉBOGAGE POUR VÉRIFIER LA RÉCEPTION DU FLAG
  console.log(`[SERVER DEBUG] ${user.username} - isErrorReplay reçu:`, isErrorReplay, typeof isErrorReplay);

  activeUsers.set(user.username, Date.now());

  let question = null;
  // On cherche la question dans toutes les sessions chargées en mémoire
  for (const sessionKey in sessionQuestions) {
    const found = sessionQuestions[sessionKey].find(q => q.id == questionId);
    if (found) { question = found; break; }
  }
  if (!question) return res.status(404).json({ error: 'Question non trouvée.' });

  const isCorrect = answer === question.correctAnswer;
  const sessionNumber = parseInt(currentSession.replace('session', ''), 10);
  
  // SI C'EST UNE CORRECTION D'ERREUR, ON NE SAUVEGARDE RIEN
  if (isErrorReplay === true) {
    console.log(`[SERVER] Mode correction d'erreurs pour ${user.username} - Q:${questionId} - Réponse: ${isCorrect ? 'Correcte' : 'Incorrecte'}`);
    
    // Si la réponse est correcte, enregistrer la correction
    if (isCorrect) {
      try {
        const insertCorrectionStmt = db.prepare(`
          INSERT OR IGNORE INTO error_corrections (username, questionId, session)
          VALUES (?, ?, ?)
        `);
        insertCorrectionStmt.run(user.username, questionId, currentSession);
        console.log(`[SERVER] Correction enregistrée pour ${user.username} - Q:${questionId} session:${currentSession}`);
      } catch (error) {
        console.error('[SERVER] Erreur lors de l\'enregistrement de la correction:', error);
      }
    }
    
    // On renvoie seulement le résultat sans affecter les données utilisateur
    return res.json({
      isCorrect,
      correctAnswer: question.correctAnswer,
      explanation: isCorrect ? null : (question.explanation || null),
      // Retourner des valeurs par défaut pour éviter les erreurs côté client
      xp: user.xp || 0,
      newLevel: user.level || 1,
      newAchievements: [],
      streakCount: user.streakCount || 0,
      coins: user.coins || 0,
      competitionCoins: user.competitionCoins || 0,
      coinsGained: 0,
      score: user.currentScore || 0
    });
  }
  
  // LOGIQUE NORMALE POUR LES SESSIONS OFFICIELLES
  const baseScore = isCorrect ? 200 : 0;
  // ====================================================================
  // ===                 CORRECTION DE LA FAILLE DE SÉCURITÉ            ===
  // ====================================================================
  // On utilise la variable `serverTimeTaken` (calculée par le serveur)
  // au lieu de `timeTaken` (envoyée par le client et falsifiable).
  const timePenalty = Math.min(serverTimeTaken, MAX_TIME_BONUS_SECONDS);
  const score = isCorrect ? baseScore - timePenalty : 0;

  const hasBeenRewarded = user.rewardedQuestionIds.includes(questionId);
  let xpGained = 0;
  let coinsGained = 0; 
  let newAchievements = [];

  if (isCorrect && !hasBeenRewarded) {
    console.log(`[SERVER] Première récompense pour ${user.username} sur Q:${questionId}.`);
    xpGained = XP_BASE_CORRECT + Math.max(0, (MAX_TIME_BONUS_SECONDS - serverTimeTaken) * XP_TIME_BONUS_FACTOR);
    user.xp = (user.xp || 0) + xpGained;
    user.level = calculateLevel(user.xp);
    
    coinsGained = 5;
    
    if (sessionNumber <= 3) {
      user.coins = (user.coins || 0) + coinsGained;
    } else {
      user.competitionCoins = (user.competitionCoins || 0) + coinsGained;
    }
    user.rewardedQuestionIds.push(questionId);
  }

  // Ne pas ajouter de scores du tout en mode correction d'erreurs
  if (isErrorReplay !== true) {
    user.scores.push({ questionId, score, timeTaken: serverTimeTaken, session: currentSession, coinsGained: coinsGained });
    
    const scoresForCurrentSession = user.scores.filter(s => s.session === currentSession);
    user.currentScore = scoresForCurrentSession.reduce((total, s) => total + s.score, 0);
    user.lastScoreUpdate = new Date().toISOString();
  }

  // Ne pas modifier les achievements et streaks en mode correction d'erreurs
  if (isErrorReplay !== true) {
    if(isCorrect) {
      user.consecutiveCorrectAnswers = (user.consecutiveCorrectAnswers || 0) + 1;
      if (user.scores.filter(s => s.score > 0).length === 1 && awardAchievement(user, achievements.FIRST_WIN.id)) {
          newAchievements.push(achievements.FIRST_WIN.name);
      }
      if (user.consecutiveCorrectAnswers >= 10 && awardAchievement(user, achievements.TEN_CONSECUTIVE_CORRECT.id)) {
          newAchievements.push(achievements.TEN_CONSECUTIVE_CORRECT.name);
      }
    } else {
      user.consecutiveCorrectAnswers = 0;
    }
  }

  saveUser(user);

  // On envoie le JSON de réponse au client
  res.json({
    isCorrect,
    score: user.currentScore,
    correctAnswer: question.correctAnswer,
    // C'est l'ajout crucial. 
    // Si la réponse est incorrecte, on envoie l'explication de la question.
    // (question.explanation || null) est une sécurité : si une vieille question n'a pas ce champ, on envoie 'null'.
    explanation: isCorrect ? null : (question.explanation || null),
    xp: user.xp,
    newLevel: user.level,
    newAchievements,
    streakCount: user.streakCount,
    coins: user.coins,
    competitionCoins: user.competitionCoins,
    coinsGained: coinsGained
  });
});

app.post('/end-quiz-session', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Non connecté.' });
    }
    const { session } = req.body; // On ne récupère que la session, le reste sera calculé ici.
    const user = users.find(u => u.username === req.session.user.username);
    if (!user) {
        return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }

    // ========== AMÉLIORATION DE FIABILITÉ ET SÉCURITÉ ==========
    // 1. Le serveur récupère le nombre total de questions depuis sa propre source, pas depuis le client.
    const totalQuestionsInSession = (sessionQuestions[session] || []).length;
    
    // 2. Le serveur calcule le nombre de bonnes réponses en se basant sur les scores enregistrés, pas sur ce que le client envoie.
    const sessionScores = user.scores.filter(s => s.session === session);
    const correctAnswers = sessionScores.filter(s => s.score > 0).length;

    const finalScoreForSession = sessionScores.reduce((total, score) => total + score.score, 0);
    user.currentScore = finalScoreForSession;

    // 3. Le calcul du pourcentage est maintenant basé sur des données 100% fiables (côté serveur).
    const successPercentage = totalQuestionsInSession > 0 ? (correctAnswers / totalQuestionsInSession) * 100 : 0;
    const SUCCESS_THRESHOLD = 70;

    let sessionCompleted = false;
    // On vérifie aussi si la session n'était pas déjà complétée
    if (user.completedSessions.includes(session)) {
        sessionCompleted = true; 
    } else if (successPercentage >= SUCCESS_THRESHOLD) {
        // On ne l'ajoute que si le seuil est atteint ET qu'elle n'y était pas déjà
        user.completedSessions.push(session);
        sessionCompleted = true;
    }

    // --- LOGIQUE DE FIN DE COMPÉTITION (inchangée) ---
    if (session === 'session10' && sessionCompleted && !competitionRules.competitionEnded) {
        const isAlreadyWinner = winners.some(winner => winner.username === user.username);

        if (!isAlreadyWinner) {
            console.log(`[COMPETITION] ${user.username} a terminé la session 10 !`);
            winners.push({
                username: user.username,
                score: finalScoreForSession,
                rank: winners.length + 1,
                avatarUrl: user.avatarUrl || null,
                paymentPhone: user.paymentPhone || 'Non renseigné' // On ajoute le numéro ici
            });
            await saveWinners();

            if (winners.length >= competitionRules.maxWinners) {
                console.log(`[COMPETITION] Le nombre maximum de gagnants (${competitionRules.maxWinners}) est atteint. FIN DU JEU !`);
                competitionRules.competitionEnded = true;
                competitionRules.competitionEndTime = new Date().toISOString();
                await saveCompetitionRules();

                userStatusClients.forEach(clientSet => {
                    clientSet.forEach(clientRes => {
                        try {
                            clientRes.write('event: competition-over\n');
                            clientRes.write('data: La compétition est terminée !\n\n');
                        } catch (e) {
                            // Ignorer
                        }
                    });
                });
            }
        }
    }
    
    saveUser(user);
    res.json({
        success: true,
        completed: sessionCompleted,
        completedSessions: user.completedSessions
    });
});

app.get('/api/session-results', (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: 'Non connecté' });
  }
  const { session } = req.query;
  if (!session) {
      return res.status(400).json({ error: 'Session non spécifiée' });
  }

  const user = users.find(u => u.username === req.session.user.username);
  if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
  }

  const sessionScores = user.scores.filter(s => s.session === session);
  const correctAnswers = sessionScores.filter(s => s.score > 0).length;
  const totalQuestions = sessionScores.length;
  const isCompleted = user.completedSessions.includes(session);

  res.json({ correctAnswers, totalQuestions, isCompleted });
});
// AJOUTEZ CETTE NOUVELLE ROUTE (par exemple, après la route /api/session-results)
app.get('/api/session-info', (req, res) => {
  const { session } = req.query;
  if (!session || !sessionQuestions[session]) {
      return res.status(404).json({ error: 'Session non trouvée.' });
  }

  // On renvoie simplement le nombre total de questions contenues
  // dans le fichier JSON de la session demandée.
  res.json({
      totalQuestionsInSession: sessionQuestions[session].length
  });
});

app.get('/api/course', async (req, res) => {
  try {
    const data = await readJsonCached('course.json');
    // On s'assure que la date est bien présente, sinon on en met une par défaut
    if (!data.generatedAt) {
      data.generatedAt = new Date().toISOString();
    }
    res.json(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Aucun cours disponible. Réinitialisez les joueurs depuis le panneau admin pour en générer un.' });
    }
    console.error('[SERVER] Erreur lecture course.json:', error);
    res.status(500).json({ error: 'Impossible de charger le contenu du cours.' });
  }
});
// AJOUTEZ CETTE NOUVELLE ROUTE (par exemple, après la route /api/course)

app.get('/api/course-history', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  try {
    const data = await readJsonCached('course_history.json');
    res.json(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.json([]);
    }
    console.error('[SERVER] Erreur lecture course_history.json:', error);
    res.status(500).json({ error: 'Impossible de charger l\'historique des cours.' });
  }
});

// --- Global leaderboard broadcaster (mutualisé) ---
const leaderboardClients = new Map(); // session -> Set(res)
function computeLeaderboardForSession(session) {
  const leaderboard = users
    .map(user => {
      // Pour chaque utilisateur, on calcule son score et on vérifie s'il est actif DANS CETTE SESSION PRÉCISE.
      const totalSessionScore = user.scores
        .filter(s => s.session === session)
        .reduce((total, score) => total + score.score, 0);
      
      const isActiveInThisSession = activeUsers.has(user.username) && user.activeSession === session;

      return {
        username: user.username,
        score: totalSessionScore,
        isActive: isActiveInThisSession, // On ajoute la nouvelle information ici
        avatarType: user.avatarType || null,
        avatarUrl: user.avatarUrl || null,
        avatarKey: user.avatarKey || null
      };
    })
    // Ensuite, on ne garde que les joueurs qui sont soit actifs, soit qui ont un score dans cette session.
    .filter(entry => entry.isActive || entry.score > 0 || entry.username === "devtest") // On s'assure de toujours inclure devtest si besoin
    .sort((a, b) => b.score - a.score);
  
  return leaderboard;
}

setInterval(() => {
  // Diffuse à tous les clients inscrits, sessions par sessions
  leaderboardClients.forEach((clients, session) => {
    const data = JSON.stringify({ leaderboard: computeLeaderboardForSession(session) });
    clients.forEach(res => {
      try { res.write(`data: ${data}\n\n`); } catch (_) {}
    });
  });
}, 3000);
app.get('/leaderboard-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const session = req.query.session || 'session1';
  const currentUser = req.session.user;

  // ==========================================================
  // ===           LA CORRECTION DÉFINITIVE EST ICI         ===
  // ==========================================================
  // On met à jour le statut de l'utilisateur dès qu'il se connecte au flux,
  // ce qui garantit que son état est correct AVANT le premier calcul du classement.
  if (currentUser) {
    const user = users.find(u => u.username === currentUser.username);
    if (user && user.activeSession !== session) {
      console.log(`[Leaderboard Stream] Mise à jour forcée de la session pour ${user.username} vers ${session}.`);
      user.activeSession = session;
      activeUsers.set(user.username, Date.now()); // On s'assure qu'il est bien marqué comme actif
      saveUser(user);
      broadcastSessionStatus(); // On notifie tout le monde
    }
  }
  // === FIN DE LA CORRECTION DÉFINITIVE ===

  if (!leaderboardClients.has(session)) leaderboardClients.set(session, new Set());
  leaderboardClients.get(session).add(res);

  // L'affichage optimiste reste utile pour la réactivité immédiate côté client.
  let initialLeaderboard = computeLeaderboardForSession(session);

  // On vérifie si l'utilisateur qui a fait la requête est déjà dans la liste.
  if (currentUser) {
    const userInList = initialLeaderboard.find(u => u.username === currentUser.username);
    
    // S'il n'est pas dans la liste (à cause du délai de mise à jour du statut)...
    if (!userInList) {
      console.log(`[Leaderboard] Affichage optimiste : Ajout de ${currentUser.username} au classement initial de la session ${session}.`);
      
      const userObject = users.find(u => u.username === currentUser.username);
      if (userObject) {
          const scoreForSession = (userObject.scores || [])
              .filter(s => s.session === session)
              .reduce((total, s) => total + s.score, 0);
          
          initialLeaderboard.push({
              username: userObject.username,
              score: scoreForSession,
              isActive: true, // On le considère actif par défaut dans l'affichage optimiste
              avatarType: userObject.avatarType || null,
              avatarUrl: userObject.avatarUrl || null,
              avatarKey: userObject.avatarKey || null
          });
          
          initialLeaderboard.sort((a, b) => b.score - a.score);
      }
    }
  }

  // Envoi initial immédiat avec la liste potentiellement corrigée
  const initialData = JSON.stringify({ leaderboard: initialLeaderboard });
  res.write(`data: ${initialData}\n\n`);

  req.on('close', () => {
    const set = leaderboardClients.get(session);
    if (set) {
      set.delete(res);
      if (set.size === 0) leaderboardClients.delete(session);
    }
    res.end();
  });
});
app.get('/api/profile', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non connecté.' });
  const user = users.find(u => u.username === req.session.user.username);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({
    username: user.username,
    avatarType: user.avatarType || null,
    avatarUrl: user.avatarUrl || null,
    avatarKey: user.avatarKey || null
  });
});

// Liste des avatars système
app.get('/api/avatars', async (req, res) => {
  try {
    const manifestPath = path.join(__dirname, 'public', 'avatars', 'list.json');
    const content = await fsp.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(content);
    res.json(parsed);
  } catch (e) {
    res.json({ avatars: [] });
  }
});

// Sélectionner un avatar système
app.post('/api/profile/avatar/select', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non connecté.' });
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'Clé d\'avatar requise.' });
  try {
    const manifestPath = path.join(__dirname, 'public', 'avatars', 'list.json');
    const content = await fsp.readFile(manifestPath, 'utf8');
    const { avatars } = JSON.parse(content);
    const item = (avatars || []).find(a => a.key === key);
    if (!item) return res.status(404).json({ error: 'Avatar non trouvé.' });
    const user = users.find(u => u.username === req.session.user.username);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    user.avatarType = 'system';
    user.avatarKey = key;
    user.avatarUrl = item.url;
    saveUser(user);
    res.json({ success: true, avatarType: user.avatarType, avatarKey: user.avatarKey, avatarUrl: user.avatarUrl });
  } catch (e) {
    res.status(500).json({ error: 'Impossible de sélectionner l\'avatar.' });
  }
});

// Upload d'un avatar personnalisé (désactivé)
app.post('/api/profile/avatar/upload', (req, res) => {
  return res.status(405).json({ error: 'Téléversement désactivé. Veuillez choisir un avatar système.' });
});

// Réinitialiser l'avatar
app.post('/api/profile/avatar/reset', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non connecté.' });
  const user = users.find(u => u.username === req.session.user.username);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  user.avatarType = null;
  user.avatarUrl = null;
  user.avatarKey = null;
  saveUser(user);
  res.json({ success: true });
});

app.post('/chat/send', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Non connecté.' });
    const { session, message } = req.body;
    if (!session || !message) return res.status(400).json({ error: 'Session et message requis.' });
    activeUsers.set(req.session.user.username, Date.now());
    const chat = sessionChats.get(session) || [];
    const messageId = chat.length > 0 ? chat[chat.length - 1].id + 1 : 1;
    
    chat.push({ id: messageId, username: req.session.user.username, message: message, timestamp: new Date().toISOString() });

    const sessionUsers = users.filter(u => activeUsers.has(u.username) && u.activeSession === session);

    if (sessionUsers.length <= 1) {
        try {
            let geminiResponse;
            const referencedQuestion = findQuestionByText(message);

            if (referencedQuestion) {
                 console.log(`[SERVER] Question pertinente trouvée pour le chat : ${referencedQuestion.text}`);
                 const context = {
                     userQuery: message,
                     quizQuestion: referencedQuestion.text,
                     quizOptions: referencedQuestion.options,
                     quizCorrectAnswer: referencedQuestion.correctAnswer
                 };
                 geminiResponse = await generateChatResponse(null, [], context);
            } else {
                const chatHistory = chat.map(m => ({ username: m.username, message: m.message }));
                geminiResponse = await generateChatResponse(message, chatHistory, null);
            }

            const geminiMessageId = chat.length > 0 ? chat[chat.length - 1].id + 1 : 1;
            chat.push({ id: geminiMessageId, username: 'Gemini', message: geminiResponse, timestamp: new Date().toISOString() });
        } catch (error) {
            console.error('Erreur lors de la génération de la réponse Gemini :', error);
        }
    }

    if (chat.length > 100) chat.shift();
    sessionChats.set(session, chat);

    res.json({ success: true, messageId: messageId });
});

app.post('/chat/typing', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non connecté.' });
  const { session, isTyping } = req.body;
  const { username } = req.session.user;
  if (!typingUsers.has(session)) typingUsers.set(session, new Map());
  const sessionTypingUsers = typingUsers.get(session);
  // Stocke un horodatage de la dernière frappe, et un timeout de secours
  const existing = sessionTypingUsers.get(username);
  if (existing && existing.timeoutId) clearTimeout(existing.timeoutId);
  if (isTyping) {
    const entry = {
      lastAt: Date.now(),
      timeoutId: setTimeout(() => sessionTypingUsers.delete(username), 3500) // filet de sécurité
    };
    sessionTypingUsers.set(username, entry);
  } else {
    sessionTypingUsers.delete(username);
  }
  res.json({ success: true });
});

app.get('/chat/stream', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non connecté.' });
  const session = req.query.session;
  if (!session) return res.status(400).json({ error: 'Session requise.' });
  const currentUsername = req.session.user.username;
  // Throttle SSE: empêche une reconnexion < 2s
  try {
    const key = `chat|${currentUsername}`;
    const now = Date.now();
    const last = sseThrottle.get(key) || 0;
    if (now - last < 2000) {
      res.statusCode = 429;
      return res.end('Too Many Requests');
    }
    sseThrottle.set(key, now);
  } catch (_) {}
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // Backoff de reconnexion client pour limiter les tempêtes de reconnexion
  res.write('retry: 5000\n');
  // Indique immédiatement au client que le flux est prêt
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  if (sessionChats.has(session)) {
    res.write(`data: ${JSON.stringify({ type: 'init', messages: sessionChats.get(session) })}\n\n`);
  }
  const sentMessageIds = new Set();
  if (sessionChats.has(session)) sessionChats.get(session).forEach(msg => sentMessageIds.add(msg.id));
  let lastTypingUsers = '';
  const interval = setInterval(() => {
    if (sessionChats.has(session)) {
      const chat = sessionChats.get(session);
      const newMessages = chat.filter(msg => !sentMessageIds.has(msg.id));
      if (newMessages.length > 0) {
        newMessages.forEach(msg => sentMessageIds.add(msg.id));
        res.write(`data: ${JSON.stringify({ type: 'update', messages: newMessages })}\n\n`);
      }
    }
    // Épuration proactive des entrées "en train d'écrire" trop anciennes
    let typingUsernames = [];
    if (typingUsers.has(session)) {
      const sessionMap = typingUsers.get(session);
      const now = Date.now();
      for (const [u, info] of sessionMap.entries()) {
        if (!info || !info.lastAt || (now - info.lastAt) > 3000) {
          sessionMap.delete(u);
        }
      }
      typingUsernames = Array.from(sessionMap.keys());
    }
    const typingUsersString = JSON.stringify(typingUsernames);
    if (typingUsersString !== lastTypingUsers) {
      res.write(`data: ${JSON.stringify({ type: 'typing', users: typingUsernames })}\n\n`);
      lastTypingUsers = typingUsersString;
    }
  }, 2500);
  req.on('close', () => {
    clearInterval(interval);
    if (typingUsers.has(session)) typingUsers.get(session).delete(currentUsername);
    res.end();
  });
});

app.post('/api/purchase-hint', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Non connecté.' });
  }

  const { questionText, session } = req.body;
  if (!questionText || !session) {
    return res.status(400).json({ error: 'Le texte de la question et la session sont requis.' });
  }

  const user = users.find(u => u.username === req.session.user.username);
  if (!user) {
    return res.status(404).json({ error: 'Utilisateur non trouvé.' });
  }

  const HINT_COST = 25;
  const sessionNumber = parseInt(session.replace('session', ''), 10);

  let currentBalance = 0;
  if (sessionNumber <= 3) {
      currentBalance = user.coins || 0;
  } else {
      currentBalance = user.competitionCoins || 0;
  }

  if (currentBalance < HINT_COST) {
    return res.status(402).json({ error: 'Pas assez de pièces pour acheter cet indice !' });
  }

  try {
    const hint = await generateHint(questionText);
    if (sessionNumber <= 3) {
        user.coins -= HINT_COST;
    } else {
        user.competitionCoins -= HINT_COST;
    }
    saveUser(user);
    res.json({ 
      hint: hint, 
      newBalance: {
        training: user.coins,
        competition: user.competitionCoins
      }
    });

  } catch (error) {
    console.error('[SERVER] Erreur API Gemini (purchase-hint):', error);
    res.status(500).json({ error: 'Désolé, l\'IA n\'a pas pu générer d\'indice pour le moment.' });
  }
});

app.post('/api/analyze', async (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ error: 'Non connecté.' });
  }
  const user = users.find(u => u.username === req.session.user.username);
  const { session: sessionToAnalyze } = req.body;
  activeUsers.set(user.username, Date.now());

  if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé.' });
  }
  if (!sessionToAnalyze) {
      return res.status(400).json({ error: 'L\'identifiant de la session est requis.' });
  }

  const sessionScores = user.scores.filter(s => s.session === sessionToAnalyze);
  
  if (sessionScores.length === 0) {
      return res.status(400).json({ error: 'Aucun score trouvé pour cette session. Impossible de générer une analyse.' });
  }
  
  const totalQuestions = sessionScores.length;
  const correctAnswers = sessionScores.filter(s => s.score > 0).length;
  const totalTime = sessionScores.reduce((acc, s) => acc + s.timeTaken, 0);
  const avgTime = totalQuestions > 0 ? (totalTime / totalQuestions).toFixed(2) : 0;
  
  const weakAreas = [];

  const resultsDataForGemini = {
      score: user.currentScore,
      correctAnswers: correctAnswers,
      totalQuestions: totalQuestions,
      avgTime: parseFloat(avgTime),
      weakAreas: weakAreas
  };
  
  try {
      const analysis = await generateAnalysis(resultsDataForGemini);
      if (typeof analysis !== 'string' || analysis.trim() === '') {
          throw new Error("La réponse de l'IA est dans un format inattendu ou vide.");
      }
      res.json({ analysis });
  } catch (error) {
      console.error('[SERVER] Erreur critique dans la route /api/analyze :', error.message);
      res.status(500).json({ error: `Erreur finale lors de la génération de l'analyse. Cause : ${error.message}` });
  }
});
// AJOUTEZ CETTE NOUVELLE ROUTE À LA FIN DE LA SECTION DES ROUTES API (par exemple avant la section "Routes d'administration")
// Maps pour suivre les intervalles keep-alive afin d'éviter les fuites
const userStatusKeepAlive = new Map();
const userNotificationKeepAlive = new Map();

app.get('/api/user-status-stream', (req, res) => {
  // Si l'utilisateur n'est pas connecté, il ne peut pas avoir de flux de statut.
  if (!req.session.user || !req.session.user.username) {
      return res.status(401).json({ error: 'Non authentifié' });
  }

  // Configuration standard pour une connexion SSE (Server-Sent Events)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders(); // Envoie les en-têtes immédiatement
  // Throttle SSE: empêche une reconnexion < 2s
  try {
    const key = `status|${req.session.user.username}`;
    const now = Date.now();
    const last = sseThrottle.get(key) || 0;
    if (now - last < 2000) {
      res.statusCode = 429;
      return res.end('Too Many Requests');
    }
    sseThrottle.set(key, now);
  } catch (_) {}
  // Indique au client SSE d'attendre 5s avant de retenter après une coupure
  res.write('retry: 5000\n');
  // Indique immédiatement au client que le flux est prêt
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  const username = req.session.user.username;
  const activeId = userSessionIds.get(username);

  // Si cet onglet/navigateur ne correspond pas à la session active, le déconnecter immédiatement
  if (activeId && req.sessionID !== activeId) {
    try { res.write(`data: ${JSON.stringify({ type: 'force_logout', reason: 'Votre session est active sur un autre appareil.' })}\n\n`); } catch (_) {}
    try { res.end(); } catch (_) {}
    return; // Ne pas enregistrer ce flux comme client actif
  }

  // Enregistrer cette connexion dans l'ensemble des connexions de l'utilisateur
  let set = userStatusClients.get(username);
  if (!set) { set = new Set(); userStatusClients.set(username, set); }
  set.add(res);
  console.log(`[SERVER] Flux de statut utilisateur ouvert pour ${username}. Connexions actives pour cet utilisateur: ${set.size}`);

  // Envoi d'un message de confirmation pour indiquer que la connexion est bien établie
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Garde la connexion active en envoyant un commentaire toutes les 25 secondes
  const keepAliveInterval = setInterval(() => {
      res.write(': keep-alive\n\n');
  }, 25000);

  // Quand l'utilisateur ferme la page (déconnexion, etc.), on nettoie proprement.
  req.on('close', () => {
      clearInterval(keepAliveInterval);
      // Retirer cette connexion du Set
      try {
        const s = userStatusClients.get(username);
        if (s) {
          s.delete(res);
          if (s.size === 0) userStatusClients.delete(username);
        }
      } catch (_) {}
      console.log(`[SERVER] Flux de statut utilisateur fermé pour ${username}. Connexions restantes pour cet utilisateur: ${(userStatusClients.get(username) || new Set()).size}`);
      res.end();
  });
});

// Route pour que les utilisateurs puissent voir la liste des livres (protégée)
app.get('/api/books', (req, res) => {
  // On vérifie que l'utilisateur est bien connecté
  if (!req.session.user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  // On renvoie la liste des livres
  res.json(books);
});

// Route publique pour que les joueurs puissent voir la liste finale des gagnants
app.get('/api/winners', (req, res) => {
    // On ne renvoie les gagnants que si la compétition est officiellement terminée
    if (competitionRules.competitionEnded) {
        res.json(winners);
    } else {
        res.status(403).json({ error: "La compétition n'est pas encore terminée." });
    }
});

// --- Mes erreurs : retourne les questions mal répondues par l'utilisateur ---
app.get('/api/user-errors', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Non connecté.' });
  const user = users.find(u => u.username === req.session.user.username);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé.' });

  try {
    // Récupérer les questions déjà corrigées depuis la base de données
    const correctedQuestionsStmt = db.prepare(`
      SELECT questionId, session FROM error_corrections 
      WHERE username = ?
    `);
    const correctedQuestions = correctedQuestionsStmt.all(user.username);
    const correctedSet = new Set(correctedQuestions.map(c => `${c.questionId}-${c.session}`));

    // Trouver toutes les réponses incorrectes qui n'ont pas encore été corrigées
    const incorrectScores = user.scores.filter(s => {
      const isIncorrect = s.score === 0 && s.questionId && s.session;
      const correctionKey = `${s.questionId}-${s.session}`;
      const notYetCorrected = !correctedSet.has(correctionKey);
      return isIncorrect && notYetCorrected;
    });

    // Pour chaque score incorrect non corrigé, récupérer l'objet question complet
    const errorQuestions = incorrectScores.map(s => {
      const sessionQ = sessionQuestions[s.session] || [];
      const q = sessionQ.find(q => q.id === s.questionId);
      if (q) {
        return { ...q, session: s.session, userAnswer: s.answer, timeTaken: s.timeTaken };
      }
      return null;
    }).filter(Boolean);

    console.log(`[SERVER] Erreurs non corrigées pour ${user.username}: ${errorQuestions.length}`);
    res.json(errorQuestions);
  } catch (error) {
    console.error('[SERVER] Erreur lors de la récupération des erreurs:', error);
    // Fallback vers l'ancienne logique en cas d'erreur DB
    const incorrectScores = user.scores.filter(s => s.score === 0 && s.questionId && s.session);
    const errorQuestions = incorrectScores.map(s => {
      const sessionQ = sessionQuestions[s.session] || [];
      const q = sessionQ.find(q => q.id === s.questionId);
      if (q) {
        return { ...q, session: s.session, userAnswer: s.answer, timeTaken: s.timeTaken };
      }
      return null;
    }).filter(Boolean);
    res.json(errorQuestions);
  }
});

// NOUVELLE ROUTE PUBLIQUE POUR OBTENIR LES INFORMATIONS DE PAIEMENT
app.get('/api/payment-info', async (req, res) => {
    try {
        const config = await readJsonCached('admin_config.json');
        res.json({ paymentNumber: config.paymentNumber });
    } catch (error) {
        console.error('[SERVER] Erreur lors de la lecture de admin_config.json:', error);
        res.status(500).json({ error: 'Impossible de récupérer les informations de paiement.' });
    }
});

// === NOUVELLES ROUTES POUR LE PORTEFEUILLE (DÉPÔTS) ===

// Route pour qu'un utilisateur soumette une demande de dépôt
app.post('/api/deposit/request', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Non connecté.' });
    }

    const { amount, transactionRef } = req.body;
    const username = req.session.user.username;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || !transactionRef || transactionRef.trim() === '') {
        return res.status(400).json({ error: 'Le montant et la référence de transaction sont invalides.' });
    }

    try {
        // CORRECTION : Nous générons nous-mêmes la date avec le bon fuseau horaire
        const requestedAt = moment().tz('Indian/Antananarivo').format(); // Format ISO 8601
        
        const stmt = db.prepare('INSERT INTO deposits (username, amount, transaction_ref, requested_at) VALUES (?, ?, ?, ?)');
        stmt.run(username, parsedAmount, transactionRef.trim(), requestedAt);
        
        res.json({ success: true, message: 'Votre demande de dépôt a été envoyée et est en attente de validation.' });
    } catch (error) {
        console.error('[DEPOSIT] Erreur lors de la création de la demande:', error);
        res.status(500).json({ error: 'Erreur du serveur lors de la soumission de votre demande.' });
    }
});

// Route pour que l'utilisateur voie son historique de dépôts
app.get('/api/deposit/history', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Non connecté.' });
    }
    const username = req.session.user.username;
    try {
        const stmt = db.prepare("SELECT id, amount, transaction_ref, status, requested_at FROM deposits WHERE username = ? ORDER BY requested_at DESC");
        const history = stmt.all(username);
        res.json(history);
    } catch (error) {
        console.error('[DEPOSIT] Erreur lors de la récupération de l\'historique:', error);
        res.status(500).json({ error: 'Impossible de charger l\'historique des transactions.' });
    }
});

// --- Middleware d'administration ---
const protectAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    if (token === ADMIN_TOKEN) return next();
    return res.status(403).json({ error: 'Accès interdit' });
};

// Routes d'administration pour les dépôts
app.get('/admin/deposits/pending', protectAdmin, (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT d.id, d.username, d.amount, d.transaction_ref, d.requested_at, u.paymentPhone 
            FROM deposits d 
            LEFT JOIN users u ON d.username = u.username 
            WHERE d.status = 'pending' 
            ORDER BY d.requested_at ASC
        `);
        const pendingDeposits = stmt.all();
        res.json(pendingDeposits);
    } catch (error) {
        console.error('[ADMIN] Erreur lors de la récupération des dépôts en attente:', error);
        res.status(500).json({ error: 'Impossible de charger les dépôts en attente.' });
    }
});

app.post('/admin/deposits/:id/approve', protectAdmin, (req, res) => {
    const depositId = parseInt(req.params.id);
    
    if (!depositId || isNaN(depositId)) {
        return res.status(400).json({ error: 'ID de dépôt invalide.' });
    }
    
    try {
        let updateResult;

        // Commencer une transaction pour garantir l'intégrité des données
        const transaction = db.transaction(() => {
            const deposit = db.prepare("SELECT * FROM deposits WHERE id = ? AND status = 'pending'").get(depositId);
            if (!deposit) {
                throw new Error('Demande non trouvée ou déjà traitée.');
            }

            const user = db.prepare("SELECT balance FROM users WHERE username = ?").get(deposit.username);
            if (!user) {
                throw new Error(`Utilisateur '${deposit.username}' non trouvé pour le dépôt.`);
            }

            const newBalance = (user.balance || 0) + deposit.amount;

            // Mettre à jour la base de données
            db.prepare("UPDATE users SET balance = ? WHERE username = ?").run(newBalance, deposit.username);
            
            // CORRECTION : Nous générons la date de traitement avec le bon fuseau horaire
            const processedAt = moment().tz('Indian/Antananarivo').format();
            db.prepare("UPDATE deposits SET status = 'approved', processed_at = ? WHERE id = ?").run(processedAt, depositId);
            
            // On stocke le résultat pour l'utiliser après la transaction
            updateResult = { 
                username: deposit.username, 
                amount: deposit.amount, 
                newBalance: newBalance 
            };
        });
        
        // Exécuter la transaction
        transaction();

        // ==========================================================
        // ==                 CORRECTION APPLIQUÉE ICI             ==
        // ==========================================================
        // 1. Mettre à jour le tableau 'users' en mémoire pour que les
        //    prochaines requêtes de l'utilisateur aient la bonne information.
        if (updateResult) {
            const userInMemory = users.find(u => u.username === updateResult.username);
            if (userInMemory) {
                userInMemory.balance = updateResult.newBalance;
                console.log(`[ADMIN] Solde en mémoire mis à jour pour ${updateResult.username}: ${updateResult.newBalance} Ar`);
            }

            // 2. Notifier l'utilisateur en temps réel via SSE
            if (userNotificationClients.has(updateResult.username)) {
                const clientRes = userNotificationClients.get(updateResult.username);
                try {
                    clientRes.write('event: balance-update\n');
                    clientRes.write(`data: ${JSON.stringify({ newBalance: updateResult.newBalance, amount: updateResult.amount })}\n\n`);
                    console.log(`[NOTIF] Notification de solde envoyée à ${updateResult.username}.`);
                } catch (e) {
                    console.warn(`[NOTIF] Impossible d'envoyer la notification de solde à ${updateResult.username}.`);
                }
            }
        }
        
        res.json({ 
            success: true, 
            message: `Dépôt de ${updateResult.amount} Ar approuvé pour ${updateResult.username}.`
        });
        
    } catch (error) {
        console.error('[ADMIN] Erreur lors de l\'approbation du dépôt:', error);
        res.status(400).json({ error: error.message });
    }
});

app.post('/admin/deposits/:id/reject', protectAdmin, (req, res) => {
    const depositId = parseInt(req.params.id);
    const { reason } = req.body;
    
    if (!depositId || isNaN(depositId)) {
        return res.status(400).json({ error: 'ID de dépôt invalide.' });
    }
    
    try {
        // Vérifier que le dépôt existe et est en attente
        const getDepositStmt = db.prepare('SELECT username, amount, status FROM deposits WHERE id = ?');
        const deposit = getDepositStmt.get(depositId);
        
        if (!deposit) {
            return res.status(404).json({ error: 'Dépôt non trouvé.' });
        }
        
        if (deposit.status !== 'pending') {
            return res.status(400).json({ error: 'Ce dépôt a déjà été traité.' });
        }
        
        // Marquer le dépôt comme rejeté
        const updateStmt = db.prepare('UPDATE deposits SET status = ?, processed_at = ?, rejection_reason = ? WHERE id = ?');
        updateStmt.run('rejected', new Date().toISOString(), reason || 'Aucune raison spécifiée', depositId);
        
        console.log(`[ADMIN] Dépôt rejeté: ${deposit.amount} Ar pour ${deposit.username}. Raison: ${reason || 'Aucune raison'}`);
        res.json({ 
            success: true, 
            message: `Dépôt de ${deposit.amount} Ar rejeté pour ${deposit.username}.` 
        });
        
    } catch (error) {
        console.error('[ADMIN] Erreur lors du rejet du dépôt:', error);
        res.status(500).json({ error: 'Erreur lors du rejet du dépôt.' });
    }
});

// --- Routes d'administration ---

// NOUVEAU : Route pour que l'admin puisse éditer et sauvegarder le cours actuel
app.post('/admin/course', protectAdmin, async (req, res) => {
  const { theme, content } = req.body;

  // Validation simple des données reçues
  if (!theme || typeof theme !== 'string' || !content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Le thème et le contenu sont requis.' });
  }

  try {
    // On lit le fichier actuel pour conserver la date de génération
    let currentCourse = {};
    try {
      const currentData = await fsp.readFile('course.json', 'utf8');
      currentCourse = JSON.parse(currentData);
    } catch (e) {
      // Si le fichier n'existe pas, ce n'est pas grave, la date sera celle de maintenant
      console.log('[Admin Course Edit] course.json non trouvé, un nouveau sera créé.');
    }

    const newCourseData = {
      theme: theme.trim(),
      content: content,
      generatedAt: currentCourse.generatedAt || new Date().toISOString() // On garde l'ancienne date ou on en crée une nouvelle
    };

    // On écrit les nouvelles données dans le fichier
    await fsp.writeFile('course.json', JSON.stringify(newCourseData, null, 2), 'utf8');
    
    // TRÈS IMPORTANT : On met à jour le cache pour que les utilisateurs voient immédiatement la version corrigée
    updateJsonCache('course.json', newCourseData);

    console.log(`[ADMIN] Le cours sur le thème "${theme}" a été modifié et sauvegardé.`);
    res.json({ success: true, message: 'Le cours a été mis à jour avec succès !' });

  } catch (error) {
    console.error('[ADMIN] Erreur lors de la sauvegarde du cours modifié :', error);
    res.status(500).json({ error: 'Une erreur interne est survenue lors de la sauvegarde du cours.' });
  }
});

app.post('/api/keep-alive', (req, res) => {
  if (req.session.user && req.session.user.username) {
    const username = req.session.user.username;
    if (users.find(u => u.username === username)) {
      activeUsers.set(username, Date.now());
      return res.json({ success: true, message: 'User activity updated.' });
    }
  }
  res.status(401).json({ error: 'Not authenticated' });
});
app.get('/api/user-notifications', (req, res) => {
  // S'assure que l'utilisateur est bien connecté pour ouvrir un canal de notification
  if (!req.session.user || !req.session.user.username) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  // Configuration des en-têtes pour une connexion SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Envoie les en-têtes immédiatement
  // Throttle SSE: empêche une reconnexion < 2s
  try {
    const key = `notif|${req.session.user.username}`;
    const now = Date.now();
    const last = sseThrottle.get(key) || 0;
    if (now - last < 2000) {
      res.statusCode = 429;
      return res.end('Too Many Requests');
    }
    sseThrottle.set(key, now);
  } catch (_) {}
  // Backoff de reconnexion côté client
  res.write('retry: 5000\n');
  // Indique immédiatement au client que le flux est prêt
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  const username = req.session.user.username;
  
  // Dédoublonnage: fermer l'ancienne connexion si elle existe
  if (userNotificationClients.has(username)) {
    try { const prev = userNotificationClients.get(username); prev && prev.end(); } catch (_) {}
    if (userNotificationKeepAlive.has(username)) { clearInterval(userNotificationKeepAlive.get(username)); userNotificationKeepAlive.delete(username); }
  }
  // Stocke la nouvelle connexion
  userNotificationClients.set(username, res);
  console.log(`[SERVER] Canal de notification ouvert pour ${username}. Clients connectés: ${userNotificationClients.size}`);

  // Envoie un commentaire "keep-alive" toutes les 25 secondes pour maintenir la connexion ouverte
  // Ce ping est crucial pour les plateformes comme Render.
  const keepAliveInterval = setInterval(() => {
    // Les deux points ':' au début indiquent un commentaire dans le protocole SSE.
    // C'est la méthode standard pour envoyer un ping qui sera ignoré par le navigateur
    // mais maintiendra la connexion TCP ouverte à travers les proxys.
    res.write(': keep-alive\n\n');
  }, 25000); // 25 secondes est un bon intervalle, assez fréquent pour éviter les timeouts.
  userNotificationKeepAlive.set(username, keepAliveInterval);

  // Lorsque l'utilisateur ferme la page, on nettoie sa connexion de notre Map
  req.on('close', () => {
    clearInterval(keepAliveInterval);
    userNotificationKeepAlive.delete(username);
    userNotificationClients.delete(username);
    console.log(`[SERVER] Canal de notification fermé pour ${username}. Clients restants: ${userNotificationClients.size}`);
    res.end();
  });
});
app.get('/api/competition-info', async (req, res) => {
  try {
    const competitionInfo = await readJsonCached('competition.json');
    res.json(competitionInfo);
  } catch (error) {
    res.status(500).json({ startTime: '2099-12-31T20:00:00.000Z' });
  }
});

app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ token: ADMIN_TOKEN });
    } else {
        res.status(401).json({ error: 'Mot de passe incorrect.' });
    }
});

app.post('/admin/regenerate-questions/:session', protectAdmin, async (req, res) => {
  const { session } = req.params;
  const { theme, level, language, count } = req.body;

  if (!theme || !level || !language || !count) {
    return res.status(400).json({ error: "Les paramètres 'theme', 'level', 'language' et 'count' sont requis." });
  }

  const targetCount = parseInt(count, 10);

  try {
      let finalQuestions = [];
      const seenTexts = new Set();
      let attempts = 0;
      const MAX_ATTEMPTS = 5; // Sécurité pour éviter une boucle infinie

      let courseContent = '';
      try {
        const courseData = await readJsonCached('course.json');
        courseContent = courseData.content;
      } catch (err) {
        console.warn('[Admin] Impossible de lire course.json pour le contexte. La génération sera moins précise.');
      }

      // ==========================================================
      // ===          NOUVEAU : Boucle de génération            ===
      // ==========================================================
      // Tant qu'on n'a pas 15 questions et qu'on n'a pas dépassé le nombre max d'essais
      while (finalQuestions.length < targetCount && attempts < MAX_ATTEMPTS) {
          attempts++;
          console.log(`[Gemini Generation] Tentative ${attempts}: Il manque ${targetCount - finalQuestions.length} questions.`);

          // On demande un peu plus de questions que nécessaire pour compenser les rejets
          const countToGenerate = (targetCount - finalQuestions.length) + 5;
          
          const rawQuestions = await generateNewQuestions(theme, level, language, countToGenerate, courseContent, questionHistory);
          const correctedQuestions = await validateAndRefineQuestions(rawQuestions, theme, courseContent);

          // On ajoute les questions validées et uniques à notre liste finale
          for (const q of correctedQuestions) {
              if (q.text && !seenTexts.has(q.text.trim()) && finalQuestions.length < targetCount) {
                  finalQuestions.push(q);
                  seenTexts.add(q.text.trim());
              }
          }
      }

      if (finalQuestions.length < targetCount) {
          throw new Error(`N'a pu générer que ${finalQuestions.length}/${targetCount} questions valides après ${MAX_ATTEMPTS} tentatives.`);
      }

      const questionsWithIds = finalQuestions.map(raw => {
          const q = fixGeneratedQuestion({ ...raw });
          return { ...q, id: crypto.randomBytes(8).toString('hex'), type: "standard" };
      });
      
      sessionQuestions[session] = questionsWithIds;
      await saveQuestions(session);
      
      const newQuestionTexts = questionsWithIds.map(q => q.text);
      questionHistory.push(...newQuestionTexts);
      await saveQuestionHistory();

      res.json({ success: true, message: `${questionsWithIds.length} questions uniques et validées ont été générées pour "${theme}".` });
  } catch (error) {
      console.error(`[Admin] Erreur critique lors de la régénération pour ${session}:`, error);
      res.status(500).json({ error: error.message || "Une erreur interne est survenue." });
  }
});

app.post('/admin/regenerate-questions-all', protectAdmin, async (req, res) => {
  const { theme, level, language, count } = req.body;

  if (!theme || !level || !language || !count) {
    return res.status(400).json({ error: "Les paramètres 'theme', 'level', 'language' et 'count' sont requis." });
  }

  const targetCount = parseInt(count, 10);

  try {
    let courseContent = '';
    try {
      const courseData = await readJsonCached('course.json');
      courseContent = courseData.content;
    } catch (err) {
      console.warn('[Admin All] Impossible de lire course.json pour le contexte.');
    }

    const results = [];
    const allGeneratedInThisRun = []; 
    const fingerprints = new Set();

    for (const sessionFile of sessionFiles) {
      const sessionName = sessionFile.replace('.json', '');
      
      let finalQuestionsForSession = [];
      let attempts = 0;
      const MAX_ATTEMPTS = 5;

      while (finalQuestionsForSession.length < targetCount && attempts < MAX_ATTEMPTS) {
          attempts++;
          const countToGenerate = (targetCount - finalQuestionsForSession.length) + 5;
          const rawQuestions = await generateNewQuestions(theme, level, language, countToGenerate, courseContent, allGeneratedInThisRun);
          const correctedQuestions = await validateAndRefineQuestions(rawQuestions, theme, courseContent);
		  
          for (const q of correctedQuestions) {
              const qText = q.text ? q.text.trim() : null;
              const fingerprint = normalizeQuestionText(qText);
              
              if (qText && !fingerprints.has(fingerprint) && finalQuestionsForSession.length < targetCount) {
                  finalQuestionsForSession.push(q);
                  fingerprints.add(fingerprint);
                  allGeneratedInThisRun.push(qText);
              }
          }
      }

      const questionsWithIds = finalQuestionsForSession.map(raw => {
        const q = fixGeneratedQuestion({ ...raw });
        return { ...q, id: crypto.randomBytes(8).toString('hex'), type: "standard" };
      });

      sessionQuestions[sessionName] = questionsWithIds;
      await saveQuestions(sessionName);
      
      results.push({ session: sessionName, count: questionsWithIds.length });
    }

    questionHistory = allGeneratedInThisRun;
    await saveQuestionHistory();
    console.log('[Admin All] Régénération terminée. Historique global sauvegardé.');

    const total = results.reduce((sum, r) => sum + (r.count || 0), 0);
    res.json({ success: true, message: `${total} questions uniques et validées ont été générées au total.`, details: results });
  } catch (error) {
    console.error('[Admin] Erreur critique lors de la régénération globale:', error);
    res.status(500).json({ error: error.message || 'Une erreur interne est survenue.' });
  }
});

// ==========================================================
// ==    NOUVEAU : GESTION EN MASSE DES QUESTIONS (ADMIN)  ==
// ==========================================================

// On configure Multer pour gérer le fichier uploadé en mémoire, c'est plus propre.
const inMemoryUpload = multer({ storage: multer.memoryStorage() });

// 1. ROUTE POUR TÉLÉCHARGER TOUTES LES QUESTIONS (VERSION CORRIGÉE ET FORMATÉE)
app.get('/admin/questions/download-all', protectAdmin, async (req, res) => {
    console.log('[ADMIN] Demande de téléchargement de toutes les sessions.');
    
    try {
        const allSessionsData = {};

        for (const sessionFile of sessionFiles) {
            const sessionName = sessionFile.replace('.json', '');
            const filePath = path.join(__dirname, sessionFile);
            
            const fileContent = await fsp.readFile(filePath, 'utf8');
            const sessionData = JSON.parse(fileContent);
            
            if (sessionData && Array.isArray(sessionData.questions)) {
                allSessionsData[sessionName] = sessionData.questions;
            } else {
                allSessionsData[sessionName] = [];
            }
        }

        res.setHeader('Content-Disposition', 'attachment; filename="all_sessions_questions.json"');
        res.setHeader('Content-Type', 'application/json');
        
        // CORRECTION APPLIQUÉE ICI : On utilise JSON.stringify avec indentation.
        // Le '2' spécifie un formatage avec 2 espaces, rendant le fichier très lisible.
        res.send(JSON.stringify(allSessionsData, null, 2));

    } catch (error) {
        console.error('[ADMIN] Erreur lors de la construction du fichier de téléchargement :', error);
        res.status(500).json({ error: "Impossible de créer le fichier de questions. Vérifiez les logs du serveur." });
    }
});

// 2. ROUTE POUR IMPORTER LE FICHIER DE QUESTIONS MODIFIÉ
app.post('/admin/questions/upload-all', protectAdmin, inMemoryUpload.single('questionsFile'), async (req, res) => {
    console.log('[ADMIN] Tentative d\'importation d\'un fichier de questions.');
    
    // On vérifie qu'un fichier a bien été envoyé.
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier n\'a été fourni.' });
    }

    try {
        // Le contenu du fichier est dans un "buffer", on le convertit en texte.
        const fileContent = req.file.buffer.toString('utf8');
        const importedData = JSON.parse(fileContent);

        // Validation simple : on vérifie que les clés correspondent aux sessions attendues.
        const importedKeys = Object.keys(importedData);
        const expectedKeys = Object.keys(sessionQuestions);
        if (importedKeys.length === 0 || !expectedKeys.every(key => importedKeys.includes(key))) {
            throw new Error('Le fichier est invalide ou ne contient pas les bonnes sessions.');
        }

        // Si tout est bon, on sauvegarde chaque session.
        for (const sessionName of expectedKeys) {
            // On met à jour l'objet en mémoire.
            sessionQuestions[sessionName] = importedData[sessionName];
            // On sauvegarde la modification dans le fichier correspondant (ex: session1.json).
            await saveQuestions(sessionName);
        }

        console.log('[ADMIN] Importation réussie. Toutes les sessions ont été mises à jour.');
        res.json({ success: true, message: 'Toutes les questions ont été mises à jour avec succès !' });

    } catch (error) {
        console.error('[ADMIN] Erreur lors de l\'importation :', error);
        res.status(500).json({ error: `Échec de l'importation : ${error.message}` });
    }
});

app.get('/admin/questions/:session', protectAdmin, (req, res) => {
    const { session } = req.params;
    
    loadSessionFile(session);
    if (sessionQuestions[session]) {
        res.json(sessionQuestions[session]);
    } else {
        res.status(404).json({ error: 'Session non trouvée.' });
    }
});

app.post('/admin/question/:session', protectAdmin, (req, res) => {
    const { session } = req.params;
    if (!sessionQuestions[session]) return res.status(404).json({ error: 'Session non trouvée.' });
    const { text, options, correctAnswer, englishHint, type, images } = req.body;
    if (!text || !options || options.length < 2 || !correctAnswer || !options.includes(correctAnswer)) {
        return res.status(400).json({ error: 'Données de question invalides.' });
    }
    const newQuestion = { id: crypto.randomBytes(8).toString('hex'), text, options, correctAnswer, englishHint: englishHint || '', type: type || "standard", images: images || [] };
    sessionQuestions[session].push(newQuestion);
    saveQuestions(session);
    res.status(201).json(newQuestion);
});

app.put('/admin/question/:session/:questionId', protectAdmin, (req, res) => {
    const { session, questionId } = req.params;
    if (!sessionQuestions[session]) return res.status(404).json({ error: 'Session non trouvée.' });
    const qIndex = sessionQuestions[session].findIndex(q => q.id == questionId);
    if (qIndex === -1) return res.status(404).json({ error: 'Question non trouvée.' });
    const { text, options, correctAnswer, englishHint, type, images } = req.body;
    if (!text || !options || options.length < 2 || !correctAnswer || !options.includes(correctAnswer)) {
        return res.status(400).json({ error: 'Données de question invalides.' });
    }
    sessionQuestions[session][qIndex] = { ...sessionQuestions[session][qIndex], text, options, correctAnswer, englishHint: englishHint || '', type: type || "standard", images: images || [] };
    saveQuestions(session);
    res.json(sessionQuestions[session][qIndex]);
});

app.delete('/admin/question/:session/:questionId', protectAdmin, (req, res) => {
    const { session, questionId } = req.params;
    if (!sessionQuestions[session]) return res.status(404).json({ error: 'Session non trouvée.' });
    const initialLength = sessionQuestions[session].length;
    sessionQuestions[session] = sessionQuestions[session].filter(q => q.id != questionId);
    if (sessionQuestions[session].length === initialLength) return res.status(404).json({ error: 'Question non trouvée.' });
    saveQuestions(session);
    res.status(204).send();
});

app.get('/admin/competition-info', protectAdmin, async (req, res) => {
  try {
    const data = await readJsonCached('competition.json');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Impossible de lire le fichier de compétition.' });
  }
});

app.post('/admin/competition-info', protectAdmin, async (req, res) => {
  const { startTime } = req.body;
  if (!startTime || isNaN(new Date(startTime).getTime())) {
    return res.status(400).json({ error: 'Format de date invalide.' });
  }
  try {
    const payload = { startTime };
    await fsp.writeFile('competition.json', JSON.stringify(payload, null, 2), 'utf8');
    updateJsonCache('competition.json', payload);
    console.log('[ADMIN] Date de compétition mise à jour :', startTime);
    res.json({ success: true, message: 'Date de compétition mise à jour avec succès.' });
  } catch (error) {
    console.error('[ADMIN] Erreur écriture competition.json:', error);
    res.status(500).json({ error: 'Impossible de sauvegarder la date de compétition.' });
  }
});

app.get('/admin/competition-rules', protectAdmin, (req, res) => {
    res.json(competitionRules);
});
// REMPLACEZ CETTE ROUTE
app.post('/admin/competition-rules', protectAdmin, async (req, res) => {
  // On lit les règles actuelles pour ne pas écraser les valeurs non modifiées
  const currentRules = { ...competitionRules };
  
  // On vérifie si un nouveau nombre de gagnants a été envoyé
  if (req.body.maxWinners !== undefined) {
      const newMaxWinners = parseInt(req.body.maxWinners, 10);
      if (isNaN(newMaxWinners) || newMaxWinners <= 0) {
          return res.status(400).json({ error: 'Le nombre de gagnants doit être un nombre positif.' });
      }
      // Mise à jour et réinitialisation de la compétition
      currentRules.maxWinners = newMaxWinners;
      competitionRules.competitionEnded = false;
      competitionRules.competitionEndTime = null;
      winners = [];
      await saveWinners();
      console.log(`[ADMIN] Règles de compétition mises à jour. Max gagnants: ${newMaxWinners}. La compétition est réinitialisée.`);
  }

  // On vérifie si un nouveau prix a été envoyé
  if (req.body.price !== undefined) {
      const newPrice = parseInt(req.body.price, 10);
      if (isNaN(newPrice) || newPrice < 0) {
          return res.status(400).json({ error: 'Le prix doit être un nombre positif ou nul.' });
      }
      currentRules.price = newPrice;
      console.log(`[ADMIN] Prix de la compétition mis à jour : ${newPrice} Ar.`);
  }
  
  // On sauvegarde les nouvelles règles (qu'elles aient été modifiées ou non)
  competitionRules = { ...competitionRules, ...currentRules };
  await saveCompetitionRules();

  res.json({ success: true, message: 'Règles mises à jour avec succès.' });
});

app.get('/admin/users', protectAdmin, (req, res) => {
  const userList = users.map(u => ({ username: u.username, level: u.level, xp: u.xp }));
  res.json(userList);
});

// NOUVEAU : Route pour que l'admin voie le podium à tout moment
app.get('/admin/winners', protectAdmin, (req, res) => {
    // Cette route renvoie toujours la liste des gagnants,
    // que la compétition soit terminée ou non.
    res.json(winners);
});
// Route pour que l'admin récupère la liste des livres
app.get('/admin/books', protectAdmin, (req, res) => {
  res.json(books);
});

// Route for que l'admin ajoute un nouveau livre
// Route for que l'admin ajoute un nouveau livre
app.post('/admin/books', protectAdmin, (req, res) => {
  const { title, downloadLink } = req.body;

  // Validation 1: S'assurer que les champs ne sont pas vides
  if (!title || !downloadLink) {
    return res.status(400).json({ error: 'Le titre et le lien de téléchargement sont requis.' });
  }
  
  // ==========================================================
  // ===          VÉRIFICATION DES DOUBLONS AJOUTÉE         ===
  // ==========================================================
  // On prépare les données reçues en retirant les espaces superflus
  // et en mettant le titre en minuscule pour une comparaison fiable.
  const normalizedTitle = title.trim().toLowerCase();
  const normalizedLink = downloadLink.trim();

  // Vérification 2: On cherche si un livre avec le même titre existe déjà.
  // La méthode .some() est très efficace, elle s'arrête dès qu'elle trouve une correspondance.
  const titleExists = books.some(book => book.title.toLowerCase() === normalizedTitle);
  if (titleExists) {
    // On renvoie une erreur 409 (Conflit). C'est le code standard pour indiquer
    // que la ressource que l'on essaie de créer existe déjà.
    return res.status(409).json({ error: 'Un livre avec ce titre exact existe déjà.' });
  }

  // Vérification 3: On cherche si un livre avec le même lien existe déjà.
  const linkExists = books.some(book => book.downloadLink === normalizedLink);
  if (linkExists) {
    return res.status(409).json({ error: 'Ce lien de téléchargement a déjà été ajouté.' });
  }

  // Si toutes les vérifications sont passées, on peut créer le nouveau livre.
  const newBook = {
    id: crypto.randomBytes(8).toString('hex'), // Génère un ID unique
    title: title.trim(), // On sauvegarde le titre avec sa casse originale mais sans espaces.
    downloadLink: normalizedLink
  };

  // Ajout du livre à notre liste en mémoire.
  books.push(newBook);
  // Sauvegarde de la liste mise à jour dans le fichier books.json.
  saveBooks();

  // On renvoie le nouveau livre avec un statut 201 (Créé).
  res.status(201).json(newBook);
});

// Route pour que l'admin supprime un livre par son ID
app.delete('/admin/books/:id', protectAdmin, (req, res) => {
  const { id } = req.params;
  const initialLength = books.length;

  // On filtre la liste pour ne garder que les livres dont l'ID est différent
  books = books.filter(book => book.id !== id);

  // Si la longueur de la liste n'a pas changé, le livre n'a pas été trouvé
  if (books.length === initialLength) {
    return res.status(404).json({ error: 'Livre non trouvé.' });
  }

  // On sauvegarde la liste mise à jour
  saveBooks();
  
  // On renvoie une réponse vide avec le statut 204 (Pas de contenu) pour indiquer le succès
  res.status(204).send();
});
// ... après les routes de gestion des livres ...

// ==========================================================
// ===        NOUVELLES ROUTES ADMIN POUR LES THÈMES      ===
// ==========================================================

// Récupérer la liste et l'index actuel des thèmes
app.get('/admin/themes', protectAdmin, (req, res) => {
  res.json(themeData);
});

// Ajouter un nouveau thème à la fin de la liste
app.post('/admin/themes', protectAdmin, (req, res) => {
  const { theme } = req.body;
  if (!theme || typeof theme !== 'string' || theme.trim() === '') {
    return res.status(400).json({ error: 'Le nom du thème est invalide.' });
  }
  // On vérifie aussi que le thème n'existe pas déjà
  if (themeData.themes.map(t => t.toLowerCase()).includes(theme.trim().toLowerCase())) {
     return res.status(409).json({ error: 'Ce thème existe déjà dans la liste.' });
  }
  themeData.themes.push(theme.trim());
  saveThemes();
  res.status(201).json(themeData);
});

// Supprimer un thème de la liste
app.delete('/admin/themes', protectAdmin, (req, res) => {
  const { theme } = req.body;
  if (!theme) {
    return res.status(400).json({ error: 'Le nom du thème est requis.' });
  }
  const initialLength = themeData.themes.length;
  themeData.themes = themeData.themes.filter(t => t !== theme);

  // Ajuster l'index si on a supprimé un thème avant l'index actuel
  if (themeData.themes.length < initialLength) {
    if (themeData.currentIndex >= themeData.themes.length) {
      themeData.currentIndex = 0; // Remettre à zéro si l'index devient invalide
    }
    saveThemes();
    res.status(200).json(themeData);
  } else {
    res.status(404).json({ error: 'Thème non trouvé.' });
  }
});

// Réorganiser la liste des thèmes
app.post('/admin/themes/reorder', protectAdmin, (req, res) => {
  const { orderedThemes } = req.body;
  if (!Array.isArray(orderedThemes)) {
    return res.status(400).json({ error: 'Une liste de thèmes est attendue.' });
  }
  
  // On met à jour l'ordre
  themeData.themes = orderedThemes;
  // On recalcule l'index actuel pour qu'il corresponde au même thème qu'avant
  const currentThemeName = themeData.themes[themeData.currentIndex];
  const newIndex = themeData.themes.findIndex(t => t === currentThemeName);
  themeData.currentIndex = newIndex !== -1 ? newIndex : 0;
  
  saveThemes();
  res.status(200).json(themeData);
});
// ==========================================================
// ===         NOUVELLES ROUTES ADMIN POUR LES PROMPTS    ===
// ==========================================================
app.get('/admin/prompts', protectAdmin, (req, res) => {
  try {
    // On lit le fichier directement pour être sûr d'avoir la dernière version
    const promptsData = fs.readFileSync('prompts.json', 'utf8');
    res.json(JSON.parse(promptsData));
  } catch (error) {
    console.error('[ADMIN] Erreur lors de la lecture de prompts.json:', error);
    res.status(500).json({ error: 'Impossible de lire le fichier de prompts.' });
  }
});

app.post('/admin/prompts', protectAdmin, (req, res) => {
  const { questions, course } = req.body;
  if (typeof questions !== 'string' || typeof course !== 'string') {
    return res.status(400).json({ error: 'Les prompts pour les questions et le cours sont requis et doivent être du texte.' });
  }

  try {
    const newPrompts = { questions, course };
    fs.writeFileSync('prompts.json', JSON.stringify(newPrompts, null, 2), 'utf8');
    
    // IMPORTANT : On demande à gemini.js de recharger les prompts en mémoire
    const geminiModule = require('./gemini.js');
    geminiModule.loadPrompts();

    res.json({ success: true, message: 'Les prompts ont été sauvegardés et rechargés avec succès !' });
  } catch (error) {
    console.error('[ADMIN] Erreur lors de la sauvegarde de prompts.json:', error);
    res.status(500).json({ error: 'Impossible de sauvegarder le fichier de prompts.' });
  }
});

// REMPLACEZ LA TOTALITÉ DE VOTRE ROUTE /admin/reset-user PAR CELLE-CI :
app.post('/admin/reset-user', protectAdmin, async (req, res) => {
  const { username, theme } = req.body;

  if (!username) {
      return res.status(400).json({ error: "Le nom d'utilisateur est requis." });
  }

  // Fonction interne pour réinitialiser un utilisateur
  const resetUser = (user) => {
      if (user.username === 'devtest') return;
      console.log(`[ADMIN] Réinitialisation du compte pour l'utilisateur : ${user.username}`);
      user.scores = [];
      user.currentScore = 0;
      user.activeSession = null;
      user.xp = 0;
      user.level = 1;
      user.achievements = [];
      user.streakCount = 0;
      user.lastPlayDate = null;
      user.consecutiveCorrectAnswers = 0;
      user.coins = 100;
      user.competitionCoins = 0;
      user.completedSessions = [];
      user.rewardedQuestionIds = [];
  };

  // Fonction pour envoyer une notification de réinitialisation à un client connecté
  const notifyUserOfReset = (usernameToNotify) => {
    if (userNotificationClients.has(usernameToNotify)) {
      const clientRes = userNotificationClients.get(usernameToNotify);
      // On envoie un événement personnalisé nommé 'account-reset'
      clientRes.write('event: account-reset\n');
      clientRes.write('data: Votre compte a été réinitialisé par un administrateur.\n\n');
      console.log(`[ADMIN] Notification de réinitialisation envoyée à ${usernameToNotify}`);
    }
  };

  let message = '';

  if (username === 'ALL_USERS') {
      console.log('[ADMIN] Réinitialisation de TOUS les comptes utilisateurs.');
      users.forEach(user => resetUser(user));
      saveUsers();

      // Notifier TOUS les utilisateurs connectés
      userNotificationClients.forEach((_res, usernameToNotify) => {
        notifyUserOfReset(usernameToNotify);
      });

      message = 'Tous les comptes ont été réinitialisés et les utilisateurs en ligne notifiés.';

      const themeToTeach = theme?.trim();
      if (themeToTeach) {
          try {
              console.log(`[ADMIN] Déclenchement de la génération du cours pour le thème : "${themeToTeach}"`);
              const courseContent = await generateCourse(themeToTeach);
              const courseData = { theme: themeToTeach, content: courseContent, generatedAt: new Date().toISOString() };
              fs.writeFileSync('course.json', JSON.stringify(courseData, null, 2), 'utf8');
              message += ` ET un nouveau cours sur "${themeToTeach}" a été généré.`;
          } catch (error) {
              message += ` Mais la génération du cours a échoué. Raison: ${error.message}`;
          }
      } else {
          message += ' (Aucun cours généré car le thème n\'a pas été fourni.)';
      }

      return res.json({ success: true, message });

  } else {
      const userIndex = users.findIndex(u => u.username === username);
      if (userIndex === -1) {
          return res.status(404).json({ error: 'Utilisateur non trouvé.' });
      }
      resetUser(users[userIndex]);
      saveUsers();
      
      // Notifier l'utilisateur spécifique
      notifyUserOfReset(username);

      return res.json({ success: true, message: `Le compte de "${username}" a été réinitialisé et l'utilisateur notifié s'il est en ligne.` });
  }
});

// NOUVEAU : Route pour purger l'historique des questions
app.post('/admin/reset-question-history', protectAdmin, async (req, res) => {
  try {
    questionHistory = []; // On vide le tableau en mémoire
    await saveQuestionHistory(); // On sauvegarde le tableau vide (ce qui vide le fichier)
    console.log('[ADMIN] L\'historique des questions a été purgé.');
    res.json({ success: true, message: 'L\'historique des questions générées a été purgé avec succès.' });
  } catch (error) {
    console.error('[ADMIN] Erreur lors de la purge de l\'historique des questions :', error);
    res.status(500).json({ error: 'Une erreur est survenue lors de la suppression de l\'historique.' });
  }
});

// Endpoint pour le ping de vérification de connexion réseau
app.get('/api/ping', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: 'french-quest'
    });
});

app.use('/api', router);
// --- SERVIR LES PAGES HTML ET LES FICHIERS STATIQUES ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/inscription', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'inscription.html'));
});

app.use((req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
});

// --- API & ROUTES ---
// Correction SPA : servir index.html pour toute route non-API côté client
const clientRoutes = ['/errors'];
clientRoutes.forEach(route => {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

// --- ROUTES PROTÉGÉES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/menu', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/quiz', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/course', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/livres', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/history', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/wallet', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint pour le ping de vérification de connexion réseau
app.get('/api/ping', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        server: 'french-quest'
    });
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log(`Panneau Admin disponible sur http://localhost:${PORT}/admin`);
});