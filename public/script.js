import { EmojiButton } from 'https://cdn.jsdelivr.net/npm/@joeattardi/emoji-button@latest/dist/index.min.js';
import i18n from './i18n.js';
import NetworkMonitor from './network-monitor.js';
let keepAliveInterval = null;
let competitionStartTime = null;
let currentQuestion = null;
let questions = [];
let startTime = null;
let timerInterval = null;
let totalQuestions = 0;
let answeredQuestionsCount = 0; // To track answered questions for circular progress
let selectedSession = sessionStorage.getItem('selectedSession') || new URLSearchParams(window.location.search).get('session') || "session1";
let chatMessages = [];
let chatEventSource = null;
let leaderboardEventSource = null; // Reference for leaderboard EventSource
let chatContainer = null; // Reference to the chat container
let currentUsername = null; // To store the logge-in username
let audioContext = null; // For notification sound
let competitionCountdownInterval = null;
let emojiPicker = null;
let sessionStatusEventSource = null;
let userStatusEventSource = null;
let courseHistory = [];
let networkMonitor = null;

// Retry state for session status EventSource
let sessionStatusRetryMs = 1000;
let sessionStatusOnlineHandlerAdded = false;

// Installer un intercepteur global de fetch pour gérer les 409 (ancien appareil)
(() => {
    let installed = false;
    function installForceLogoutInterceptor() {
        if (installed) return; installed = true;
        const originalFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
            const res = await originalFetch(...args);
            if (res && res.status === 409) {
                try { showToast(i18n.t('session.forceLogoutTitle'), i18n.t('session.forceLogoutMessage')); } catch (_) {}
                try { await originalFetch('/logout', { method: 'POST' }); } catch (_) {}
                try { window.location.href = '/login'; } catch (_) {}
            }
            return res;
        };
    }
    // installer immédiatement
    try { installForceLogoutInterceptor(); } catch (_) {}
})();

// Fonction qui détecte le type d'appareil et ajoute une classe au body
function detectDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const body = document.body;

    // Supprimer les anciennes classes pour éviter les conflits
    body.classList.remove('device-desktop', 'device-mobile');

    if (/android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())) {
        body.classList.add('device-mobile');
    } else {
        body.classList.add('device-desktop');
    }
}
// New: Default settings
let currentTheme = 'blue';
let currentFontSize = 'medium';
let currentFontFamily = 'poppins';
let currentUIDesign = 'default';
let userNotificationEventSource = null;
// New: Quiz result data to send to the server for analysis
let quizResults = {
    correctAnswersCount: 0,
    totalTime: 0,
    weakAreas: []
};

// Messages will now be loaded from i18n
function getCongratulationMessage() {
    return i18n.t('messages.congratulations');
}

function getEncouragementMessage() {
    return i18n.t('messages.encouragement');
}

function getSongs() {
    return [
        {
            name: i18n.t('competition.liveCompetition'),
            unlocked: true,
            subMenu: [
                { name: `${i18n.t('game.session')} 1`, page: "/quiz?session=session1", logo: "🎮" },
                { name: `${i18n.t('game.session')} 2`, page: "/quiz?session=session2", logo: "🎮" },
                { name: `${i18n.t('game.session')} 3`, page: "/quiz?session=session3", logo: "🎮" },
                { name: `${i18n.t('game.session')} 4`, page: "/quiz?session=session4", logo: "🎮" },
                { name: `${i18n.t('game.session')} 5`, page: "/quiz?session=session5", logo: "🎮" },
                { name: `${i18n.t('game.session')} 6`, page: "/quiz?session=session6", logo: "🎮" },
                { name: `${i18n.t('game.session')} 7`, page: "/quiz?session=session7", logo: "🎮" },
                { name: `${i18n.t('game.session')} 8`, page: "/quiz?session=session8", logo: "🎮" },
                { name: `${i18n.t('game.session')} 9`, page: "/quiz?session=session9", logo: "🎮" },
                { name: `${i18n.t('game.session')} 10`, page: "/quiz?session=session10", logo: "🎮" }
            ]
        }
    ];
}

// Achievement Definitions (now using i18n)
function getAchievementsDefinitions() {
    return {
        FIRST_WIN: { 
            id: 'FIRST_WIN', 
            name: i18n.t('achievements.firstWin'), 
            description: i18n.t('achievements.firstWinDesc') 
        },
        TEN_CONSECUTIVE_CORRECT: { 
            id: 'TEN_CONSECUTIVE_CORRECT', 
            name: i18n.t('achievements.tenConsecutive'), 
            description: i18n.t('achievements.tenConsecutiveDesc') 
        },
        // Add more achievements here if you add them in server.js
    };
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// NOUVELLE FONCTION AMÉLIORÉE (remplace l'ancienne showNotification)
function showToast(title, message, type = 'info', duration = 5000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Création de l'élément toast
    const toastElement = document.createElement('div');
    toastElement.className = `toast ${type}`;

    // Icônes pour chaque type
    const icons = {
        info: 'ℹ️',
        success: '✅',
        error: '❌'
    };
    const icon = icons[type] || '🔔';

    // Structure HTML du toast
    toastElement.innerHTML = `
        <div class="toast__icon">${icon}</div>
        <div class="toast__content">
            <p class="toast__title">${title}</p>
            <p class="toast__message">${message}</p>
        </div>
    `;

    // Ajout du toast au conteneur
    container.appendChild(toastElement);

    // Suppression automatique après la durée spécifiée
    setTimeout(() => {
        toastElement.classList.add('toast--exit');
        // Attendre la fin de l'animation de sortie pour supprimer l'élément
        toastElement.addEventListener('animationend', () => {
            toastElement.remove();
        });
    }, duration);
}

// New navigation function
function navigateTo(route) {
    // Before navigating, update selectedSession from the route if it contains a session param
    const urlParams = new URLSearchParams(route.split('?')[1]);
    const newSession = urlParams.get('session');
    if (newSession) {
        selectedSession = newSession;
        sessionStorage.setItem('selectedSession', newSession); // Save to sessionStorage
    } else if (route === '/menu' || route === '/login' || route === '/inscription' || route === '/' || route === '/history' || route === '/settings') { // Added /history and /settings
        // Clear selectedSession if navigating away from quiz/chat to main menu or auth pages
        sessionStorage.removeItem('selectedSession');
        selectedSession = "session1"; // Reset to default for non-quiz/chat pages
    }

    window.history.pushState({}, '', route);
    updateView();
}
// Remplacez votre fonction updateView par celle-ci
// Remplacez votre fonction updateView par celle-ci

function updateView() {
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    
    // Logique existante pour gérer selectedSession...
    const urlSession = urlParams.get('session');
    if (urlSession) {
        selectedSession = urlSession;
        sessionStorage.setItem('selectedSession', selectedSession);
    } else if (!sessionStorage.getItem('selectedSession') && (path === '/quiz' || path === '/chat')) {
        selectedSession = "session1";
        sessionStorage.setItem('selectedSession', selectedSession);
    } else if (sessionStorage.getItem('selectedSession')) {
        selectedSession = sessionStorage.getItem('selectedSession');
    } else {
        selectedSession = "session1";
    }

    const auth = document.getElementById('auth');
    const songSelection = document.getElementById('song-selection');
    const game = document.getElementById('game');
    const chatPage = document.getElementById('chat-page');
    const historyPage = document.getElementById('history-page');
    const settingsPage = document.getElementById('settings-page');
    const coursePage = document.getElementById('course-page');
    const courseHistoryPage = document.getElementById('course-history-page'); // <-- Votre ajout est correct
    const livresPage = document.getElementById('livres-page'); 
    const errorsPage = document.getElementById('errors-page'); // Ajout de la page d'erreurs
    const floatingChatButton = document.getElementById('floating-chat-button');
    
    // On cache toutes les sections
    [auth, songSelection, game, chatPage, historyPage, settingsPage, coursePage, courseHistoryPage, livresPage, errorsPage].forEach(el => {
        if (el) el.style.display = 'none';
    });
    if (floatingChatButton) {
        floatingChatButton.style.display = 'none';
        floatingChatButton.classList.remove('new-message-indicator');
    }

    if (path !== '/quiz') {
        if (leaderboardEventSource) {
            leaderboardEventSource.close();
            leaderboardEventSource = null;
        }
        stopKeepAlive(); 
    }
    if (path !== '/quiz' && path !== '/chat') {
        if (chatEventSource) {
            chatEventSource.close();
            chatEventSource = null;
            chatMessages = [];
        }
    }
    if (path !== '/menu' && sessionStatusEventSource) {
        sessionStatusEventSource.close();
        sessionStatusEventSource = null;
    }
    if (path === '/login' || path === '/inscription') {
        if (userStatusEventSource) {
            userStatusEventSource.close();
            userStatusEventSource = null;
        }
    }
    
    // Logique de routage
    if (path === '/menu') {
        checkSessionAndShowMenu();
    } else if (path === '/quiz') {
        checkSessionAndShowQuiz();
        if (floatingChatButton) floatingChatButton.style.display = 'flex';
    } else if (path === '/chat') {
        checkSessionAndShowChat();
    } else if (path === '/course') {
        checkSessionAndShowCourse();
    } else if (path === '/livres') {
        checkSessionAndShowLivres();
    } else if (path === '/course-history') { // <-- Votre ajout est correct
        checkSessionAndShowCourseHistory();
    } else if (path === '/errors') {
        console.log('[DEBUG] Route /errors détectée, appel de showUserErrorsPage');
        const errorsPageEl = document.getElementById('errors-page');
        if (errorsPageEl) errorsPageEl.style.display = 'flex';
        showUserErrorsPage();
    } else if (path === '/history') {
        checkSessionAndShowHistory();
    } else if (path === '/settings') {
        checkSessionAndShowSettings();
    } else if (path === '/' || path === '/login') {
        checkSessionAndShowMenu(); 
    } else {
        navigateTo('/menu');
    }
}
/**
 * Met à jour les informations de l'utilisateur dans l'en-tête de la page.
 * C'est une fonction centralisée pour éviter la répétition du code.
 * @param {object} userData - L'objet contenant les données de l'utilisateur (username, xp, level, avatar, etc.).
 */
function updateHeaderWithUserData(userData) {
    // S'il n'y a pas de données, on ne fait rien pour éviter les erreurs.
    if (!userData) return;

    // On stocke le nom d'utilisateur pour un accès global facile
    currentUsername = userData.username;

    // Mise à jour du nom d'utilisateur et de l'avatar dans le menu déroulant
    const greetingUsernameEl = document.getElementById('greeting-username');
    const greetingAvatarEl = document.querySelector('.greeting-avatar');

    if (greetingUsernameEl) {
        greetingUsernameEl.textContent = userData.username;
        // Empêche i18n de réécrire le nom d'utilisateur dynamique lors d'un changement de langue
        greetingUsernameEl.setAttribute('data-i18n-skip', 'true');
        greetingUsernameEl.setAttribute('data-original-username', userData.username);
    }
    if (greetingAvatarEl) {
        renderElementAvatar(greetingAvatarEl, {
            avatarType: userData.avatarType || null,
            avatarUrl: userData.avatarUrl || null
        }, userData.username);
    }

    // Mise à jour des statistiques principales dans l'en-tête (XP, niveau, pièces, etc.)
    updatePlayerStats(userData.xp, userData.level, userData.streakCount, userData.coins, userData.competitionCoins);

    // Initialise le canal de notifications si ce n'est pas déjà fait
    setupUserNotificationStream();
}
async function checkSessionAndShowMenu() {
    try {
        const response = await fetch('/check-session');
        const result = await response.json();

        if (result.loggedIn) {
            // APPEL DE NOTRE NOUVELLE FONCTION CENTRALISÉE
            updateHeaderWithUserData(result);
            
            // Le reste de la logique spécifique à cette page
            showSongSelection(); 
        } else {
            // Si l'utilisateur n'est pas connecté, on le redirige.
            window.location.href = '/login'; 
        }
    } catch (error) {
        console.error("Erreur lors de la vérification de la session pour le menu :", error);
        window.location.href = '/login'; // En cas d'erreur réseau, rediriger aussi.
    }
}
async function checkSessionAndShowQuiz() {
    try {
        const response = await fetch('/check-session');
        const userData = await response.json();
        
        if (!userData.loggedIn) {
            navigateTo('/login');
            showToast('Session expirée', 'Veuillez vous reconnecter.', 'error');
            return;
        }

        // APPEL DE NOTRE NOUVELLE FONCTION CENTRALISÉE
        updateHeaderWithUserData(userData);
        
        // On récupère les informations sur la session (nombre total de questions)
        const sessionInfoResponse = await fetch(`/api/session-info?session=${selectedSession}`);
        if (!sessionInfoResponse.ok) {
             const errorData = await sessionInfoResponse.json();
             showToast('Accès Verrouillé', errorData.error, 'error');
             navigateTo('/menu');
             return;
        }
        const sessionInfo = await sessionInfoResponse.json();
        totalQuestions = sessionInfo.totalQuestionsInSession;

        // On calcule combien de questions ont déjà été répondues pour cette session
        const answeredScores = userData.scores.filter(s => s.session === selectedSession);
        answeredQuestionsCount = answeredScores.length;

        // Si l'utilisateur a déjà répondu à toutes les questions, on va directement aux résultats.
        if (totalQuestions > 0 && answeredQuestionsCount >= totalQuestions) {
            console.log(`[CLIENT] Session ${selectedSession} déjà terminée. Affichage des résultats...`);
            const game = document.getElementById('game');
            if (game) game.style.display = 'block';
            
            setupLeaderboardStream();
            endQuiz(); // Appeler directement endQuiz
            return;
        }

        const game = document.getElementById('game');
        if (game) game.style.display = 'block';

        const gameContent = document.querySelector('.game-content');
        if (gameContent) {
            gameContent.innerHTML = `
                <div id="question-container" class="question-card"><div id="question"></div></div>
                <div id="options" class="options-grid"></div>
                <div id="feedback"></div>
                <div id="correct-translation"></div>
                <div id="answer-explanation" class="answer-explanation"></div>
                <div id="hint-controls" class="hint-zone" style="display: none;">
                    <button id="hint-button" class="button-secondary">💡 Obtenir un indice (Coût: 25 💰)</button>
                    <div id="hint-container" style="display: none;"></div>
                </div>
                <div id="continue-controls" style="display: none; text-align: center; margin-top: 1.5rem;">
                    <button id="continue-question-button" class="button-primary">Continuer</button>
                </div>
            `;
        }
        
        quizResults = { correctAnswersCount: 0, totalTime: 0, weakAreas: [] };
        
        // Démarrage du quiz
        updateProgress();
        // C'est ICI que le processus commence : on appelle nextQuestion pour la première fois.
        nextQuestion(); 
        
        setupLeaderboardStream();
        setupChatStream();
        
    } catch (error) {
        console.error("Erreur lors de l'affichage du quiz:", error);
        showToast("Erreur Critique", "Impossible de charger le quiz.", "error");
        navigateTo('/menu');
    }
}
async function checkSessionAndShowChat() {
    try {
        const response = await fetch('/check-session');
        const result = await response.json();
        
        if (!result.loggedIn) {
            navigateTo('/login');
            showToast('Session expirée', 'Veuillez vous reconnecter.', 'error');
            return;
        }
        
        // APPEL DE NOTRE NOUVELLE FONCTION CENTRALISÉE
        updateHeaderWithUserData(result);

        const competitionRes = await fetch('/api/competition-info');
        const competitionData = await competitionRes.json();
        competitionStartTime = new Date(competitionData.startTime).getTime();

        const chatPage = document.getElementById('chat-page');
        if (chatPage) {
            chatPage.style.display = 'flex'; 
            
            if (!document.getElementById('actual-chat-container')) {
                createChatContainer();
            }
            
            const emojiButton = document.getElementById('emoji-btn');
            const chatInput = document.getElementById('chat-input');
            const sendButton = document.getElementById('send-message');

            if (emojiButton && !emojiButton.emojiListenerAttached) {
                if (typeof EmojiButton === 'function') {
                    const picker = new EmojiButton({
                        position: 'top-end',
                        autoHide: true,
                    });

                    picker.on('emoji', selection => {
                        if (chatInput) {
                            chatInput.value += selection.emoji;
                            chatInput.focus();
                            if (sendButton) sendButton.disabled = false;
                        }
                    });
                    
                    emojiButton.addEventListener('click', () => {
                        picker.togglePicker(emojiButton);
                    });
                    
                    emojiButton.emojiListenerAttached = true;
                    console.log('[CLIENT] Emoji Picker initialisé avec succès.');
                } else {
                    console.error('[CLIENT] ERREUR : La bibliothèque EmojiButton n\'est pas disponible ou pas chargée.');
                }
            }
            
            setupChatStream();
        }
    } catch (error) {
        console.error("Erreur lors de l'affichage du chat:", error);
        showToast("Erreur", "Impossible de charger le chat.", "error");
    }
}
async function checkSessionAndShowHistory() {
    try {
        // Étape 1 : On appelle le serveur pour obtenir les TOUTES DERNIÈRES informations
        const response = await fetch('/check-session');
        const userData = await response.json();

        // Étape 2 : On vérifie si l'utilisateur est toujours bien connecté
        if (userData.loggedIn) {
            // APPEL DE NOTRE NOUVELLE FONCTION CENTRALISÉE
            updateHeaderWithUserData(userData);
            
            // Étape 3 : On affiche la page d'historique avec les données fraîchement récupérées
            showHistoryPage(userData);
        
        } else {
            // Si la session a expiré entre-temps, on le renvoie à la connexion
            navigateTo('/login');
            showToast('Session expirée', 'Veuillez vous reconnecter.', 'error');
        }
    } catch (error) {
        console.error('[CLIENT] Erreur lors de la récupération des données d\'historique :', error);
        showToast('Erreur', 'Impossible de charger votre historique.', 'error');
        navigateTo('/menu'); // En cas d'erreur, on renvoie au menu
    }
}
// New function to check session and show settings page
async function checkSessionAndShowSettings() {
    const response = await fetch('/check-session');
    const result = await response.json();
    if (result.loggedIn) {
        // APPEL DE NOTRE NOUVELLE FONCTION CENTRALISÉE
        updateHeaderWithUserData(result);
        
        showSettingsPage();
    } else {
        navigateTo('/login');
        showNotification('Veuillez vous connecter pour accéder aux paramètres.', 'error');
    }
}
// AJOUTEZ CETTE NOUVELLE FONCTION ET SON HELPER
function markdownToHtml(md) {
    let html = md || '';
    
    // H3: ### Sous-titre
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    // H2: ## Titre
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    // Gras: **texte**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Listes à puces: * item
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/<\/li>(\s*)<li>/g, '</li><li>'); // Corrige les espaces entre les li
    html = '<ul>' + html.replace(/<\/li><li>/g, '</li>\n<li>') + '</ul>';
    html = html.replace(/<ul>((?:.|\n)*?)<\/ul>/g, function(match, p1) {
        if (p1.trim().startsWith('<li>')) {
            return '<ul>' + p1.trim() + '</ul>';
        }
        return p1;
    });

    // Paragraphes (toute ligne qui n'est pas déjà un tag html)
    html = html.split('\n').map(line => {
        if (line.trim().length > 0 && !line.trim().startsWith('<')) {
            return `<p>${line.trim()}</p>`;
        }
        return line;
    }).join('');

    // Nettoyage final
    html = html.replace(/<p><(h[23]|ul|li)/g, '<$1');
    html = html.replace(/<\/(h[23]|ul|li)><\/p>/g, '</$1>');
    html = html.replace(/<\/ul><\/p>/g, '</ul>');
    html = html.replace(/<\/li><\/p>/g, '</li>');

    return html;
}
async function checkSessionAndShowCourse() {
    const response = await fetch('/check-session');
    const result = await response.json();
    if (!result.loggedIn) {
        navigateTo('/login');
        showToast('Session expirée', 'Veuillez vous reconnecter.', 'error');
        return;
    }

    // APPEL DE NOTRE NOUVELLE FONCTION CENTRALISÉE
    updateHeaderWithUserData(result);

    const coursePage = document.getElementById('course-page');
    const titleEl = document.getElementById('course-page-title');
    const contentEl = document.getElementById('course-content-container');
    const returnBtn = document.getElementById('course-return-menu-button');

    if (coursePage) coursePage.style.display = 'flex';
    if (returnBtn) returnBtn.addEventListener('click', () => navigateTo('/menu'));

    try {
        const courseResponse = await fetch('/api/course');
        if (!courseResponse.ok) {
            const errorData = await courseResponse.json();
            throw new Error(errorData.error);
        }
        const courseData = await courseResponse.json();
        
        if (titleEl) titleEl.textContent = `Cours : ${courseData.theme}`;
        if (contentEl) contentEl.innerHTML = markdownToHtml(courseData.content);

    } catch (error) {
        console.error('[CLIENT] Erreur chargement cours:', error);
        if (titleEl) titleEl.textContent = 'Erreur';
        if (contentEl) contentEl.innerHTML = `<p class="congrats-message error">${error.message}</p>`;
    }
}
// AJOUTEZ CETTE NOUVELLE FONCTION (par exemple, après checkSessionAndShowCourse)

