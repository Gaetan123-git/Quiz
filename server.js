const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const jsonServer = require('json-server');
const path = require('path');
const fs = require('fs');

const app = express();
const router = jsonServer.router('db.json');

// Middleware pour gérer les sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'x7k9p3m8q2w5z1r4t6y',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware JSON Server
app.use('/api', router);

// Charger les utilisateurs existants depuis utilisateur.json
let users = [];
try {
  const userData = fs.readFileSync('utilisateur.json', 'utf8');
  users = JSON.parse(userData);
} catch (error) {
  console.error('Erreur lors du chargement de utilisateur.json :', error);
  users = [];
}

// Sauvegarder les utilisateurs dans utilisateur.json
function saveUsers() {
  fs.writeFileSync('utilisateur.json', JSON.stringify(users, null, 2), 'utf8');
}

// Liste des utilisateurs connectés (stockée dans une Map pour suivre les sessions)
const activeUsers = new Map();

// Inscription
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(user => user.username === username)) {
    return res.status(400).json({ error: 'Utilisateur déjà existant.' });
  }
  const newUser = { username, password, scores: [], currentScore: 0, lastScoreUpdate: null };
  users.push(newUser);
  saveUsers();
  res.json({ message: 'Inscription réussie.' });
});

// Connexion
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect.' });
  }
  req.session.user = user;
  activeUsers.set(username, true);
  res.json({ message: 'Connexion réussie.' });
});

// Vérifier la session
app.get('/check-session', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, username: req.session.user.username, score: req.session.user.currentScore });
  } else {
    res.json({ loggedIn: false });
  }
});

// Déconnexion
app.post('/logout', (req, res) => {
  if (req.session.user) {
    activeUsers.delete(req.session.user.username);
    console.log(`Utilisateur déconnecté : ${req.session.user.username}`);
    const user = users.find(u => u.username === req.session.user.username);
    if (user) {
      user.currentScore = 0;
      user.scores = [];
      user.lastScoreUpdate = null;
      saveUsers();
      console.log(`Score et réponses réinitialisés pour ${user.username}`);
    }
  }
  req.session.destroy();
  res.json({ message: 'Déconnexion réussie.' });
});

// Réinitialiser le score
app.post('/reset-score', (req, res) => {
  if (req.session.user) {
    const user = users.find(u => u.username === req.session.user.username);
    if (user) {
      user.currentScore = 0;
      user.scores = [];
      user.lastScoreUpdate = null;
      saveUsers();
      console.log(`Score et réponses réinitialisés pour ${user.username}`);
    }
  }
  res.json({ message: 'Score réinitialisé avec succès.' });
});

// Obtenir les questions depuis db.json
app.get('/questions', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Non connecté.' });
  }
  const db = router.db;
  const allQuestions = db.get('questions').value();
  const user = users.find(u => u.username === req.session.user.username);
  const answeredQuestionIds = user.scores.map(score => score.questionId);
  const unansweredQuestions = allQuestions.filter(q => !answeredQuestionIds.includes(q.id));
  res.json(unansweredQuestions);
});

// Soumettre une réponse
app.post('/submit', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Non connecté.' });
  }

  const { questionId, answer, timeTaken } = req.body;
  const db = router.db;
  const question = db.get('questions').find({ id: questionId }).value();
  if (!question) {
    return res.status(404).json({ error: 'Question non trouvée.' });
  }

  const user = users.find(u => u.username === req.session.user.username);
  const alreadyAnswered = user.scores.some(score => score.questionId === questionId);
  if (alreadyAnswered) {
    return res.status(400).json({
      error: 'Question déjà répondue.',
      isCorrect: false,
      score: user.currentScore,
      correctAnswer: question.correctAnswer
    });
  }

  const isCorrect = answer === question.correctAnswer;
  const baseScore = isCorrect ? 200 : 0;
  const timePenalty = Math.min(timeTaken, 30);
  const score = isCorrect ? baseScore - timePenalty : 0;

  user.currentScore += score;
  user.scores.push({ questionId, score, timeTaken });
  user.lastScoreUpdate = new Date().toISOString();
  saveUsers();

  console.log(`Score mis à jour pour ${user.username} : ${user.currentScore}`);
  console.log(`Réponses de ${user.username} :`, user.scores);

  res.json({ isCorrect, score: user.currentScore, correctAnswer: question.correctAnswer });
});

// Stream du classement
app.get('/leaderboard-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let previousUsernames = new Set();

  const interval = setInterval(() => {
    const onlineUsers = users.filter(user => activeUsers.has(user.username));
    const leaderboard = onlineUsers
      .map(user => ({ username: user.username, score: user.currentScore }))
      .sort((a, b) => b.score - a.score);
    const currentUsernames = new Set(leaderboard.map(u => u.username));

    let newUser = null;
    let leftUser = null;

    for (let username of currentUsernames) {
      if (!previousUsernames.has(username)) {
        newUser = username;
        break;
      }
    }

    for (let username of previousUsernames) {
      if (!currentUsernames.has(username)) {
        leftUser = username;
        break;
      }
    }

    console.log('Classement envoyé (uniquement en ligne) :', leaderboard);
    if (newUser) {
      console.log(`Nouvel utilisateur détecté : ${newUser}`);
    }
    if (leftUser) {
      console.log(`Utilisateur ayant quitté : ${leftUser}`);
    }

    res.write(`data: ${JSON.stringify({ leaderboard, newUser, leftUser })}\n\n`);

    previousUsernames = currentUsernames;
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

// Servir la page de connexion
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Servir la page d'inscription
app.get('/inscription', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'inscription.html'));
});

// Servir l'application pour toutes les autres routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Serveur démarré sur http://localhost:${process.env.PORT || 3000}`);
});