/**
 * Vérifie la session et affiche la page de l'historique des cours.
 */
async function checkSessionAndShowCourseHistory() {
    const response = await fetch('/check-session');
    const result = await response.json();
    if (!result.loggedIn) {
        navigateTo('/login');
        showToast('Session expirée', 'Veuillez vous reconnecter.', 'error');
        return;
    }

    // APPEL DE NOTRE NOUVELLE FONCTION CENTRALISÉE
    updateHeaderWithUserData(result);

    const courseHistoryPage = document.getElementById('course-history-page');
    if (courseHistoryPage) courseHistoryPage.style.display = 'flex';

    const returnBtn = document.getElementById('course-history-return-menu-button');
    if (returnBtn) returnBtn.addEventListener('click', () => navigateTo('/menu'));

    const listContainer = document.getElementById('course-history-list');
    listContainer.innerHTML = '<p>Chargement de l\'historique...</p>';

    try {
        const historyResponse = await fetch('/api/course-history');
        if (!historyResponse.ok) {
            throw new Error('Impossible de charger l\'historique.');
        }
        courseHistory = await historyResponse.json();
        
        if (courseHistory.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-gray-400">Aucun cours n\'a encore été archivé.</p>';
            return;
        }

        listContainer.innerHTML = courseHistory.map(course => {
            const date = new Date(course.generatedAt);
            const formattedDate = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
            // On utilise data-theme pour stocker le thème, facile à récupérer au clic
            return `
                <div class="course-archive-item" data-theme="${course.theme}">
                    <h3 class="course-archive-title">${course.theme}</h3>
                    <p class="course-archive-date">Généré le ${formattedDate}</p>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('[CLIENT] Erreur chargement historique des cours:', error);
        showToast('Erreur', error.message, 'error');
        listContainer.innerHTML = `<p class="text-center text-red-500">${error.message}</p>`;
    }
}

function createChatContainer() {
    const chatPage = document.getElementById('chat-page');
    // Si le chat existe déjà, on ne fait rien
    if (!chatPage || document.getElementById('actual-chat-container')) {
        return;
    }

    chatContainer = document.createElement('div');
    chatContainer.id = 'actual-chat-container';
    chatContainer.className = 'chat-container full-page-chat';
    chatContainer.innerHTML = `
        <div class="chat-header">
            <h3>Chat en Direct</h3>
            <button class="icon-button close-chat-button" title="Retour">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minimize2 h-4 w-4"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" x2="21" y1="10" y2="3"></line><line x1="3" x2="10" y1="21" y2="14"></line></svg>
            </button>
        </div>
        <div class="chat-messages" id="chat-messages"></div>
        <div class="typing-indicator" id="typing-indicator"></div>
        <form id="chat-form" class="flex items-center">
            <button type="button" id="emoji-btn" title="Ouvrir les emojis">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" x2="9.01" y1="9" y2="9"></line><line x1="15" x2="15.01" y1="9" y2="9"></line></svg>
            </button>
            <input type="text" id="chat-input" placeholder="Tapez votre message..." maxlength="200" class="flex h-10 rounded-md border px-3 py-2 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm bg-black/30 border-white/20 text-white placeholder-gray-400 focus:border-primary text-sm">
            <button id="send-message" type="submit" disabled class="inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:size-4 [&amp;_svg]:shrink-0 text-primary-foreground bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send text-white"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.5 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>
            </button>
        </form>
    `;

    chatPage.appendChild(chatContainer);

    const emojiButton = document.getElementById('emoji-btn');
    if (emojiButton && emojiPicker) {
        emojiButton.addEventListener('click', () => emojiPicker.togglePicker(emojiButton));
    }
    
    document.querySelector('#actual-chat-container .close-chat-button').addEventListener('click', () => {
        const sessionNumber = parseInt(selectedSession.replace('session', ''), 10);
        // On vérifie s'il s'agit de la session de compétition ET si l'heure n'est pas encore arrivée
        if (sessionNumber === 4 && Date.now() < competitionStartTime) {
            // Si c'est trop tôt, on renvoie au menu pour ne pas voir les questions
            showToast('Compétition Verrouillée', 'Le quiz commencera à l\'heure prévue.', 'info');
            navigateTo('/menu');
        } else {
            // Sinon (autres sessions ou compétition commencée), on retourne au quiz
            navigateTo(`/quiz?session=${selectedSession}`);
        }
    });

    document.getElementById('chat-form').addEventListener('submit', (e) => { e.preventDefault(); sendChatMessage(); });
    document.getElementById('chat-input').addEventListener('input', handleTyping);
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-message');
    if (chatInput && sendButton) {
        chatInput.addEventListener('input', () => { sendButton.disabled = chatInput.value.trim().length === 0; });
        sendButton.disabled = chatInput.value.trim().length === 0;
    }
}
function setupChatStream() {
    // Ferme la connexion existante si besoin
    if (chatEventSource) {
        chatEventSource.close();
        chatEventSource = null;
    }

    // Ne pas établir de connexion si on n'est pas sur les pages concernées
    const currentPath = window.location.pathname;
    if (currentPath !== '/chat' && currentPath !== '/quiz') {
        return;
    }

    chatEventSource = new EventSource(`/chat/stream?session=${selectedSession}&lastId=${chatMessages.length > 0 ? chatMessages[chatMessages.length-1].id : 0}`);

    chatEventSource.addEventListener('open', () => {
        console.log('[CLIENT] Connexion SSE chat établie');
    });

    chatEventSource.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data);
            const isChatPage = currentPath === '/chat';
            
            if (data.type === 'init' && isChatPage) {
                const messagesContainer = document.getElementById('chat-messages');
                if (messagesContainer) messagesContainer.innerHTML = '';
                chatMessages = data.messages;
                data.messages.forEach(msg => {
                    addChatMessage(msg.username, msg.message, msg.timestamp, msg.id);
                });
            } else if (data.type === 'update') {
                // Filtre les messages déjà reçus
                const newMessages = data.messages.filter(msg => 
                    !chatMessages.some(m => m.id === msg.id)
                );
                
                if (newMessages.length > 0) {
                    chatMessages = [...chatMessages, ...newMessages];
                    
                    if (isChatPage) {
                        newMessages.forEach(msg => {
                            addChatMessage(msg.username, msg.message, msg.timestamp, msg.id);
                        });
                    } else {
                        // Notification pour les nouveaux messages reçus en arrière-plan
                        const unreadMessages = newMessages.filter(msg => 
                            msg.username !== currentUsername
                        );
                        if (unreadMessages.length > 0) {
                            showChatNotification();
                            playNotificationSound();
                        }
                    }
                }
            } else if (data.type === 'typing' && isChatPage) {
                updateTypingIndicator(data.users);
            }
        } catch (error) {
            console.error('[CLIENT] Erreur traitement message chat:', error);
        }
    });

    chatEventSource.addEventListener('error', (error) => {
        console.error('[CLIENT] Erreur connexion chat:', error);
        if (chatEventSource) {
            chatEventSource.close();
            chatEventSource = null;
        }
        
        // Reconnexion seulement si toujours sur une page concernée
        if (currentPath === '/chat' || currentPath === '/quiz') {
            setTimeout(setupChatStream, 5000);
        }
    });
}
// ====================================================================
// CORRECTION APPLIQUÉE ICI
// ====================================================================
function addChatMessage(username, message, timestamp, messageId) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;

    // Étape 1 : Vérifier si le message a DÉJÀ été traité. Si oui, on s'arrête.
    // C'est la garde la plus importante.
    if (chatMessages.includes(messageId)) {
        return;
    }

    // Étape 2 : Si c'est un nouveau message, on l'enregistre IMMÉDIATEMENT.
    chatMessages.push(messageId);

    // Étape 3 : Maintenant qu'il est enregistré, on peut créer l'élément visuel en toute sécurité.
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const messageElement = document.createElement('div');

    // Déterminer les classes CSS en fonction de l'expéditeur
    let messageClasses = 'chat-message';
    if (username === currentUsername) {
        messageClasses += ' self';
    } else if (username === 'Gemini') {
        messageClasses += ' other gemini';
    } else {
        messageClasses += ' other';
    }
    messageElement.className = messageClasses;

    // Ajouter une icône distinctive pour les messages de Gemini
    const geminiIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles gemini-icon" style="display: inline-block; vertical-align: text-bottom; margin-right: 4px;"><path d="m12 3-1.9 4.2-4.3.6 3.1 3- .7 4.2 3.8-2 3.8 2-.7-4.2 3.1-3-4.3-.6Z"></path></svg>`;

    messageElement.innerHTML = `
        <span class="chat-username">${username === 'Gemini' ? geminiIcon : ''}${username}</span>
        <span class="chat-message-text">${message}</span>
        <span class="chat-time">${time}</span>
    `;

    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
// ====================================================================
// FIN DE LA CORRECTION
// ====================================================================

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) {
    showToast('Le message ne peut pas être vide.', 'error'); // CHANGEMENT : Utilisez showToast
    return;
  }

  try {
    const response = await fetch('/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: selectedSession,
        message: message
      })
    });

    if (response.ok) {
      const result = await response.json();
      addChatMessage(currentUsername, message, new Date().toISOString(), result.messageId, false); 
      input.value = '';
      notifyTyping(false);
      document.getElementById('send-message').disabled = true;
    } else {
      const errorResult = await response.json();
      showToast(errorResult.error || 'Erreur lors de l\'envoi du message.', 'error'); // CHANGEMENT : Utilisez showToast
    }
  } catch (error) {
    console.error('[CLIENT] Erreur lors de l\'envoi du message:', error);
    showToast('Erreur réseau lors de l\'envoi du message.', 'error'); // CHANGEMENT : Utilisez showToast
  }
}

// Joue un son de notification simple
function playNotificationSound() {
    // S'assure que le contexte audio est initialisé par une action de l'utilisateur
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error("Web Audio API n'est pas supporté par ce navigateur.");
            return;
        }
    }

    // Reprend le contexte s'il a été suspendu par le navigateur
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    // Crée un son "bip" simple
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine'; // Type d'onde sonore
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime); // Fréquence (hauteur du son)
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Volume (faible pour ne pas être gênant)

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1); // Durée du "bip" (0.1 seconde)
}

// MODIFIÉ : Logique de frappe simplifiée
function handleTyping() {
    const chatInput = document.getElementById('chat-input');
    // Le client envoie simplement l'état actuel (en train d'écrire ou non)
    // Le serveur gérera le timeout.
    if (chatInput && chatInput.value.trim().length > 0) {
        notifyTyping(true);
    } else {
        notifyTyping(false);
    }
}
// REMPLACEZ LA FONCTION setupUserNotificationStream EXISTANTE PAR CELLE-CI :
function setupUserNotificationStream() {
    // Si une connexion existe déjà, on ne fait rien pour éviter les doublons
    if (userNotificationEventSource) {
      return;
    }
  
    console.log('[CLIENT] Tentative de connexion au canal de notifications utilisateur.');
    
    // Ouvre la connexion au nouveau flux SSE
    userNotificationEventSource = new EventSource('/api/user-notifications');
  
    // Crée un écouteur spécifique pour l'événement 'account-reset' que nous avons défini côté serveur
    userNotificationEventSource.addEventListener('account-reset', (event) => {
      console.log('[CLIENT] Notification de réinitialisation reçue !', event.data);
      
      // Affiche une notification claire à l'utilisateur
      showToast(
        'Action de l\'Administrateur',
        'Votre compte a été réinitialisé. La page va maintenant s\'actualiser.',
        'error', // 'error' pour une couleur rouge qui attire l'attention
        3800     // Durée de 3.8 secondes (un peu moins que le délai de redirection)
      );
  
      // Arrête toutes les autres connexions temps réel pour éviter les erreurs
      if (leaderboardEventSource) leaderboardEventSource.close();
      if (chatEventSource) chatEventSource.close();
      if (sessionStatusEventSource) sessionStatusEventSource.close();
  
      // ====================================================================
      // ===                 CORRECTION DU BUG D'AFFICHAGE                ===
      // ====================================================================
      // Attend 4 secondes pour que l'utilisateur puisse lire le message, PUIS recharge la page VERS le menu.
      // `window.location.href` est une redirection "dure" qui assure que la page
      // est entièrement rechargée avec les nouvelles données serveur, évitant ainsi le bug d'affichage.
      setTimeout(() => {
        window.location.href = '/menu';
      }, 4000);
    });
  
    // Gère les erreurs de connexion
    userNotificationEventSource.onerror = (error) => {
      console.error('[CLIENT] Erreur de connexion au canal de notifications. Nouvelle tentative dans 10s.', error);
      userNotificationEventSource.close();
      userNotificationEventSource = null; // Important pour permettre la reconnexion
      setTimeout(setupUserNotificationStream, 10000); // Tente de se reconnecter après 10 secondes
    };
  }
async function notifyTyping(isTyping) {
    if (!currentUsername) {
        return;
    }
    try {
        await fetch('/chat/typing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session: selectedSession,
                isTyping: isTyping
            })
        });
    } catch (error) {
        console.error('[CLIENT] Erreur lors de la notification de frappe:', error);
    }
}

function showChatNotification() {
    const floatingButton = document.getElementById('floating-chat-button');
    if (floatingButton) {
        floatingButton.classList.add('new-message-indicator');
    }
}

function updateTypingIndicator(typingUsers) {
    const typingIndicatorElement = document.getElementById('typing-indicator');
    if (!typingIndicatorElement) return;

    const otherTypingUsers = typingUsers.filter(user => user !== currentUsername && user !== 'Gemini');

    if (otherTypingUsers.length > 0) {
        let message = '';
        if (otherTypingUsers.length === 1) {
            message = `${otherTypingUsers[0]} est en train d'écrire...`;
        } else if (otherTypingUsers.length === 2) {
            message = `${otherTypingUsers[0]} et ${otherTypingUsers[1]} sont en train d'écrire...`;
        } else {
            message = 'Plusieurs personnes sont en train d\'écrire...';
        }
        typingIndicatorElement.textContent = message;
        typingIndicatorElement.classList.add('visible');
    } else {
        typingIndicatorElement.classList.remove('visible');
    }
}
// New: Settings functions
function loadSettings() {
    const savedTheme = localStorage.getItem('theme');
    const savedFontSize = localStorage.getItem('fontSize');
    const savedFontFamily = localStorage.getItem('fontFamily');
    const savedUIDesign = localStorage.getItem('uiDesign');

    if (savedTheme) {
        currentTheme = savedTheme;
        applyTheme(savedTheme, false); // Apply without saving again
    } else {
        applyTheme(currentTheme, true); // Apply default and save it
    }

    if (savedFontSize) {
        currentFontSize = savedFontSize;
        applyFontSize(savedFontSize, false); // Apply without saving again
    } else {
        applyFontSize(currentFontSize, true); // Apply default and save it
    }

    if (savedFontFamily) {
        currentFontFamily = savedFontFamily;
        applyFontFamily(savedFontFamily, false); // Apply without saving again
    } else {
        applyFontFamily(currentFontFamily, true); // Apply default and save it
    }

    if (savedUIDesign) {
        currentUIDesign = savedUIDesign;
        applyUIDesign(savedUIDesign, false); // Apply without saving again
    } else {
        currentUIDesign = 'default';
        applyUIDesign(currentUIDesign, true); // Apply default and save it
    }
}

function applyTheme(themeName, save = true) {
    const body = document.body;
    // Remove existing theme classes (any class starting with 'theme-')
    Array.from(body.classList).forEach(cls => {
        if (cls.startsWith('theme-')) body.classList.remove(cls);
    });
    // Add the new theme class
    body.classList.add(`theme-${themeName}`);
    currentTheme = themeName;
    if (save) {
        localStorage.setItem('theme', themeName);
    }
    // Update radio button state
    const themeRadio = document.getElementById(`theme-${themeName}`);
    if (themeRadio) {
        themeRadio.checked = true;
    }
}

function applyFontSize(sizeName, save = true) {
    const body = document.body;
    // Remove existing font size classes
    body.classList.remove('font-small', 'font-medium', 'font-large');
    // Add the new font size class
    body.classList.add(`font-${sizeName}`);
    currentFontSize = sizeName;
    if (save) {
        localStorage.setItem('fontSize', sizeName);
    }
    // Update radio button state
    const fontSizeRadio = document.getElementById(`font-${sizeName}`);
    if (fontSizeRadio) {
        fontSizeRadio.checked = true;
    }
}

function applyFontFamily(familyName, save = true) {
    const body = document.body;
    // Remove existing font family classes
    body.classList.remove('font-poppins', 'font-arial', 'font-times', 'font-georgia', 'font-roboto', 'font-open-sans', 'font-cool-jazz', 'font-choco-cooky', 'font-rosemary', 'font-samsung-sharp', 'font-samsung-one', 'font-condensed');
    // Add the new font family class
    body.classList.add(`font-${familyName}`);
    currentFontFamily = familyName;
    if (save) {
        localStorage.setItem('fontFamily', familyName);
    }
    // Update radio button state
    const fontFamilyRadio = document.getElementById(`font-${familyName}`);
    if (fontFamilyRadio) {
        fontFamilyRadio.checked = true;
    }
    
    // Restore username if it was overwritten
    const greetingUsernameEl = document.getElementById('greeting-username');
    if (greetingUsernameEl) {
        const originalUsername = greetingUsernameEl.getAttribute('data-original-username');
        if (originalUsername && greetingUsernameEl.textContent !== originalUsername) {
            greetingUsernameEl.textContent = originalUsername;
            greetingUsernameEl.setAttribute('data-i18n-skip', 'true');
        }
    }
    
    // Debug log
    console.log(`[DEBUG] Font family changed to: ${familyName}, body classes:`, Array.from(body.classList));
}

function applyUIDesign(designName, save = true) {
    const body = document.body;
    // Remove existing UI design classes
    body.classList.remove('design-default', 'design-gamer', 'design-dev', 'design-duolingo', 'design-app');
    // Add the new UI design class
    body.classList.add(`design-${designName}`);
    currentUIDesign = designName;
    if (save) {
        localStorage.setItem('uiDesign', designName);
    }
    // Update radio button state
    const uiDesignRadio = document.getElementById(`design-${designName}`);
    if (uiDesignRadio) {
        uiDesignRadio.checked = true;
    }
    
    // Debug log
    console.log(`[DEBUG] UI design changed to: ${designName}, body classes:`, Array.from(body.classList));
}

function showSettingsPage() {
    const settingsPage = document.getElementById('settings-page');
    if (settingsPage) {
        settingsPage.style.display = 'flex';
        // Ensure controls reflect current settings when page is shown
        applyTheme(currentTheme, false);
        applyFontSize(currentFontSize, false);
        applyFontFamily(currentFontFamily, false);
        applyUIDesign(currentUIDesign, false);

        // Add event listeners for theme change
        document.querySelectorAll('input[name="theme"]').forEach(radio => {
            radio.onchange = (e) => applyTheme(e.target.value);
        });

        // Add event listeners for font size change
        document.querySelectorAll('input[name="font-size"]').forEach(radio => {
            radio.onchange = (e) => applyFontSize(e.target.value);
        });

        // Add event listeners for font family change
        const fontFamilyRadios = document.querySelectorAll('input[name="font-family"]');
        console.log(`[DEBUG] Found ${fontFamilyRadios.length} font family radio buttons`);
        fontFamilyRadios.forEach((radio, index) => {
            console.log(`[DEBUG] Radio ${index}: id=${radio.id}, value=${radio.value}`);
            radio.onchange = (e) => {
                console.log(`[DEBUG] Font family radio clicked: ${e.target.value}`);
                applyFontFamily(e.target.value);
            };
        });

        // Add event listeners for UI design change
        const uiDesignRadios = document.querySelectorAll('input[name="ui-design"]');
        uiDesignRadios.forEach(radio => {
            radio.onchange = (e) => {
                console.log(`[DEBUG] UI design radio clicked: ${e.target.value}`);
                applyUIDesign(e.target.value);
            };
        });

        // Add event listener for return to menu button
        const settingsReturnMenuButton = document.getElementById('settings-return-menu-button');
        if (settingsReturnMenuButton) {
            settingsReturnMenuButton.addEventListener('click', () => navigateTo('/menu'));
        }

        // Initialize avatar settings section
        initAvatarSettings();
    }
}

// Setup language change handlers
function setupLanguageHandlers() {
    const languageRadios = document.querySelectorAll('input[name="language"]');
    
    // Set current language
    const currentLang = i18n.getCurrentLanguage();
    const currentRadio = document.getElementById(`language-${currentLang}`);
    if (currentRadio) {
        currentRadio.checked = true;
    }
    
    // Add change listeners
    languageRadios.forEach(radio => {
        radio.addEventListener('change', async (e) => {
            if (e.target.checked) {
                const newLanguage = e.target.value;
                await i18n.setLanguage(newLanguage);
                
                // Update dynamic content that uses functions
                updateDynamicContent();
                
                // Update document title
                document.title = i18n.t('app.title');
                
                // Show notification
                showNotification(
                    newLanguage === 'fr' ? 
                    'Langue changée vers le français' : 
                    'Language changed to English'
                );
            }
        });
    });
}

// Update content that uses functions instead of static data-i18n attributes
function updateDynamicContent() {
    // Update hint button text
    const hintButton = document.getElementById('hint-button');
    if (hintButton) {
        hintButton.innerHTML = `💡 ${i18n.t('game.getHint')} (${i18n.t('game.hintCost')})`;
    }
    
    // Update timer display
    const timer = document.getElementById('timer');
    if (timer) {
        const timeText = timer.textContent.match(/\d+/);
        const seconds = timeText ? timeText[0] : '0';
        timer.innerHTML = `<span data-i18n="game.time">${i18n.t('game.time')}</span> : ${seconds}s`;
    }
    
    // Update greeting username if it's the default
    const greetingUsername = document.getElementById('greeting-username');
    if (greetingUsername && greetingUsername.textContent === 'Utilisateur') {
        greetingUsername.textContent = i18n.t('greeting.user');
    }
    
    // Refresh session list if visible
    const sessionList = document.getElementById('session-list');
    if (sessionList && sessionList.children.length > 0) {
        // Re-render the session selection if it's currently displayed
        const songSelection = document.getElementById('song-selection');
        if (songSelection && songSelection.style.display === 'block') {
            showSongSelection();
        }
    }
}

// (supprimé) Ancienne implémentation du flux SSE pour éviter les doublons

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n system first
    await i18n.init();
    
    // Initialize network monitoring
    networkMonitor = new NetworkMonitor();
    console.log('[CLIENT] NetworkMonitor initialisé');
    
    detectDevice();
    setupMenuAutoClose();
    loadSettings();
    
    // Setup language change handlers
    setupLanguageHandlers();

    // Initialisation du picker d'emojis
    try {
        emojiPicker = new EmojiButton({
            position: 'top-end',
            autoHide: true,
        });
        
        emojiPicker.on('emoji', selection => {
            const chatInput = document.getElementById('chat-input');
            const sendButton = document.getElementById('send-message');
            if (chatInput) {
                chatInput.value += selection.emoji;
                chatInput.focus();
                if (sendButton) sendButton.disabled = false;
            }
        });
        console.log('[CLIENT] SUCCÈS : Le picker a été créé.');
    } catch(e) {
        console.error('[CLIENT] ÉCHEC CRITIQUE : Impossible d\'initialiser EmojiButton.', e);
    }
    
    updateView();
    window.addEventListener('popstate', updateView);

    // Initialisation du contexte audio
    document.body.addEventListener('click', () => {
        if (!audioContext) {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.error("Web Audio API n'est pas supporté dans ce navigateur.");
            }
        }
    }, { once: true });

    // Gestion du menu déroulant
    const menuToggle = document.getElementById('menu-toggle');
    const dropdownMenu = document.getElementById('dropdown-menu');
    if (menuToggle && dropdownMenu) {
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('active');
            dropdownMenu.classList.toggle('active');
        });
    }

    // ==========================================================
    // ===                 CORRECTION APPLIQUÉE ICI           ===
    // ==========================================================
    // On déclare tous les liens du menu pour plus de clarté.
    const returnToMenuLink = document.getElementById('return-Menu');
    const howToPlayLink = document.getElementById('how-to-play-link');
    const courseLink = document.getElementById('course-link');
    const courseHistoryLink = document.getElementById('course-history-link'); // <-- Le sélecteur était manquant
    const livresLink = document.getElementById('livres-link'); 
    const historyLink = document.getElementById('history-link');
    const settingsLink = document.getElementById('settings-link');
    const logoutLink = document.getElementById('logout-link');

    // On attache les écouteurs d'événements à chaque lien.
    if (returnToMenuLink) returnToMenuLink.addEventListener('click', (e) => { e.preventDefault(); navigateTo('/menu'); });
    if (courseLink) courseLink.addEventListener('click', (e) => { e.preventDefault(); navigateTo('/course'); });
    if (courseHistoryLink) courseHistoryLink.addEventListener('click', (e) => { e.preventDefault(); navigateTo('/course-history'); }); // <-- L'écouteur était manquant
    if (livresLink) livresLink.addEventListener('click', (e) => { e.preventDefault(); navigateTo('/livres'); });
    if (historyLink) historyLink.addEventListener('click', (e) => { e.preventDefault(); navigateTo('/history'); });
    if (settingsLink) settingsLink.addEventListener('click', (e) => { e.preventDefault(); navigateTo('/settings'); });
    if (logoutLink) logoutLink.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    
    // Logique du modal "Comment Jouer"
    const howToPlayModal = document.getElementById('how-to-play-modal');
    const closeHowToPlayModal = document.getElementById('close-how-to-play-modal');

    if (howToPlayLink && howToPlayModal) {
        howToPlayLink.addEventListener('click', (e) => {
            e.preventDefault();
            howToPlayModal.style.display = 'flex';
            if (menuToggle && dropdownMenu) {
                menuToggle.classList.remove('active');
                dropdownMenu.classList.remove('active');
            }
        });
    }

    const closeModalFunction = () => {
        if (howToPlayModal) {
            howToPlayModal.style.display = 'none';
        }
    };

    if (closeHowToPlayModal) {
        closeHowToPlayModal.addEventListener('click', closeModalFunction);
    }
    if (howToPlayModal) {
        howToPlayModal.addEventListener('click', (e) => {
            if (e.target === howToPlayModal) {
                closeModalFunction();
            }
        });
    }
    
    // Bouton de chat flottant
    const floatingChatButton = document.getElementById('floating-chat-button');
    if (floatingChatButton) floatingChatButton.addEventListener('click', () => navigateTo('/chat'));

    // Initialisation du stream de statut utilisateur
    setupUserStatusStream(); 

    // Écouteur pour les clics sur les cours archivés
    const courseHistoryList = document.getElementById('course-history-list');
    if (courseHistoryList) {
        courseHistoryList.addEventListener('click', e => {
            const courseItem = e.target.closest('.course-archive-item');
            if (courseItem) {
                const theme = courseItem.dataset.theme;
                const selectedCourse = courseHistory.find(c => c.theme === theme);
                if (selectedCourse) {
                    displayCourseInModal(selectedCourse);
                }
            }
        });
    }
});

// NOUVELLE FONCTION : Gère le flux SSE des mises à jour de statut utilisateur
function setupUserStatusStream() {
    if (userStatusEventSource) {
        userStatusEventSource.close();
        userStatusEventSource = null;
    }

    userStatusEventSource = new EventSource('/api/user-status-stream');

    userStatusEventSource.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
            console.log('[CLIENT] Connecté au flux de statut utilisateur.');
        } else if (data.type === 'force_logout') {
            try { showToast(i18n.t('session.forceLogoutTitle'), i18n.t('session.forceLogoutMessage')); } catch (_) {}
            try { await fetch('/logout', { method: 'POST' }); } catch (_) {}
            window.location.href = '/login';
        }
    };

    // --- NOUVEL ÉCOUTEUR D'ÉVÉNEMENT ---
    userStatusEventSource.addEventListener('competition-over', (event) => {
        console.log('[CLIENT] ÉVÉNEMENT REÇU : La compétition est terminée !', event.data);
        showToast('Compétition Terminée !', 'Le nombre maximum de gagnants a été atteint. Affichage des résultats...', 'info', 5000);
        
        // Attendre 2 secondes pour que l'utilisateur lise le message, puis afficher l'écran final.
        setTimeout(showGameOverScreen, 2000);
    });

    userStatusEventSource.onerror = (error) => {
        console.error('[CLIENT] Erreur de connexion au flux de statut utilisateur:', error);
        userStatusEventSource.close();
        userStatusEventSource = null;
        setTimeout(setupUserStatusStream, 5000);
    };
}

async function returnToMenu() {
    try {
        // Désactiver le mode correction d'erreurs si actif
        if (isErrorReplay) {
            console.log('[DEBUG] Retour au menu - désactivation du mode correction d\'erreurs');
            isErrorReplay = false;
        }
        
        const response = await fetch('/reset-score', { method: 'POST' });
        const result = await response.json();
        if (result.message) {
            showToast('Retour au menu', 'Votre score pour cette session a été réinitialisé.', 'info');
            navigateTo('/menu'); // CORRECTION : Redirection immédiate
        } else {
            showToast('Erreur', 'Impossible de réinitialiser le score.', 'error');
        }
    } catch (error) {
        console.error('[CLIENT] Erreur lors de la réinitialisation du score :', error);
        showToast('Erreur réseau', 'Une erreur est survenue lors de la communication avec le serveur.', 'error');
    }
}
// Remplacez votre fonction fetchQuestions par celle-ci

async function fetchQuestions() {
    try {
      const response = await fetch(`/questions?session=${selectedSession}`);
      
      // === LA CORRECTION EST ICI ===
      // Si la réponse n'est pas un succès (ex: 403 Interdit, 404 Non trouvé, etc.)
      if (!response.ok) {
        // On récupère le message d'erreur envoyé par le serveur
        const errorData = await response.json();
        
        // On affiche ce message à l'utilisateur dans un "toast"
        showToast('Accès Verrouillé', errorData.error, 'error');
        
        // On le redirige vers le menu principal
        navigateTo('/menu');
        
        // Très important : on arrête l'exécution de la fonction ici
        return; 
      }
      
      // Si tout va bien, le code continue comme avant
      questions = await response.json();
      totalQuestions = questions.length;
      answeredQuestionsCount = 0;
      if (questions.length > 0) {
        updateProgress();
        nextQuestion();
      } else {
        // Cela peut arriver si l'utilisateur a déjà terminé toutes les questions de la session
        endQuiz(); 
      }
    } catch (error) {
      // Ce bloc gère maintenant principalement les erreurs réseau (serveur inaccessible)
      console.error('[CLIENT] Erreur réseau lors du chargement des questions :', error);
      showToast('Erreur Réseau', 'Impossible de contacter le serveur.', 'error');
      navigateTo('/menu');
    }
}

  function updateProgress() {
    // Mise à jour de la barre de progression (logique existante)
    const progress = totalQuestions > 0 ? (answeredQuestionsCount / totalQuestions) * 100 : 0;
    const progressBar = document.querySelector('.progress');
    if (progressBar) progressBar.style.width = `${progress}%`;

    // NOUVELLE LOGIQUE : Mise à jour du compteur de question
    const counterDisplay = document.getElementById('question-counter-display');
    if (counterDisplay) {
        if (totalQuestions > 0) {
            // Affiche "Question X / Y"
            counterDisplay.textContent = `Question ${answeredQuestionsCount} / ${totalQuestions}`;
        } else {
            // Efface le texte s'il n'y a pas de questions
            counterDisplay.textContent = '';
        }
    }
}

function startTimer() {
    startTime = Date.now();
    const timer = document.getElementById('timer');
    if (timer) {
        timer.classList.remove('countdown-animation');
    }
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (timer) {
            timer.textContent = `Temps : ${elapsed}s`;
            if (elapsed >= 20 && elapsed < 30) {
                timer.classList.add('countdown-animation');
            } else {
                timer.classList.remove('countdown-animation');
            }
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    const timer = document.getElementById('timer');
    if (timer) {
        timer.classList.remove('countdown-animation');
    }
    return Math.floor((Date.now() - startTime) / 1000);
}

async function retrySession() {
    try {
        const response = await fetch('/reset-session-attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: selectedSession })
        });

        if (!response.ok) {
            throw new Error('La réinitialisation de la session a échoué.');
        }

        showToast('Nouvelle tentative !', 'Bonne chance pour ce nouvel essai.', 'info');
        // On redirige directement vers le quiz pour le rejouer
        navigateTo(`/quiz?session=${selectedSession}`);

    } catch (error) {
        console.error('[CLIENT] Erreur lors de la nouvelle tentative de session :', error);
        showToast('Erreur', 'Impossible de redémarrer la session.', 'error');
    }
}
async function endQuiz() {
    stopTimer();
    const gameContent = document.querySelector('.game-content');
    const totalQuizQuestions = totalQuestions;

    // Si on était en mode correction d'erreurs, on désactive le flag et on évite le déblocage
    if (isErrorReplay) {
        console.log('[DEBUG] Fin du mode correction d\'erreurs - pas de validation de session');
        isErrorReplay = false;
        
        // Afficher directement les résultats sans valider la session
        const resultsHTML = `
            <h2>Correction d'erreurs terminée !</h2>
            <p class="congrats-message">Vous avez terminé la révision de vos erreurs.</p>
            <div class="result-card">
                <div class="result-item">
                    <span class="result-value">${quizResults.correctAnswersCount}/${totalQuizQuestions}</span>
                    <span class="result-label">Questions corrigées</span>
                </div>
            </div>
            <div class="quiz-actions">
                <button id="return-menu-button" class="button-primary">Retour au Menu</button>
                <button id="errors-return-button" class="button-secondary">Voir mes erreurs</button>
            </div>
        `;
        
        if (gameContent) {
            gameContent.innerHTML = `<div class="quiz-results">${resultsHTML}</div>`;
        }
        
        const returnMenuBtn = document.getElementById('return-menu-button');
        const errorsReturnBtn = document.getElementById('errors-return-button');
        
        if (returnMenuBtn) returnMenuBtn.addEventListener('click', returnToMenu);
        if (errorsReturnBtn) errorsReturnBtn.addEventListener('click', () => navigateTo('/history'));
        
        return; // Sortir de la fonction sans appeler /end-quiz-session
    }

    if (gameContent) gameContent.innerHTML = `<div class="quiz-results"><h2>Validation de la session...</h2></div>`;

    try {
        // << CORRECTION APPLIQUÉE ICI >>
        // On commence par récupérer les données les plus fraîches de l'utilisateur.
        const userResponseCheck = await fetch('/check-session');
        const latestUserData = await userResponseCheck.json();
        const scoresForThisSession = latestUserData.scores.filter(s => s.session === selectedSession);
        // On calcule le nombre de bonnes réponses DEPUIS les données fiables du serveur.
        const reliableCorrectAnswers = scoresForThisSession.filter(s => s.score > 0).length;

        // Maintenant, on envoie cette valeur fiable au serveur pour validation.
        const endSessionResponse = await fetch('/end-quiz-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session: selectedSession,
                correctAnswers: reliableCorrectAnswers, // On utilise la valeur fiable
                totalQuestions: totalQuizQuestions
            })
        });

        if (!endSessionResponse.ok) {
            throw new Error("La validation de la session a échoué.");
        }
        const endSessionResult = await endSessionResponse.json();
        
        // On récupère une dernière fois les données pour être sûr d'avoir le statut "completedSessions" à jour.
        const userResponse = await fetch('/check-session');
        const userData = await userResponse.json();

        const sessionScores = userData.scores.filter(s => s.session === selectedSession);
        const finalCorrectAnswers = sessionScores.filter(s => s.score > 0).length;

        const alreadyCompleted = Array.isArray(endSessionResult.completedSessions) && endSessionResult.completedSessions.includes(selectedSession);
        const sessionCompleted = endSessionResult.completed || alreadyCompleted;

        const rankResponse = await fetch(`/user-ranking?session=${selectedSession}`);
        const { rank } = await rankResponse.json();

        let titleHTML = '<h2>Quiz Terminé</h2>';
        let messageHTML = '';
        let buttonHTML = '';
        
        const currentSessionNumber = parseInt(selectedSession.replace('session', ''));

        if (sessionCompleted) {
            if (currentSessionNumber >= 10) {
                titleHTML = `<h2>🏁 Compétition Terminée ! 🏁</h2>`;
                messageHTML = `<p class="congrats-message success">Vous avez bravé tous les défis ! Félicitations, ${currentUsername} !</p>`;
                buttonHTML = `<button id="return-menu-button" class="button-primary">Retour au Menu Principal</button>`;
            } else {
                const nextSessionNumber = currentSessionNumber + 1;
                titleHTML = `<h2>Session ${currentSessionNumber} Réussie !</h2>`;
                messageHTML = `<p class="congrats-message success">Excellent travail, ${currentUsername} ! La Session ${nextSessionNumber} est débloquée.</p>`;
                buttonHTML = `<button id="continue-button" class="button-primary">Session Suivante</button>`;
                if (currentSessionNumber <= 3) {
                    buttonHTML += `<button id="retry-button" class="button-secondary">Rejouer</button>`;
                }
            }
        } else {
            if (currentSessionNumber >= 10) {
                messageHTML = `<p class="congrats-message error">Presque ! Il vous faut 70% de bonnes réponses pour terminer le jeu.</p>`;
            } else {
                messageHTML = `<p class="congrats-message error">Presque ! Il vous faut 70% de bonnes réponses pour débloquer la suite.</p>`;
            }
            buttonHTML = `<button id="retry-button" class="button-primary">Réessayer</button>`;
        }

        const resultsHTML = `
            ${titleHTML}
            ${messageHTML}
            <div class="result-card">
                <div class="result-item">
                    <span class="result-value">${finalCorrectAnswers}/${totalQuizQuestions}</span>
                    <span class="result-label">Bonnes Réponses</span>
                </div>
                <div class="result-item">
                    <span class="result-value">#${rank}</span>
                    <span class="result-label">Classement</span>
                </div>
                <div class="result-item">
                    <span class="result-value">${userData.coins} 💰</span>
                    <span class="result-label">Pièces Totales</span>
                </div>
            </div>
            <div class="quiz-actions">
                ${buttonHTML}
                <button id="show-analysis-button" class="button-secondary">Voir l'analyse personnalisée</button>
            </div>
        `;
        
        if (gameContent) {
            gameContent.innerHTML = `<div class="quiz-results">${resultsHTML}</div>`;
        }

        const continueBtn = document.getElementById('continue-button');
        const returnMenuBtn = document.getElementById('return-menu-button');
        const retryBtn = document.getElementById('retry-button');
        
        if (continueBtn) continueBtn.addEventListener('click', returnToMenu);
        if (returnMenuBtn) returnMenuBtn.addEventListener('click', returnToMenu);
        if (retryBtn) retryBtn.addEventListener('click', retrySession);
        
        document.getElementById('show-analysis-button').addEventListener('click', showAnalysisModal);

    } catch (error) {
        console.error('[CLIENT] Erreur lors de l\'affichage des résultats:', error);
        if (gameContent) {
            gameContent.innerHTML = `<div class="quiz-results"><p>Erreur lors de l'affichage des résultats.</p><button id="return-menu-button">Retour au menu</button></div>`;
            document.getElementById('return-menu-button').addEventListener('click', returnToMenu);
        }
    }
}
async function showAnalysisModal() {
    const existingModal = document.getElementById('analysis-modal');
    if (existingModal) {
        existingModal.remove();
    }

    const modalDiv = document.createElement('div');
    modalDiv.id = 'analysis-modal';
    modalDiv.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] modal-enter';
    
    modalDiv.innerHTML = `
        <div class="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto custom-scrollbar">
            <h2 id="analysis-modal-title" class="text-2xl font-bold mb-6 text-cyan-400 text-center">Analyse Personnalisée</h2>
            <div id="gemini-analysis-content" class="text-lg text-gray-200 leading-relaxed whitespace-pre-wrap border-t border-b border-gray-700 py-4 my-4">
                <p>🤖 Chargement de votre analyse par l'IA, veuillez patienter...</p>
            </div>
            <button id="close-analysis-modal" class="mt-6 w-full p-3 rounded-lg button-gradient text-white font-bold hover:opacity-90 transition-opacity">Fermer</button>
        </div>
    `;

    document.body.appendChild(modalDiv);

    const closeModal = () => {
        modalDiv.classList.add('modal-leave');
        setTimeout(() => modalDiv.remove(), 300);
    };

    modalDiv.querySelector('#close-analysis-modal').addEventListener('click', closeModal);
    
    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: selectedSession })
        });
        
        const analysisContentEl = modalDiv.querySelector('#gemini-analysis-content');
        const analysisTitleEl = modalDiv.querySelector('#analysis-modal-title');

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erreur du serveur (code: ${response.status})`);
        }

        const data = await response.json();

        if (analysisContentEl) {
            analysisContentEl.innerHTML = `<p>${data.analysis}</p>`;
        }
        if (analysisTitleEl) {
            analysisTitleEl.textContent = "✅ Analyse terminée !";
        }

    } catch (error) {
        console.error("Erreur lors de l'affichage de l'analyse :", error);
        
        const errorContentEl = modalDiv.querySelector('#gemini-analysis-content');
        const errorTitleEl = modalDiv.querySelector('#analysis-modal-title');
        
        if (errorTitleEl) {
            errorTitleEl.textContent = "❌ Erreur d'analyse";
            errorTitleEl.style.color = 'var(--color-error)';
        }
        if (errorContentEl) {
            errorContentEl.innerHTML = `<p class="font-bold">Désolé, une erreur est survenue :</p><p class="mt-2 text-red-300 bg-red-900/50 p-2 rounded">${error.message}</p>`;
        }
    }
}
async function nextQuestion() {
    const gameContent = document.querySelector('.game-content');
    if (gameContent) {
        gameContent.classList.add('question-slide-out');
    }

    setTimeout(async () => {
        try {
            let questionToShow = null;

            // ==========================================================
            // ===             CORRECTION DU BUG APPLIQUÉE ICI        ===
            // ==========================================================
            // On vérifie si on est en mode "Rejouer les erreurs".
            if (isErrorReplay) {
                // Si OUI, on prend la prochaine question depuis la liste LOCALE
                // qui a été préparée par startReplayErrorQuestions().
                if (questions.length > 0) {
                    questionToShow = questions.shift(); // On dépile la question suivante.
                }
            } else {
                // Si NON (mode quiz normal), on contacte le SERVEUR pour la prochaine question.
                const response = await fetch(`/questions?session=${selectedSession}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    showToast('Erreur Quiz', errorData.error || 'Impossible de charger la question.', 'error');
                    navigateTo('/menu');
                    return;
                }
                questionToShow = await response.json(); // Le serveur renvoie la question ou null.
            }

            // Si, à la fin, nous n'avons aucune question à afficher (soit parce que la liste est vide,
            // soit parce que le serveur a renvoyé null), alors le quiz est terminé.
            if (!questionToShow) {
                endQuiz();
                return;
            }
            // ==========================================================
            
            // On met à jour la question actuelle et on continue l'affichage normalement.
            currentQuestion = questionToShow;
            answeredQuestionsCount++;
            updateProgress();
            
            // Le reste de la logique pour afficher la question est inchangée.
            const feedback = document.getElementById('feedback');
            const correctTranslation = document.getElementById('correct-translation');
            const explanationDiv = document.getElementById('answer-explanation');
            const options = document.getElementById('options');
            const continueControls = document.getElementById('continue-controls');
            
            if (feedback) feedback.textContent = '';
            if (correctTranslation) correctTranslation.textContent = '';
            if (explanationDiv) {
                explanationDiv.textContent = '';
                explanationDiv.style.display = 'none';
            }
            if (continueControls) continueControls.style.display = 'none';
            
            const questionDiv = document.getElementById('question');
            if (questionDiv) {
                let questionHTML = `<div class="text-question"><p>${currentQuestion.text}</p></div>`;
                if (currentQuestion.englishHint) {
                    questionHTML += `<div class="english-hint-container">${currentQuestion.englishHint}</div>`;
                }
                questionDiv.innerHTML = questionHTML;
            }
            
            const shuffledOptions = shuffleArray(currentQuestion.options);
            const optionsContainer = document.getElementById('options');
            if (optionsContainer) {
                optionsContainer.innerHTML = shuffledOptions.map((option, index) => `<button class="option-btn" data-option="${index}">${option}</button>`).join('');
                document.querySelectorAll('.option-btn').forEach(button => {
                    button.addEventListener('click', () => {
                        const optionIndex = button.getAttribute('data-option');
                        const selectedOption = shuffledOptions[optionIndex];
                        submitAnswer(selectedOption);
                    });
                });
            }

            startTimer();
            if (gameContent) {
                gameContent.classList.remove('question-slide-out');
                gameContent.classList.add('question-slide-in');
                gameContent.addEventListener('animationend', () => {
                    gameContent.classList.remove('question-slide-in');
                }, { once: true });
            }

        } catch (error) {
            console.error("Erreur lors du chargement de la question suivante:", error);
            showToast("Erreur Critique", "Une erreur est survenue.", "error");
            navigateTo('/menu');
        }
    }, 500);
}
// Remplacez votre fonction updatePlayerStats par celle-ci

function updatePlayerStats(xp, level, streakCount, coins, competitionCoins) {
    const xpDisplay = document.getElementById('xp-display');
    const levelDisplay = document.getElementById('level-display');
    const streakDisplay = document.getElementById('streak-display');
    const coinsDisplay = document.getElementById('coins-display');
    
    if (xpDisplay) xpDisplay.textContent = xp;
    if (levelDisplay) levelDisplay.textContent = level;
    if (streakDisplay) streakDisplay.textContent = `${streakCount} jours`;

    // << NOUVELLE LOGIQUE D'AFFICHAGE DES PIÈCES >>
    if (coinsDisplay) {
        const sessionNumber = parseInt(selectedSession.replace('session', ''), 10);
        if (sessionNumber <= 3) {
            // Dans les sessions d'entraînement, on affiche les pièces d'entraînement
            coinsDisplay.textContent = coins;
        } else {
            // Dans les sessions de compétition, on affiche les pièces de compétition
            coinsDisplay.textContent = competitionCoins;
        }
    }
}

function displayAchievementNotification(achievementName) {
    const notificationElement = document.getElementById('achievement-notification');
    if (notificationElement) {
        notificationElement.textContent = `Succès débloqué : ${achievementName} !`;
        notificationElement.style.display = 'block';
        notificationElement.classList.remove('fadeOutUp');
        void notificationElement.offsetWidth;
        notificationElement.classList.add('fadeOutUp');
        setTimeout(() => {
            notificationElement.style.display = 'none';
        }, 5000);
    }
}
async function submitAnswer(selectedOption) {
    const feedback = document.getElementById('feedback');
    const correctTranslation = document.getElementById('correct-translation');
    const optionsContainer = document.getElementById('options');
    const optionButtons = optionsContainer.querySelectorAll('.option-btn');

    // Cache la zone d'indices et désactive immédiatement les boutons pour empêcher les doubles clics
    const hintControls = document.getElementById('hint-controls');
    if (hintControls) hintControls.style.display = 'none';
    optionButtons.forEach(button => {
      button.disabled = true;
      button.classList.remove('correct', 'incorrect');
    });

    const timeTaken = stopTimer();

    try {
        const response = await fetch('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              questionId: currentQuestion.id,
              answer: selectedOption,
              timeTaken,
              session: selectedSession,
              isErrorReplay: isErrorReplay // Ajouter le flag pour identifier le mode erreur
            }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Erreur réseau: ${errorData.error || response.statusText}`);
        }
      
        const result = await response.json();
        // Stylise maintenant les boutons en fonction de la réponse du serveur
        optionButtons.forEach(button => {
          const optionText = button.textContent;
          if (optionText === result.correctAnswer) button.classList.add('correct');
          else if (optionText === selectedOption && !result.isCorrect) button.classList.add('incorrect');
        });

        // Met à jour les résultats du quiz selon la validation serveur
        quizResults.totalTime += timeTaken;
        if (result.isCorrect) {
          quizResults.correctAnswersCount++;
        } else {
          if (currentQuestion.category) {
              quizResults.weakAreas.push(currentQuestion.category);
          } else {
              quizResults.weakAreas.push("Domaine inconnu");
          }
        }

        // Affiche le message "Correct" ou "Incorrect" après la validation serveur
        const feedbackMessage = result.isCorrect ? getCongratulationMessage() : getEncouragementMessage();
        if (feedback) {
            feedback.textContent = result.isCorrect ? `Correct ! ${feedbackMessage}` : `Incorrect. ${feedbackMessage}`;
            feedback.className = `question-feedback ${result.isCorrect ? 'correct' : 'incorrect'}`;
        }

        // Affiche l'explication si la réponse est incorrecte
        if (correctTranslation) {
            if (result.isCorrect) {
              correctTranslation.innerHTML = '';
            } else {
              let content = `<strong>Explication :</strong> ${result.explanation}`;
              correctTranslation.innerHTML = content;
            }
        }

        // Met à jour les stats du joueur
        updatePlayerStats(result.xp, result.newLevel, result.streakCount, result.coins, result.competitionCoins);

        if (result.coinsGained > 0) {
            showToast('Récompense !', `+${result.coinsGained} pièces 💰`, 'success');
        }

        if (result.newAchievements && result.newAchievements.length > 0) {
            result.newAchievements.forEach(achievementName => displayAchievementNotification(achievementName));
        }

        // ==========================================================
        // ===            MODIFICATION PRINCIPALE ICI             ===
        // ==========================================================
        // C'est ici que nous changeons le flux de l'application.

        if (result.isCorrect) {
            // Si la réponse est CORRECTE, on passe automatiquement à la question suivante après 3 secondes.
            setTimeout(() => nextQuestion(), 3000);
        } else {
            // Si la réponse est INCORRECTE, on affiche le bouton "Continuer".
            const continueControls = document.getElementById('continue-controls');
            const continueButton = document.getElementById('continue-question-button');

            if (continueControls && continueButton) {
                // On rend le conteneur du bouton visible.
                continueControls.style.display = 'block';
                
                // On ajoute un écouteur d'événement au clic sur le bouton.
                // '.onclick' est simple et efficace ici, il remplace tout ancien écouteur.
                continueButton.onclick = () => {
                    // Quand l'utilisateur clique, on cache à nouveau le bouton...
                    continueControls.style.display = 'none';
                    // ...et on appelle la fonction pour passer à la question suivante.
                    nextQuestion();
                };
            }
        }
        
    } catch (error) {
      console.error('[CLIENT] Erreur lors de la soumission :', error);
      showToast('Erreur', 'Impossible de soumettre la réponse.', 'error');
    }
}
// Helper to (re)open the session status EventSource with retry/backoff
function openSessionStatusStream(updateSessionDisplay) {
    try {
        if (sessionStatusEventSource) {
            sessionStatusEventSource.close();
            sessionStatusEventSource = null;
        }
        sessionStatusEventSource = new EventSource('/session-status-stream');
        sessionStatusEventSource.onopen = () => {
            // Reset backoff on successful open
            sessionStatusRetryMs = 1000;
        };
        sessionStatusEventSource.onmessage = (event) => {
            const sessionCounts = JSON.parse(event.data);
            updateSessionDisplay(sessionCounts);
        };
        sessionStatusEventSource.onerror = () => {
            try { sessionStatusEventSource && sessionStatusEventSource.close(); } catch {}
            sessionStatusEventSource = null;
            // Schedule retry with exponential backoff up to 30s
            const delay = Math.min(sessionStatusRetryMs, 30000);
            setTimeout(() => {
                openSessionStatusStream(updateSessionDisplay);
            }, delay);
            sessionStatusRetryMs = Math.min(delay * 2, 30000);
        };

        if (!sessionStatusOnlineHandlerAdded) {
            window.addEventListener('online', () => {
                // On connectivity restore, try immediately
                sessionStatusRetryMs = 1000;
                openSessionStatusStream(updateSessionDisplay);
            });
            sessionStatusOnlineHandlerAdded = true;
        }
    } catch (e) {
        // Fallback retry on unexpected error
        const delay = Math.min(sessionStatusRetryMs, 30000);
        setTimeout(() => openSessionStatusStream(updateSessionDisplay), delay);
        sessionStatusRetryMs = Math.min(delay * 2, 30000);
    }
}

// Remplacez votre fonction showSongSelection par cette version qui sauvegarde l'heure

async function showSongSelection() {
    const songSelection = document.getElementById('song-selection');
    if (!songSelection) return;

    const sessionList = document.getElementById('session-list');
    if (!sessionList) return;

    songSelection.style.display = 'block';

    try {
        const [sessionDataRes, competitionRes] = await Promise.all([
            fetch('/check-session'),
            fetch('/api/competition-info')
        ]);
        const userData = await sessionDataRes.json();
        const competitionData = await competitionRes.json();
        // Robust parsing: avoid NaN which would prematurely unlock
        const parsedTs = Date.parse(competitionData?.startTime);
        competitionStartTime = isNaN(parsedTs) ? (Date.now() + 24 * 60 * 60 * 1000) : parsedTs;
        // Debug: trace times once on load
        try { console.debug('[MENU] competitionStartTime:', new Date(competitionStartTime).toISOString()); } catch (_) {}
        const completedSessions = userData.completedSessions || [];
        
        setupCompetitionNotification(competitionStartTime, completedSessions);

        const updateSessionDisplay = (sessionCounts) => {
            const songs = getSongs();
            sessionList.innerHTML = songs[0].subMenu.map(subItem => {
                const sessionKey = subItem.page.split('=')[1] || '';
                const sessionNumber = parseInt(sessionKey.replace('session', ''));
                const playerCount = sessionCounts[sessionKey] || 0;
                const activeClass = playerCount > 0 ? 'active' : '';

                // ==========================================================
                // ===      LOGIQUE DE VERROUILLAGE CORRIGÉE ET SIMPLIFIÉE ===
                // ==========================================================
                let isLocked = false;
                let lockReason = '';
                // Recompute current time at each render to avoid stale value
                const now = Date.now();
                let isTimeLocked = now < competitionStartTime;
                let showCountdown = false;

                // Si l'utilisateur n'est PAS devtest, on applique les règles normales
                if (currentUsername !== 'devtest') {
                    // Verrouillage séquentiel de base pour toutes les sessions > 1
                    if (sessionNumber > 1 && !completedSessions.includes(`session${sessionNumber - 1}`)) {
                        isLocked = true;
                        lockReason = `Terminez la Session ${sessionNumber - 1}`;
                    }

                    // Règle spécifique pour la Session 4 : elle peut être verrouillée par le temps
                    // même si la session 3 est terminée.
                    if (sessionNumber === 4 && isTimeLocked && !isLocked) {
                        isLocked = true;
                        lockReason = 'La compétition démarre bientôt !';
                        showCountdown = true;
                    }
                }
                // Si c'est devtest, isLocked reste 'false', et tout est déverrouillé par défaut !
                // La règle "Compétition à venir" qui posait problème a été supprimée.
                // ==========================================================

                const lockedClass = isLocked ? 'locked' : '';
                const lockIcon = isLocked && !showCountdown ? '<span class="lock-icon">🔒</span>' : '';
                const countdownHTML = showCountdown ? `<div class="session-countdown" id="session-4-countdown">Calcul...</div>` : '';
                const canChat = (sessionNumber === 4 && (completedSessions.includes('session3') || currentUsername === 'devtest'));
                
                const chatButtonHTML = canChat ? `
                    <button class="session-chat-btn" data-session="${sessionKey}" title="Rejoindre le chat de la ${subItem.name}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>
                    </button>
                ` : '';

                return `
                    <li class="${lockedClass}" title="${lockReason}">
                        <a href="${isLocked ? '#' : subItem.page}" class="session-link">
                            <span class="session-name">${subItem.name} ${lockIcon}</span>
                            ${countdownHTML}
                            <div class="player-count ${activeClass}">
                                <span class="dot"></span>
                                <span>${playerCount} joueur${playerCount > 1 ? 's' : ''}</span>
                            </div>
                        </a>
                        ${chatButtonHTML}
                    </li>
                `;
            }).join('');
            
            if (document.getElementById('session-4-countdown')) { startCountdown(competitionStartTime); }

            sessionList.querySelectorAll('.session-link').forEach(link => { if (!link.closest('li').classList.contains('locked')) { link.addEventListener('click', (e) => { e.preventDefault(); navigateTo(link.getAttribute('href')); }); } });
            sessionList.querySelectorAll('.session-chat-btn').forEach(button => { button.addEventListener('click', (e) => { e.stopPropagation(); navigateTo(`/chat?session=${button.dataset.session}`); }); });
        };
        
        // Open (and auto-retry) the session status stream
        openSessionStatusStream(updateSessionDisplay);

    } catch (error) {
        console.error('[CLIENT] Erreur lors de l\'affichage des sessions:', error);
        sessionList.innerHTML = '<li>Impossible de charger les sessions initiales.</li>';
    }
}
async function logout() {
    try {
      await fetch('/logout', { method: 'POST' });
      // On affiche un message d'au revoir rapide
      showToast('À bientôt !', 'Vous avez été déconnecté avec succès.', 'success');
      
      // On attend un court instant pour que l'utilisateur voie le message, PUIS on redirige.
      setTimeout(() => {
          window.location.href = '/login'; // CORRECTION : FORCER un rechargement vers la page de connexion
      }, 1500); // 1.5 secondes suffisent
  
    } catch (error) {
      console.error('[CLIENT] Erreur lors de la déconnexion :', error);
      showToast('Erreur', 'Une erreur est survenue lors de la déconnexion.', 'error');
    }
  }
// REMPLACER L'ANCIENNE FONCTION updateLeaderboard PAR CELLE-CI
function updateLeaderboard(leaderboard) {
    const leaderboardList = document.getElementById('leaderboard-list');
    if (!leaderboardList) return;
  
    if (leaderboard.length === 0) {
      leaderboardList.innerHTML = '<li style="color: var(--muted-color);">Aucun joueur dans cette session.</li>';
      return;
    }
  
    const medals = ['🥇', '🥈', '🥉'];
  
    // Générer le nouveau contenu HTML
    const newHTML = leaderboard.slice(0, 10).map((entry, index) => {
      const rank = index + 1;
      const medal = rank <= 3 ? medals[index] : `${rank}.`;
      
      const isCurrentUser = currentUsername && entry.username && entry.username.toLowerCase() === currentUsername.toLowerCase();
      const userClass = isCurrentUser ? 'current-user' : '';

      const initial = entry.username ? entry.username.charAt(0).toUpperCase() : '?';
      const avatarHtml = entry.avatarUrl
        ? `<img class="lb-avatar w-6 h-6 rounded-full object-cover" src="${entry.avatarUrl}" alt="avatar" />`
        : `<div class="lb-avatar-fallback w-6 h-6 rounded-full bg-gray-600 text-white flex items-center justify-center text-xs">${initial}</div>`;

      return `
        <li class="leaderboard-entry ${userClass}">
          <span class="rank">${medal}</span>
          <span class="avatar">${avatarHtml}</span>
          <span class="username">${entry.username}</span>
          <span class="score">${entry.score.toFixed(0)} pts</span>
        </li>
      `;
    }).join('');
  
    leaderboardList.innerHTML = newHTML;
}

// ---- AVATAR HELPERS & SETTINGS LOGIC ----
function renderElementAvatar(element, avatar, username = '') {
    element.classList.add('rounded-full');
    const initial = username ? username.charAt(0).toUpperCase() : '';

    const newUrl = (avatar && avatar.avatarUrl)
        ? new URL(avatar.avatarUrl, window.location.origin).toString()
        : '';
    const currentUrl = element.dataset.avatarUrl || '';

    // If URL hasn't changed, do nothing to avoid flicker
    if (newUrl && newUrl === currentUrl) return;

    if (newUrl) {
        // Preload image, replace only after it is loaded to avoid flashing default
        const img = new Image();
        img.decoding = 'async';
        img.loading = 'eager';
        img.alt = 'avatar';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        img.onload = () => {
            // Clear only when the new image is ready
            element.textContent = '';
            Array.from(element.querySelectorAll('img')).forEach(i => i.remove());
            element.appendChild(img);
            element.dataset.avatarUrl = newUrl;
        };
        // Important: no cache-buster; let browser cache stabilize the avatar
        img.src = newUrl;
        return;
    }

    // If no avatar URL
    delete element.dataset.avatarUrl;
    Array.from(element.querySelectorAll('img')).forEach(i => i.remove());
    element.textContent = initial || '';
}

async function initAvatarSettings() {
    // Elements
    const preview = document.getElementById('current-avatar-preview');
    const grid = document.getElementById('system-avatars-grid');
    const resetBtn = document.getElementById('avatar-reset-button');
    const legend = document.getElementById('current-avatar-legend');
    if (!preview || !grid || !resetBtn) return;

    try {
        const [profileRes, avatarsRes] = await Promise.all([
            fetch('/api/profile'),
            fetch('/api/avatars')
        ]);
        const profile = await profileRes.json();
        const avatarsPayload = await avatarsRes.json();

        // Render preview
        renderElementAvatar(preview, {
            avatarType: profile.avatarType || null,
            avatarUrl: profile.avatarUrl || null
        }, profile.username || currentUsername || '');

        // Render system avatars grid (accepts array or { avatars: [...] })
        const avatarsList = Array.isArray(avatarsPayload)
            ? avatarsPayload
            : (Array.isArray(avatarsPayload?.avatars) ? avatarsPayload.avatars : []);
        grid.innerHTML = avatarsList.map(a => `
            <button type="button" class="avatar-choice border rounded p-1 hover:bg-gray-800 transition ring-offset-2" data-key="${a.key}">
                <img src="${a.url}" alt="${a.label || a.key}" class="w-12 h-12 rounded-full object-cover" />
            </button>
        `).join('');

        // Helper to highlight current selection
        const highlightSelection = (key) => {
            grid.querySelectorAll('.avatar-choice').forEach(b => b.classList.remove('ring-2', 'ring-blue-500'));
            const active = grid.querySelector(`.avatar-choice[data-key="${CSS.escape(key)}"]`);
            if (active) active.classList.add('ring-2', 'ring-blue-500');
        };

        // Preselect if profile has a system avatar
        if (profile.avatarKey) highlightSelection(profile.avatarKey);

        grid.querySelectorAll('.avatar-choice').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const key = btn.getAttribute('data-key');
                try {
                    const res = await fetch('/api/profile/avatar/select', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key })
                    });
                    if (!res.ok) throw new Error('Échec de la sélection');
                    const data = await res.json();
                    renderElementAvatar(preview, { avatarUrl: data.avatarUrl || null }, profile.username || currentUsername || '');
                    if (legend) legend.textContent = 'Avatar système sélectionné';
                    highlightSelection(key);
                    await refreshHeaderAvatar();
                    showToast('Avatar mis à jour', 'Votre avatar système a été sélectionné.', 'success');
                } catch (err) {
                    console.error(err);
                    showToast('Erreur', 'Impossible de sélectionner cet avatar.', 'error');
                }
            });
        });

        // Upload désactivé: aucune logique d'upload ici

        resetBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/profile/avatar/reset', { method: 'POST' });
                if (!res.ok) throw new Error('Réinitialisation échouée');
                renderElementAvatar(preview, { avatarUrl: null }, profile.username || currentUsername || '');
                if (legend) legend.textContent = 'Avatar par défaut';
                await refreshHeaderAvatar();
                showToast('Avatar réinitialisé', 'Avatar par défaut appliqué.', 'success');

                // Clear highlight on system avatars
                grid.querySelectorAll('.avatar-choice').forEach(b => b.classList.remove('ring-2', 'ring-blue-500'));

                // Rien d'autre à réinitialiser (upload désactivé)
            } catch (err) {
                console.error(err);
                showToast('Erreur', 'Impossible de réinitialiser l\'avatar.', 'error');
            }
        });
    } catch (e) {
        console.error('Erreur lors de l\'initialisation des avatars:', e);
    }
}

async function refreshHeaderAvatar() {
    try {
        const res = await fetch('/api/profile');
        if (!res.ok) return;
        const profile = await res.json();
        const greetingAvatarEl = document.querySelector('.greeting-avatar');
        if (greetingAvatarEl) {
            renderElementAvatar(greetingAvatarEl, {
                avatarType: profile.avatarType || null,
                avatarUrl: profile.avatarUrl || null
            }, profile.username || currentUsername || '');
        }
    } catch {}
}

function setupLeaderboardStream() {
    // === AMÉLIORATION N°2 : AFFICHER LE NOM DE LA SESSION DANS LE CLASSEMENT ===
    const panelTitle = document.querySelector('.leaderboard-panel .panel-title');
    if(panelTitle) {
        const sessionNumber = selectedSession.replace('session', '');
        panelTitle.textContent = `Classement - Session ${sessionNumber}`;
    }
    // =========================================================================

    if (leaderboardEventSource) leaderboardEventSource.close();
    leaderboardEventSource = new EventSource(`/leaderboard-stream?session=${selectedSession}`);
    
    leaderboardEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        updateLeaderboard(data.leaderboard);
        const sessionNum = selectedSession.replace('session', '');
        if (data.newUser) showToast('Nouveau joueur', `${data.newUser} a rejoint la session ${sessionNum} !`, 'info');
        if (data.leftUser) showToast('Joueur parti', `${data.leftUser} a quitté la session ${sessionNum}.`, 'error');
      } catch (error) {
        console.error('[CLIENT] Erreur lors du traitement de l’événement du flux (leaderboard) :', error);
      }
    };
  
    leaderboardEventSource.onerror = (error) => {
      console.error('[CLIENT] Erreur EventSource (leaderboard) :', error);
      leaderboardEventSource.close();
    };
  
    startKeepAlive();
}

let menuTimeout = null;
function setupMenuAutoClose() {
  const menuToggle = document.getElementById('menu-toggle');
  const dropdownMenu = document.getElementById('dropdown-menu');
  if (menuToggle && dropdownMenu) {
    const startMenuTimeout = () => {
      clearTimeout(menuTimeout);
      menuTimeout = setTimeout(() => {
        menuToggle.classList.remove('active');
        dropdownMenu.classList.remove('active');
      }, 5000);
    };
    menuToggle.addEventListener('click', () => {
      if (dropdownMenu.classList.contains('active')) startMenuTimeout();
    });
    dropdownMenu.addEventListener('mouseenter', () => clearTimeout(menuTimeout));
    dropdownMenu.addEventListener('mouseleave', () => startMenuTimeout());
    dropdownMenu.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') startMenuTimeout();
    });
  }
}
// REMPLACEZ VOTRE FONCTION showHistoryPage EXISTANTE PAR CELLE-CI :
function showHistoryPage(userData) {
    // Ajout listener bouton "Mes erreurs"
    const errorsBtn = document.getElementById('history-errors-button');
    if (errorsBtn && !errorsBtn._listenerAttached) {
        errorsBtn.addEventListener('click', () => navigateTo('/errors'));
        errorsBtn._listenerAttached = true;
    }
    const historyPage = document.getElementById('history-page');
    if (historyPage) historyPage.style.display = 'flex';

    // Mise à jour des statistiques globales
    document.getElementById('history-xp').textContent = userData.xp !== undefined ? userData.xp : 0;
    document.getElementById('history-level').textContent = userData.level !== undefined ? userData.level : 1;
    document.getElementById('history-streak').textContent = `${userData.streakCount !== undefined ? userData.streakCount : 0} jours`;
    
    // ====================================================================
    // ===                 AMÉLIORATION APPORTÉE ICI (TOTAL)            ===
    // ====================================================================
    // On met à jour le nouvel élément HTML avec le total des pièces de compétition.
    document.getElementById('history-competition-coins').textContent = userData.competitionCoins !== undefined ? userData.competitionCoins : 0;

    let totalCorrectAnswersOverall = 0;
    let totalQuestionsAnsweredOverall = 0; // total unique questions across sessions

const sessionsPlayedData = {}; 

if (userData.scores && userData.scores.length > 0) {
    // Agrégats par session et par questionId pour éviter de compter plusieurs tentatives
    const sessionAggregates = {}; // { [session]: Map(questionId => { hadPositive: boolean }) }

    // Préparer structures et collecter toutes les tentatives
    userData.scores.forEach(score => {
        const sessionName = score.session || 'unknown_session';
        if (!sessionsPlayedData[sessionName]) {
            sessionsPlayedData[sessionName] = { totalCorrect: 0, totalQuestions: 0, scores: [] };
        }
        if (!sessionAggregates[sessionName]) {
            sessionAggregates[sessionName] = new Map();
        }

        sessionsPlayedData[sessionName].scores.push(score); // garder toutes les tentatives pour les détails

        const qId = String(score.questionId);
        const agg = sessionAggregates[sessionName].get(qId) || { hadPositive: false };
        if (score.score > 0) agg.hadPositive = true;
        sessionAggregates[sessionName].set(qId, agg);
    });

    // Récupérer les corrections d'erreurs pour ajuster les statistiques
    fetch('/api/user-errors')
        .then(res => res.json())
        .then(errorQuestions => {
            // Créer un set des questions encore en erreur
            const stillErrorSet = new Set(errorQuestions.map(eq => `${eq.id}-${eq.session}`));
            // Recalculer les totaux par session en se basant sur les questions UNIQUES répondues,
            // et considérer "correct" si la question n'est PAS dans Mes erreurs
            totalCorrectAnswersOverall = 0;
            totalQuestionsAnsweredOverall = 0;
            Object.keys(sessionAggregates).forEach(sessionName => {
                const map = sessionAggregates[sessionName];
                let correct = 0;
                let total = 0;
                for (const [qId, agg] of map.entries()) {
                    total += 1;
                    const key = `${qId}-${sessionName}`;
                    const isNowCorrect = !stillErrorSet.has(key);
                    if (isNowCorrect) correct += 1;
                }
                sessionsPlayedData[sessionName].totalCorrect = correct;
                sessionsPlayedData[sessionName].totalQuestions = total;
                totalCorrectAnswersOverall += correct;
                totalQuestionsAnsweredOverall += total;
            });

            // Mettre à jour l'affichage après calcul des corrections
            updateHistoryDisplay();
        })
        .catch(error => {
            console.error('Erreur lors de la récupération des erreurs:', error);
            // Fallback: considérer correct si au moins une tentative positive, toujours par question unique
            totalCorrectAnswersOverall = 0;
            totalQuestionsAnsweredOverall = 0;
            Object.keys(sessionAggregates).forEach(sessionName => {
                const map = sessionAggregates[sessionName];
                let correct = 0;
                let total = 0;
                for (const [, agg] of map.entries()) {
                    total += 1;
                    if (agg.hadPositive) correct += 1;
                }
                sessionsPlayedData[sessionName].totalCorrect = correct;
                sessionsPlayedData[sessionName].totalQuestions = total;
                totalCorrectAnswersOverall += correct;
                totalQuestionsAnsweredOverall += total;
            });
            updateHistoryDisplay();
        });
} else {
    updateHistoryDisplay();
}

function updateHistoryDisplay() {

document.getElementById('history-correct-total').textContent = `${totalCorrectAnswersOverall} / ${totalQuestionsAnsweredOverall}`;

const quizHistoryList = document.getElementById('quiz-history-list');
quizHistoryList.innerHTML = '';

const sessionNames = Object.keys(sessionsPlayedData).sort();

if (sessionNames.length > 0) {
    sessionNames.forEach(sessionName => {
        const sessionData = sessionsPlayedData[sessionName];
        const sessionElement = document.createElement('div');
        sessionElement.className = 'bg-gray-700 p-3 rounded-lg shadow flex flex-col space-y-2';

        // ====================================================================
        // ===             AMÉLIORATION APPORTÉE ICI (PAR SESSION)        ===
        // ====================================================================
        const sessionNumber = parseInt(sessionName.replace('session', ''));
        // On calcule le total des pièces pour cette session en additionnant les gains de chaque question.
        // (score.coinsGained || 0) assure que ça fonctionne même pour les anciennes données sans cette info.
        const coinsForThisSession = sessionData.scores.reduce((total, score) => total + (score.coinsGained || 0), 0);
        
        let coinsHTML = '';
        // On affiche les pièces uniquement pour les sessions de compétition (4 et plus) et si des pièces ont été gagnées.
        if (sessionNumber >= 4 && coinsForThisSession > 0) {
            coinsHTML = `<span class="session-coins-display">💰 ${coinsForThisSession}</span>`;
        }

        // On injecte le HTML des pièces dans le template.
        sessionElement.innerHTML = `
            <div class="flex justify-between items-center font-bold text-lg text-game-primary">
                <span>${sessionName.replace('session', 'Session ')}</span>
                <div class="session-card-stats">
                    ${coinsHTML}
                    <span>${sessionData.totalCorrect} / ${sessionData.totalQuestions} Correctes</span>
                </div>
            </div>
            <div class="text-sm text-gray-400"></div>
            <button class="view-session-details-btn bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm self-end" data-session="${sessionName}">Voir les détails</button>
        `;
        quizHistoryList.appendChild(sessionElement);
    });

    quizHistoryList.addEventListener('click', (e) => {
        const detailsButton = e.target.closest('.view-session-details-btn');
        if (detailsButton) {
            const sessionToView = detailsButton.dataset.session;
            displaySessionDetailsModal(sessionsPlayedData[sessionToView]);
        }
    });

} else {
    quizHistoryList.innerHTML = '<p class="text-gray-400 text-center">Aucun quiz joué pour l\'instant.</p>';
}

// Affichage des succès (avec garde si achievementsDefinitions n'est pas défini)
const achievementsList = document.getElementById('achievements-list');
achievementsList.innerHTML = '';
const defs = window.achievementsDefinitions || null;
if (userData.achievements && userData.achievements.length > 0 && defs) {
    userData.achievements.forEach(achId => {
        const achievement = defs[achId];
        if (achievement) {
            const achievementElement = document.createElement('div');
            achievementElement.className = 'p-3 bg-gray-700 rounded-lg shadow flex flex-col items-center text-center';
            achievementElement.innerHTML = `
                <span class="text-3xl mb-2">🏆</span>
                <p class="font-bold text-game-accent">${achievement.name}</p>
                <p class="text-sm text-gray-400">${achievement.description}</p>
            `;
            achievementsList.appendChild(achievementElement);
        }
    });
} else {
    achievementsList.innerHTML = '<p class="text-gray-400 text-center col-span-full">Aucun succès débloqué pour l\'instant.</p>';
}

const historyReturnMenuButton = document.getElementById('history-return-menu-button');
if (historyReturnMenuButton) {
    historyReturnMenuButton.addEventListener('click', () => navigateTo('/menu'));
}
    }
}

// REMPLACEZ VOTRE FONCTION displaySessionDetailsModal EXISTANTE PAR CELLE-CI :
function displaySessionDetailsModal(sessionData) {
    // Si la modale existe déjà, on ne fait rien pour éviter les doublons.
    if (document.getElementById('session-details-modal')) return;

    const modalDiv = document.createElement('div');
    modalDiv.id = 'session-details-modal';
    modalDiv.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999]';

    // On injecte le contenu HTML de la modale.
    modalDiv.innerHTML = `
        <div class="bg-gray-800 p-8 rounded-lg shadow-2xl w-full max-w-xl max-h-screen overflow-y-auto custom-scrollbar">
            <h2 class="text-2xl font-bold mb-6 text-cyan-400 text-center">Détails de la Session : ${sessionData.scores[0]?.session.replace('session', 'Session ') || 'Inconnue'}</h2>
            <div class="space-y-3">
                
                <!-- ========================================================== -->
                <!-- ===           MODIFICATION APPLIQUÉE ICI               === -->
                <!-- ========================================================== -->
                
                ${sessionData.scores.map((score, index) => `
                    <div class="bg-gray-700 p-3 rounded-lg flex flex-col">
                        
                        <!-- On remplace l'ID technique par un numéro simple. -->
                        <!-- La méthode .map() nous donne accès à l'index (la position) de chaque élément. -->
                        <!-- Comme l'index commence à 0, on fait 'index + 1' pour afficher "Question 1", "Question 2", etc. -->
                        <p class="text-white text-md mb-1">Question ${index + 1}</p>
                        
                        <p class="text-gray-300 text-sm">Score: ${score.score.toFixed(2)} Ar</p>
                        <p class="text-gray-300 text-sm">Temps: ${score.timeTaken}s</p>
                        <p class="text-sm ${score.score > 0 ? 'text-game-success' : 'text-game-error'}">Statut: ${score.score > 0 ? 'Correct' : 'Incorrect'}</p>
                    </div>
                `).join('')}
            </div>
            <button id="close-session-details-modal" class="mt-6 w-full p-3 rounded-lg button-gradient text-white font-bold hover:opacity-90 transition-opacity">Fermer</button>
        </div>
    `;

    document.body.appendChild(modalDiv);

    const closeModal = () => {
        modalDiv.style.display = 'none';
        modalDiv.remove();
    };

    const closeButton = modalDiv.querySelector('#close-session-details-modal');
    if (closeButton) {
        closeButton.addEventListener('click', closeModal);
    }

    modalDiv.addEventListener('click', (event) => {
        if (event.target === modalDiv) {
            closeModal();
        }
    });
}
// Ajoutez ces deux nouvelles fonctions à la fin de votre fichier script.js

function setupCompetitionNotification(startTime, completedSessions) {
    const header = document.getElementById('main-header');
    let notificationElement = document.getElementById('competition-notification');

    // On ne montre la notification que si la session 3 est terminée et que la compétition n'a pas commencé
    if (completedSessions.includes('session3') && Date.now() < startTime) {
        if (!notificationElement) {
            notificationElement = document.createElement('div');
            notificationElement.id = 'competition-notification';
            notificationElement.className = 'competition-notification';
            header.appendChild(notificationElement);
        }
        // Le minuteur global mettra à jour le contenu
    } else if (notificationElement) {
        notificationElement.remove();
    }
}

function startCountdown(endTime) {
    // Nettoyer tout ancien minuteur pour éviter les fuites de mémoire
    clearInterval(competitionCountdownInterval);

    // Conserver pour mise à jour lors d'un changement de langue
    window.competitionEndTime = endTime;

    competitionCountdownInterval = setInterval(() => {
        const now = Date.now();
        const remaining = endTime - now;

        const countdownElement = document.getElementById('session-4-countdown');
        const notificationElement = document.getElementById('competition-notification');
        
        if (remaining <= 0) {
            clearInterval(competitionCountdownInterval);
            // Quand le temps est écoulé, on rafraîchit la vue pour débloquer la session
            showToast(i18n.t('competition.opensTitle'), i18n.t('competition.session4Available'), 'success');
            if (window.location.pathname === '/menu') {
                updateView();
            }
            return;
        }

        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

        const countdownText = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        // Date exacte formatée selon la langue courante
        const locale = (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) ? i18n.getCurrentLanguage() : 'fr';
        const exactStart = new Date(endTime).toLocaleString(locale === 'en' ? 'en-US' : 'fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }).replace(',', '');
        
        if (countdownElement) {
            countdownElement.textContent = `${i18n.t('competition.startsIn')} ${countdownText} (${i18n.t('competition.at')} ${exactStart})`;
        }
        if (notificationElement) {
            notificationElement.textContent = `🏆 ${i18n.t('game.session')} 4 ${i18n.t('competition.startsIn').toLowerCase()} ${countdownText} (${i18n.t('competition.at')} ${exactStart})`;
        }

    }, 1000);
}
// Ajoutez ces deux nouvelles fonctions à la fin de votre fichier

function startKeepAlive() {
    // On s'assure qu'il n'y a pas déjà un minuteur en cours
    stopKeepAlive();
    
    // On envoie un premier ping immédiat pour marquer l'activité dès l'entrée dans le quiz
    fetch('/api/keep-alive', { method: 'POST' })
      .catch(err => console.warn('[CLIENT] Initial keep-alive ping failed, will retry.', err));
  
    // Puis on programme un ping toutes les minutes
    keepAliveInterval = setInterval(() => {
      fetch('/api/keep-alive', { method: 'POST' })
        .catch(err => {
          // Si le ping échoue (ex: déconnexion), on arrête d'essayer
          console.error('[CLIENT] Keep-alive ping failed, stopping.', err);
          stopKeepAlive();
        });
    }, 60 * 1000); // 60 000 millisecondes = 1 minute
  
    console.log('[CLIENT] Mécanisme de Keep-Alive démarré.');
  }
  
  function stopKeepAlive() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
      console.log('[CLIENT] Mécanisme de Keep-Alive arrêté.');
    }
  }
  // Ajoutez cette nouvelle fonction à la toute fin de votre script.js

  function initializeEmojiPicker() {
    const emojiButton = document.getElementById('emoji-btn');

    // On s'assure que le picker et le bouton existent
    if (emojiPicker && emojiButton) {
        // On vérifie si l'écouteur n'est pas déjà attaché pour éviter les doublons
        if (!emojiButton.hasEmojiListener) {
            emojiButton.addEventListener('click', () => {
                emojiPicker.togglePicker(emojiButton);
            });
            // On marque le bouton pour savoir que l'écouteur est bien en place
            emojiButton.hasEmojiListener = true;
            console.log('[CLIENT] Emoji picker event listener attached to button.');
        }
    }
}
// ==========================================================
// ===         NOUVELLES FONCTIONS POUR LES LIVRES        ===
// ==========================================================

/**
 * Affiche la liste des livres sur la page utilisateur.
 * @param {Array} books - Le tableau d'objets livre.
 */
function displayUserBooks(books) {
    const container = document.getElementById('livres-list-container');
    if (!container) return;

    if (!books || books.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400">Aucun livre disponible pour le moment.</p>';
        return;
    }

    // On crée une carte pour chaque livre
    container.innerHTML = books.map(book => {
        // La balise <a> a maintenant deux attributs importants :
        // 1. target="_blank" : Si le téléchargement direct échoue pour une raison quelconque, le lien s'ouvrira dans un nouvel onglet,
        //    ce qui empêche l'utilisateur de quitter l'application. C'est une sécurité.
        // 2. download : C'est l'instruction clé qui dit au navigateur "Télécharge ce fichier".
        //    Le navigateur utilisera le nom original du fichier.
        return `
        <div class="livre-card">
            <div class="livre-info">
                <span class="livre-icon">📖</span>
                <h3 class="livre-title">${book.title}</h3>
            </div>
            <a href="${book.downloadLink}" target="_blank" download class="button-secondary livre-download-btn">
                Télécharger
            </a>
        </div>
    `}).join('');
}

/**
 * Vérifie la session de l'utilisateur puis charge et affiche la page des livres.
 */
async function checkSessionAndShowLivres() {
    const response = await fetch('/check-session');
    const result = await response.json();
    if (!result.loggedIn) {
        navigateTo('/login');
        showToast('Session expirée', 'Veuillez vous reconnecter.', 'error');
        return;
    }

    // APPEL DE NOTRE NOUVELLE FONCTION CENTRALISÉE
    updateHeaderWithUserData(result);

    const livresPage = document.getElementById('livres-page');
    if (livresPage) livresPage.style.display = 'flex';

    // Ajout de l'écouteur pour le bouton de retour au menu
    const returnBtn = document.getElementById('livres-return-menu-button');
    if (returnBtn) returnBtn.addEventListener('click', () => navigateTo('/menu'));

    try {
        const booksResponse = await fetch('/api/books');
        if (!booksResponse.ok) {
            throw new Error('Impossible de charger la bibliothèque de livres.');
        }
        const books = await booksResponse.json();
        displayUserBooks(books);

    } catch (error) {
        console.error('[CLIENT] Erreur chargement livres:', error);
        showToast('Erreur', error.message, 'error');
        const container = document.getElementById('livres-list-container');
        if (container) container.innerHTML = `<p class="text-center text-red-500">${error.message}</p>`;
    }
}
function displayCourseInModal(course) {
    // Si une modale existe déjà, on la supprime pour éviter les doublons.
    const existingModal = document.getElementById('course-modal');
    if (existingModal) existingModal.remove();

    const modalDiv = document.createElement('div');
    modalDiv.id = 'course-modal';
    modalDiv.className = 'modal-overlay'; // Utilise le même style que le modal "Comment jouer"

    modalDiv.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${course.theme}</h2>
                <button id="close-course-modal" class="modal-close-button">&times;</button>
            </div>
            <div class="modal-body course-content">
                ${markdownToHtml(course.content)}
            </div>
        </div>
    `;

    document.body.appendChild(modalDiv);

    const closeModal = () => modalDiv.remove();

    modalDiv.querySelector('#close-course-modal').addEventListener('click', closeModal);
    modalDiv.addEventListener('click', (e) => {
        if (e.target === modalDiv) closeModal();
    });
}
// --- MES ERREURS: Affichage et gestion des questions incorrectes ---
console.log('[errors-feature.js] chargé');

// Variable globale pour identifier le mode correction d'erreurs
let isErrorReplay = false;
async function showUserErrorsPage() {
    console.log('[DEBUG] showUserErrorsPage appelée');
    const errorsPage = document.getElementById('errors-page');
    console.log('[DEBUG] errorsPage trouvée:', errorsPage);
    if (!errorsPage) {
        console.error('[DEBUG] Élément #errors-page non trouvé !');
        return;
    }
    errorsPage.style.display = 'flex';
    console.log('[DEBUG] errorsPage.style.display défini à flex');

    const errorsList = document.getElementById('errors-list');
    const replayBtn = document.getElementById('errors-replay-button');
    const returnBtn = document.getElementById('errors-return-history-button');

    console.log('[DEBUG] errorsList:', errorsList);
    console.log('[DEBUG] replayBtn:', replayBtn);
    console.log('[DEBUG] returnBtn:', returnBtn);

    if (errorsList) {
        errorsList.innerHTML = '<p>Chargement des erreurs...</p>';
        console.log('[DEBUG] Message "Chargement" injecté');
    }
    if (replayBtn) replayBtn.disabled = true;

    try {
        console.log('[DEBUG] Appel fetch /api/user-errors...');
        const resp = await fetch('/api/user-errors');
        console.log('[DEBUG] Réponse reçue:', resp.status, resp.ok);
        if (!resp.ok) throw new Error('Impossible de charger vos erreurs.');
        const errorQuestions = await resp.json();
        console.log('[DEBUG] Données reçues:', errorQuestions);

        if (!Array.isArray(errorQuestions) || errorQuestions.length === 0) {
            console.log('[DEBUG] Aucune erreur trouvée, affichage du message de félicitations');
            if (errorsList) {
                errorsList.innerHTML = '<p class="text-center text-gray-400">Félicitations ! Vous n\'avez aucune erreur à revoir.</p>';
                console.log('[DEBUG] Message de félicitations injecté');
            }
            if (replayBtn) replayBtn.disabled = true;
        } else {
            console.log('[DEBUG] Erreurs trouvées:', errorQuestions.length);
            errorsList.innerHTML = errorQuestions.map((q, idx) => `
                <div class="error-question">
                    <div class="error-q-index">${idx + 1}.</div>
                    <div class="error-q-text">${q.text}</div>
                    <div class="error-q-options">${q.options.map(opt => `<span class="${opt === q.correctAnswer ? 'correct' : (opt === q.userAnswer ? 'user-error' : '')}">${opt}</span>`).join('')}</div>
                    <div class="error-q-meta">Session: ${q.session}${q.timeTaken ? `, Temps: ${q.timeTaken}s` : ''}</div>
                </div>
            `).join('');
            if (replayBtn) replayBtn.disabled = false;
            // Store error questions for replay
            window.__errorQuestionsForReplay = errorQuestions;
        }
    } catch (e) {
        errorsList.innerHTML = `<p class="text-center text-red-500">${e.message}</p>`;
        if (replayBtn) replayBtn.disabled = true;
    }

    // Set up navigation buttons
    if (returnBtn) returnBtn.onclick = () => navigateTo('/history');
    if (replayBtn) replayBtn.onclick = () => startReplayErrorQuestions();
}

function startReplayErrorQuestions() {
    const errorQuestions = window.__errorQuestionsForReplay || [];
    if (!Array.isArray(errorQuestions) || errorQuestions.length === 0) {
        showToast('Aucune erreur à rejouer', 'Vous devez avoir des erreurs à revoir.', 'info');
        return;
    }
    
    // ACTIVER LE MODE CORRECTION D'ERREURS
    isErrorReplay = true;
    console.log('[DEBUG] Mode correction d\'erreurs activé');
    console.log('[DEBUG] Questions d\'erreur à rejouer:', errorQuestions.length);
    
    // Shuffle or not? For now, show in order
    questions = errorQuestions.map(q => ({ ...q }));
    totalQuestions = questions.length;
    answeredQuestionsCount = 0;
    
    // Hide errors page, show quiz interface
    document.getElementById('errors-page').style.display = 'none';
    const gameElement = document.getElementById('game');
    if (gameElement) {
        gameElement.style.display = 'block';
        
        // S'assurer que le contenu du jeu est bien initialisé pour le mode erreur
        const gameContent = document.querySelector('.game-content');
        if (gameContent) {
            gameContent.innerHTML = `
                <div id="question-container" class="question-card"><div id="question"></div></div>
                <div id="options" class="options-grid"></div>
                <div id="feedback"></div>
                <div id="correct-translation"></div>
                <div id="answer-explanation" class="answer-explanation"></div>
                <div id="hint-controls" class="hint-zone" style="display: none;">
                    <button id="hint-button" class="button-secondary">💡 Obtenir un indice (Coût: 25 💰)</button>
                    <div id="hint-container" style="display: none;"></div>
                </div>
                <div id="continue-controls" style="display: none; text-align: center; margin-top: 1.5rem;">
                    <button id="continue-question-button" class="button-primary">Continuer</button>
                </div>
            `;
        }
    }
    
    quizResults = { correctAnswersCount: 0, totalTime: 0, weakAreas: [] };
    updateProgress();
    nextQuestion();
}
// --- FIN MES ERREURS ---

async function showGameOverScreen() {
    stopTimer();
    if (leaderboardEventSource) leaderboardEventSource.close();
    if (chatEventSource) chatEventSource.close();

    const gameContent = document.querySelector('.game-content');
    if (gameContent) {
        gameContent.innerHTML = `<div class="game-over-container"><h2>Chargement des résultats...</h2></div>`;
    }

    try {
        const response = await fetch('/api/winners');
        if (!response.ok) throw new Error('Impossible de charger les résultats.');
        const winners = await response.json();

        // Trier les gagnants au cas où, par leur rang
        winners.sort((a, b) => a.rank - b.rank);
        
        const podiumHTML = winners.map(winner => `
            <div class="winner-card rank-${winner.rank}">
                <div class="winner-rank">${winner.rank === 1 ? '🥇' : (winner.rank === 2 ? '🥈' : '🥉')}</div>
                <div class="winner-name">${winner.username}</div>
                <div class="winner-prize">${winner.score.toFixed(0)} pts</div>
            </div>
        `).join('');

        const isWinner = winners.some(w => w.username === currentUsername);
        const finalMessage = isWinner 
            ? 'Félicitations, vous êtes sur le podium !'
            : 'Mieux-vaut-tard-que-jamais ! Voici les grands gagnants.';

        const gameOverHTML = `
            <div class="game-over-container">
                <h2 class="game-over-title">Compétition Terminée !</h2>
                <p class="game-over-subtitle"><strong>${finalMessage}</strong></p>
                <div class="winners-podium">
                    ${podiumHTML}
                </div>
                <div class="quiz-actions">
                    <button id="return-menu-button" class="button-primary">Retour au Menu Principal</button>
                </div>
            </div>
        `;

        if (gameContent) {
            gameContent.innerHTML = gameOverHTML;
        }

        const returnMenuBtn = document.getElementById('return-menu-button');
        if (returnMenuBtn) returnMenuBtn.addEventListener('click', () => navigateTo('/menu'));

    } catch (error) {
        console.error("Erreur lors de l'affichage de l'écran de fin :", error);
        if (gameContent) {
            gameContent.innerHTML = `<div class="game-over-container"><h2>Erreur</h2><p>${error.message}</p></div>`;
        }
    }
}

// Exposer les fonctions sur window pour compatibilité SPA
window.showUserErrorsPage = showUserErrorsPage;
window.startReplayErrorQuestions = startReplayErrorQuestions;

