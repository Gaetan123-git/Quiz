document.addEventListener('DOMContentLoaded', () => {
    // ---- SÉLECTEURS D'ÉLÉMENTS ----
    const adminLoginSection = document.getElementById('admin-login-section');
    const adminPanelSection = document.getElementById('admin-panel-section');
    const adminLoginForm = document.getElementById('admin-login-form');
    const loginError = document.getElementById('login-error');
    const logoutAdminButton = document.getElementById('logout-admin-button');

    const sessionSelector = document.getElementById('session-selector');
    const questionsList = document.getElementById('questions-list');
    const addQuestionBtn = document.getElementById('add-question-btn');

    const modal = document.getElementById('question-modal');
    const modalTitle = document.getElementById('modal-title');
    const questionForm = document.getElementById('question-form');
    const questionIdInput = document.getElementById('question-id');
    const questionTextInput = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const addOptionBtn = document.getElementById('add-option-btn');
    const cancelBtn = document.getElementById('cancel-btn');

    const regenerateQuestionsBtn = document.getElementById('regenerate-questions-btn');
    const regenerateAllBtn = document.getElementById('regenerate-all-btn');
    const geminiStatusContainer = document.getElementById('gemini-status-container');
    const geminiStatus = document.getElementById('gemini-status');

    const API_TOKEN_KEY = 'admin-api-token';
    const MIN_OPTIONS = 2;

    const competitionStatusLoading = document.getElementById('competition-status-loading');
    
    // AJOUTEZ CES SÉLECTEURS
    const competitionPriceInput = document.getElementById('competition-price');
    const updatePriceBtn = document.getElementById('update-price-btn');
    const priceUpdateStatus = document.getElementById('price-update-status');
    const competitionFormContainer = document.getElementById('competition-form-container');
    const competitionDatetimeInput = document.getElementById('competition-datetime');
    const updateCompetitionBtn = document.getElementById('update-competition-btn');
    const competitionUpdateStatus = document.getElementById('competition-update-status');

    // SÉLECTEURS POUR LA CAGNOTTE
    const refreshPrizePoolBtn = document.getElementById('refresh-prize-pool-btn');
    const participantsCount = document.getElementById('participants-count');
    const entryFee = document.getElementById('entry-fee');
    const totalPrizePool = document.getElementById('total-prize-pool');
    const adminCommission = document.getElementById('admin-commission');
    const prizesPool = document.getElementById('prizes-pool');
    const maxWinners = document.getElementById('max-winners');
    const prizeDistributionList = document.getElementById('prize-distribution-list');

    // NOUVEAUX SÉLECTEURS pour le mode de distribution
    const prizeModeAutomaticRadio = document.getElementById('prize-mode-automatic');
    const prizeModeManualRadio = document.getElementById('prize-mode-manual');
    const prizeInputsContainer = document.getElementById('prize-inputs-container');
    const labelModeAutomatic = document.getElementById('label-mode-automatic');
    const labelModeManual = document.getElementById('label-mode-manual');
    const prizePoolStatus = document.getElementById('prize-pool-status');

    // ---- COMPÉTITION: Valeur par défaut à 20h et mise à jour quotidienne ----
    function formatForDatetimeLocal(date) {
        // Retourne 'YYYY-MM-DDTHH:MM' en heure locale
        const pad = n => String(n).padStart(2, '0');
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const hh = pad(date.getHours());
        const mm = pad(date.getMinutes());
        return `${y}-${m}-${d}T${hh}:${mm}`;
    }

    function getTodayAt20h(now = new Date()) {
        const d = new Date(now);
        d.setHours(20, 0, 0, 0); // 20:00:00 local
        return d;
    }

    function getNext20h(now = new Date()) {
        const today20 = getTodayAt20h(now);
        if (now.getTime() <= today20.getTime()) return today20;
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(20, 0, 0, 0);
        return tomorrow;
    }

    function setCompetitionDefaultIfEmpty() {
        if (!competitionDatetimeInput) return;
        if (!competitionDatetimeInput.value) {
            const next20 = getNext20h();
            competitionDatetimeInput.value = formatForDatetimeLocal(next20);
        }
    }

    function scheduleDaily20hUpdate() {
        if (!competitionDatetimeInput) return;
        const now = new Date();
        const next20 = getNext20h(now);
        const delay = next20.getTime() - now.getTime();
        // Sécurité: éviter valeurs négatives
        const safeDelay = Math.max(0, delay);
        setTimeout(function on20hTick() {
            // À 20h local, positionner l'input sur aujourd'hui 20:00
            const today20 = getTodayAt20h(new Date());
            competitionDatetimeInput.value = formatForDatetimeLocal(today20);
            // Reprogrammer pour le lendemain 20:00
            setTimeout(on20hTick, 24 * 60 * 60 * 1000);
        }, safeDelay);
    }

    // Initialiser la valeur par défaut et la mise à jour quotidienne
    setCompetitionDefaultIfEmpty();
    scheduleDaily20hUpdate();

    const userManagementLoading = document.getElementById('user-management-loading');
    const userManagementContainer = document.getElementById('user-management-container');
    const userSelector = document.getElementById('user-selector');
    const resetUserBtn = document.getElementById('reset-user-btn');
    const userResetStatus = document.getElementById('user-reset-status');
    const courseThemeInput = document.getElementById('course-theme'); 
    const courseThemeLabel = document.getElementById('course-theme-label'); 
    const addBookForm = document.getElementById('add-book-form');
    const bookTitleInput = document.getElementById('book-title');
    const bookLinkInput = document.getElementById('book-link');
    const adminBooksList = document.getElementById('admin-books-list');
    const bookStatus = document.getElementById('book-status');
    const addThemeForm = document.getElementById('add-theme-form');
    const themeNameInput = document.getElementById('theme-name');
    const themesList = document.getElementById('themes-list');
    const themeStatus = document.getElementById('theme-status');

    const promptsForm = document.getElementById('prompts-form');
    const promptQuestionsTextarea = document.getElementById('prompt-questions');
    const promptCourseTextarea = document.getElementById('prompt-course');
    const savePromptsBtn = document.getElementById('save-prompts-btn');
    const promptsStatus = document.getElementById('prompts-status');
    const editPromptQuestionsBtn = document.getElementById('edit-prompt-questions-btn');
    const editPromptCourseBtn = document.getElementById('edit-prompt-course-btn');
    const resetHistoryBtn = document.getElementById('reset-history-btn');
    const historyResetStatus = document.getElementById('history-reset-status');
    const maxWinnersInput = document.getElementById('max-winners');
    const updateWinnersBtn = document.getElementById('update-winners-btn');
    const winnersUpdateStatus = document.getElementById('winners-update-status');

    // NOUVEAU : Sélecteurs pour l'édition de cours
    const editCourseForm = document.getElementById('edit-course-form');
    const courseEditThemeInput = document.getElementById('course-edit-theme');
    const courseEditContentTextarea = document.getElementById('course-edit-content');
    const saveCourseBtn = document.getElementById('save-course-btn');
    const courseSaveStatus = document.getElementById('course-save-status');
    const editCourseContentBtn = document.getElementById('edit-course-content-btn');
    // NOUVEAU : Sélecteurs pour l'import/export en masse
    const downloadAllSessionsBtn = document.getElementById('download-all-sessions-btn');
    const importQuestionsFile = document.getElementById('import-questions-file');
    const uploadAllSessionsBtn = document.getElementById('upload-all-sessions-btn');
    const massEditStatus = document.getElementById('mass-edit-status');

    // ---- TOGGLE AFFICHAGE PROMPTS ----
    function toggleTextarea(textareaEl, btnEl) {
        if (!textareaEl || !btnEl) return;
        const isHidden = textareaEl.classList.toggle('hidden');
        btnEl.textContent = isHidden ? 'Modifier' : 'Masquer';
        if (!isHidden) setTimeout(() => textareaEl.focus(), 0);
    }
    if (editPromptQuestionsBtn) {
        editPromptQuestionsBtn.addEventListener('click', () => toggleTextarea(promptQuestionsTextarea, editPromptQuestionsBtn));
    }
    if (editPromptCourseBtn) {
        editPromptCourseBtn.addEventListener('click', () => toggleTextarea(promptCourseTextarea, editPromptCourseBtn));
    }

    // ---- TOGGLE AFFICHAGE COURS ----
    if (editCourseContentBtn) {
        editCourseContentBtn.addEventListener('click', () => toggleTextarea(courseEditContentTextarea, editCourseContentBtn));
    }

    // ---- AUTHENTIFICATION ----
    if (sessionStorage.getItem(API_TOKEN_KEY)) {
        adminLoginSection.classList.add('hidden');
        adminPanelSection.classList.remove('hidden');
        loadQuestionsForSelectedSession();
        loadCompetitionInfo();
        loadUsersForReset();
        loadAdminBooks();
        loadAndDisplayThemes();
        loadCurrentCourse();
    }
    adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('admin-password').value;
        loginError.textContent = '';

        try {
            const response = await fetch('/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Mot de passe incorrect.');
            }

            const { token } = await response.json();
            sessionStorage.setItem(API_TOKEN_KEY, token);

            adminLoginSection.classList.add('hidden');
            adminPanelSection.classList.remove('hidden');

            // On charge toutes les données nécessaires après la connexion
            loadQuestionsForSelectedSession();
            loadCompetitionInfo();
            loadUsersForReset();
            loadAdminBooks();
            loadAndDisplayThemes();
            loadPrompts();
            loadCurrentCourse();

        } catch (error) {
            loginError.textContent = error.message || 'Une erreur est survenue.';
        }
    });

    // ---- GESTION DE LA COMPÉTITION ----
    async function loadCompetitionInfo() {
        competitionStatusLoading.textContent = 'Chargement des informations...';
        competitionFormContainer.classList.add('hidden');
        const token = sessionStorage.getItem(API_TOKEN_KEY);

        try {
            const response = await fetch('/admin/competition-info', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Impossible de charger les infos de la compétition.');

            const data = await response.json();
            // Déterminer la date effective à afficher dans l'input.
            // Si la date serveur est manquante/invalide ou est déjà passée, on met par défaut "aujourd'hui à 20:00".
            const now = new Date();
            let effective = new Date(data.startTime);
            if (!(effective instanceof Date) || isNaN(effective) || effective.getTime() < now.getTime()) {
                effective = getNext20h(now); // aujourd'hui 20:00 si on est avant 20h, sinon demain 20:00
            }
            const localDateString = formatForDatetimeLocal(effective);
            competitionDatetimeInput.value = localDateString;

            competitionStatusLoading.textContent = '';
            competitionFormContainer.classList.remove('hidden');

        } catch (error) {
            competitionStatusLoading.textContent = `Erreur : ${error.message}`;
            competitionStatusLoading.classList.add('text-red-500');
        }
    }

    // NOUVELLE FONCTION pour générer les champs de saisie des prix
    function renderPrizeInputs(numberOfWinners, prizes = []) {
        const container = document.getElementById('prize-inputs-container');
        if (!container) return;

        container.innerHTML = ''; // On vide le conteneur
        for (let i = 1; i <= numberOfWinners; i++) {
            // On cherche si un prix a déjà été défini pour ce rang
            const existingPrize = prizes.find(p => p.rank === i);
            const value = existingPrize ? existingPrize.amount : '';

            const inputGroup = document.createElement('div');
            inputGroup.className = 'flex items-center gap-2';
            inputGroup.innerHTML = `
                <label for="prize-rank-${i}" class="block text-sm font-medium w-32">Prix ${i}${i === 1 ? 'er' : 'ème'} (Ar):</label>
                <input type="number" id="prize-rank-${i}" data-rank="${i}" value="${value}"
                       class="prize-input w-48 p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                       placeholder="Montant pour le rang ${i}">
            `;
            container.appendChild(inputGroup);
        }
    }

    async function loadCompetitionRules() {
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        try {
            const response = await fetch('/admin/competition-rules', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Impossible de charger les règles.');
            const rules = await response.json();
            
            maxWinnersInput.value = rules.maxWinners;
            competitionPriceInput.value = rules.price !== undefined ? rules.price : 1000;

            // NOUVEAU : Gestion de l'affichage en fonction du mode
            const currentMode = rules.prizeMode || 'automatic';
            if (currentMode === 'manual') {
                prizeModeManualRadio.checked = true;
            } else {
                prizeModeAutomaticRadio.checked = true;
            }
            
            togglePrizeInputsVisibility(currentMode);
            renderPrizeInputs(rules.maxWinners, rules.prizes || []);
            updateRadioLabels();

            // Ajout des écouteurs d'événements s'ils n'existent pas déjà
            if (!maxWinnersInput.hasListener) {
                maxWinnersInput.addEventListener('input', () => {
                    const numWinners = parseInt(maxWinnersInput.value, 10) || 0;
                    const prizes = Array.from(document.querySelectorAll('.prize-input')).map(input => ({ rank: parseInt(input.dataset.rank), amount: parseInt(input.value) || '' }));
                    renderPrizeInputs(numWinners, prizes);
                });
                prizeModeAutomaticRadio.addEventListener('change', () => togglePrizeInputsVisibility('automatic'));
                prizeModeManualRadio.addEventListener('change', () => togglePrizeInputsVisibility('manual'));
                maxWinnersInput.hasListener = true;
            }

        } catch (error) {
            winnersUpdateStatus.textContent = `Erreur : ${error.message}`;
            winnersUpdateStatus.className = 'text-red-500 text-sm mt-3 h-5';
        }
    }

    // NOUVELLE FONCTION pour gérer la visibilité des champs de prix
    function togglePrizeInputsVisibility(mode) {
        if (mode === 'manual') {
            prizeInputsContainer.classList.remove('hidden');
        } else {
            prizeInputsContainer.classList.add('hidden');
        }
        updateRadioLabels();
    }

    // NOUVELLE FONCTION pour mettre à jour le style des labels radio
    function updateRadioLabels() {
        if (prizeModeManualRadio.checked) {
            labelModeManual.classList.add('bg-cyan-600', 'text-white');
            labelModeAutomatic.classList.remove('bg-cyan-600', 'text-white');
        } else {
            labelModeAutomatic.classList.add('bg-cyan-600', 'text-white');
            labelModeManual.classList.remove('bg-cyan-600', 'text-white');
        }
    }

    function renderPrizeInputs(numberOfWinners, prizes = []) {
        if (!prizeInputsContainer) return;

        prizeInputsContainer.innerHTML = '';
        for (let i = 1; i <= numberOfWinners; i++) {
            const existingPrize = prizes.find(p => p.rank === i);
            const value = existingPrize ? existingPrize.amount : '';

            const inputGroup = document.createElement('div');
            inputGroup.className = 'flex items-center gap-2';
            inputGroup.innerHTML = `
                <label for="prize-rank-${i}" class="block text-sm font-medium w-32">Prix ${i}${i === 1 ? 'er' : 'ème'} (Ar):</label>
                <input type="number" id="prize-rank-${i}" data-rank="${i}" value="${value}"
                       class="prize-input w-48 p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                       placeholder="Montant pour le rang ${i}">
            `;
            prizeInputsContainer.appendChild(inputGroup);
        }
    }

    async function loadAndDisplayWinners() {
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        const winnersListContainer = document.getElementById('admin-winners-list');
        winnersListContainer.innerHTML = '<p class="text-gray-400">Chargement...</p>';

        try {
            // MODIFICATION : On appelle la nouvelle route dédiée à l'admin
            const response = await fetch('/admin/winners', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            // La gestion de l'erreur 403 n'est plus nécessaire ici, car cette route renvoie toujours les données.
            if (!response.ok) throw new Error('Impossible de charger les gagnants.');

            const winners = await response.json();
            if (winners.length === 0) {
                winnersListContainer.innerHTML = '<p class="text-gray-500">Aucun gagnant enregistré pour le moment.</p>';
                return;
            }

            winners.sort((a, b) => a.rank - b.rank);

            winnersListContainer.innerHTML = winners.map(winner => `
                <div class="bg-gray-700 p-3 rounded-md flex justify-between items-center text-sm">
                    <div class="flex items-center gap-3">
                        <span class="font-bold text-base">${winner.rank}. ${winner.username}</span>
                        <span class="text-xs text-gray-400">📞 ${winner.paymentPhone || 'Non fourni'}</span>
                    </div>
                    <span class="text-green-400 font-bold">${winner.score.toFixed(0)} pts</span>
                </div>
            `).join('');

        } catch (error) {
            winnersListContainer.innerHTML = `<p class="text-red-500">Erreur : ${error.message}</p>`;
        }
    }

    async function loadCurrentCourse() {
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        courseSaveStatus.textContent = 'Chargement du cours actuel...';
        courseSaveStatus.className = 'text-yellow-400 text-sm mt-3 h-5';
        try {
            const response = await fetch('/api/course', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.error || 'Impossible de charger le cours.');
            }
            const course = await response.json();
            courseEditThemeInput.value = course.theme;
            courseEditContentTextarea.value = course.content;
            courseSaveStatus.textContent = '';
        } catch (error) {
            courseEditThemeInput.value = 'Erreur';
            courseEditContentTextarea.value = `Impossible de charger le contenu du cours.\n\nErreur : ${error.message}`;
            courseSaveStatus.textContent = `Erreur : ${error.message}`;
            courseSaveStatus.className = 'text-red-500 text-sm mt-3 h-5';
        }
    }

    updateCompetitionBtn.addEventListener('click', async () => {
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        const localDateValue = competitionDatetimeInput.value;
        if (!localDateValue) {
            alert('Veuillez sélectionner une date et une heure.');
            return;
        }

        const startTimeISO = new Date(localDateValue).toISOString();

        competitionUpdateStatus.textContent = 'Mise à jour...';
        competitionUpdateStatus.className = 'text-yellow-400 text-sm mt-3';

        try {
            const response = await fetch('/admin/competition-info', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ startTime: startTimeISO })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            competitionUpdateStatus.textContent = result.message;
            competitionUpdateStatus.className = 'text-green-400 text-sm mt-3';

        } catch (error) {
            competitionUpdateStatus.textContent = `Erreur : ${error.message}`;
            competitionUpdateStatus.className = 'text-red-500 text-sm mt-3';
        }
    });

    // ---- NOUVELLE SECTION : GESTION DES UTILISATEURS ----

    async function loadUsersForReset() {
        userManagementLoading.textContent = 'Chargement de la liste des joueurs...';
        userManagementContainer.classList.add('hidden');
        const token = sessionStorage.getItem(API_TOKEN_KEY);

        try {
            const response = await fetch('/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Impossible de charger les utilisateurs.');

            const users = await response.json();
            userSelector.innerHTML = '';

            const allOption = document.createElement('option');
            allOption.value = 'ALL_USERS';
            allOption.textContent = 'Tous les Joueurs';
            allOption.className = 'font-bold text-yellow-400';
            userSelector.appendChild(allOption);

            users.forEach(user => {
                if (user.username !== 'devtest') {
                    const option = document.createElement('option');
                    option.value = user.username;
                    option.textContent = user.username;
                    userSelector.appendChild(option);
                }
            });

            userManagementLoading.textContent = '';
            userManagementContainer.classList.remove('hidden');

            // Initialiser l'affichage du champ thème
            updateCourseThemeVisibility();

        } catch (error) {
            userManagementLoading.textContent = `Erreur : ${error.message}`;
            userManagementLoading.classList.add('text-red-500');
        }
    }

    // NOUVELLE FONCTION pour gérer la visibilité du champ thème
    function updateCourseThemeVisibility() {
        const isResetAll = userSelector.value === 'ALL_USERS';
        courseThemeInput.style.display = isResetAll ? 'block' : 'none';
        courseThemeLabel.style.display = isResetAll ? 'block' : 'none';
        courseThemeInput.required = isResetAll; // Rendre le champ obligatoire si "Tous les joueurs" est sélectionné
    }

    // Écouteur pour le changement de sélection de l'utilisateur
    userSelector.addEventListener('change', updateCourseThemeVisibility);

    // REMPLACEZ VOTRE ÉVÉNEMENT DU BOUTON resetUserBtn PAR CETTE NOUVELLE VERSION
    resetUserBtn.addEventListener('click', async () => {
        const usernameToReset = userSelector.value;
        if (!usernameToReset) {
            alert('Veuillez sélectionner une option.');
            return;
        }

        const isResetAll = usernameToReset === 'ALL_USERS';
        let themeForCourse = '';

        if (isResetAll) {
            themeForCourse = courseThemeInput.value.trim();
            if (!themeForCourse) {
                alert("Veuillez saisir un 'Thème pour le nouveau cours' avant de réinitialiser tous les joueurs.");
                return;
            }
        }

        const confirmationText = isResetAll
            ? `Êtes-vous ABSOLUMENT SÛR de vouloir RÉINITIALISER TOUS les joueurs et générer un nouveau cours sur "${themeForCourse}" ?\n\nLeurs progressions seront perdues et le cours actuel sera remplacé pour TOUS.`
            : `Êtes-vous sûr de vouloir RÉINITIALISER TOTALEMENT le joueur "${usernameToReset}" ?\n\nSa progression sera perdue. Cette action est irréversible.`;

        if (!confirm(confirmationText)) return;

        userResetStatus.className = 'text-yellow-400 text-sm mt-3 animate-pulse';

        // Message d'attente spécifique pour la génération de cours
        if (isResetAll) {
            userResetStatus.textContent = 'Réinitialisation et génération du nouveau cours en cours... Cela peut prendre jusqu\'à une minute. Veuillez patienter.';
        } else {
            userResetStatus.textContent = 'Réinitialisation en cours...';
        }

        const token = sessionStorage.getItem(API_TOKEN_KEY);
        const requestBody = { username: usernameToReset };

        if (isResetAll) {
            requestBody.theme = themeForCourse;
        }

        try {
            const response = await fetch('/admin/reset-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            userResetStatus.textContent = result.message;
            userResetStatus.className = 'text-green-400 text-sm mt-3';

        } catch (error) {
            userResetStatus.textContent = `Erreur : ${error.message}`;
            userResetStatus.className = 'text-red-500 text-sm mt-3';
        } finally {
            // Recharger la liste des utilisateurs au cas où des modifications ont été faites (même si le nom ne change pas)
            // Cela réinitialisera aussi l'état du champ thème
            loadUsersForReset(); 
        }
    });
    // ==========================================================
    // ===         NOUVELLES FONCTIONS - GESTION DES LIVRES   ===
    // ==========================================================

    /**
     * Affiche un message de statut (succès ou erreur) dans la section des livres.
     * @param {string} message - Le message à afficher.
     * @param {boolean} isError - Mettre à true pour un message d'erreur.
     */
    function showBookStatus(message, isError = false) {
        bookStatus.textContent = message;
        bookStatus.className = isError 
            ? 'text-red-400 text-sm mb-4 h-5' 
            : 'text-green-400 text-sm mb-4 h-5';
        // Le message disparaît après 5 secondes
        setTimeout(() => bookStatus.textContent = '', 5000);
    }

    /**
     * Récupère la liste des livres depuis le serveur et l'affiche.
     */
    async function loadAdminBooks() {
        adminBooksList.innerHTML = '<p class="text-gray-400">Chargement des livres...</p>';
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        try {
            const response = await fetch('/admin/books', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Impossible de charger la liste des livres.');
            
            const books = await response.json();
            
            // Affichage de la liste
            adminBooksList.innerHTML = '';
            if (books.length === 0) {
                adminBooksList.innerHTML = '<p class="text-gray-500">Aucun livre à afficher.</p>';
                return;
            }

            books.forEach(book => {
                const bookElement = document.createElement('div');
                bookElement.className = 'bg-gray-700 p-3 rounded-md flex justify-between items-center';
                bookElement.innerHTML = `
                    <div>
                        <p class="font-semibold text-white">${book.title}</p>
                        <a href="${book.downloadLink}" target="_blank" class="text-xs text-cyan-400 hover:underline">${book.downloadLink}</a>
                    </div>
                    <button data-id="${book.id}" class="delete-book-btn bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm font-bold">Supprimer</button>
                `;
                adminBooksList.appendChild(bookElement);
            });

        } catch (error) {
            showBookStatus(error.message, true);
            adminBooksList.innerHTML = '';
        }
    }

    // Intercepte la soumission du formulaire pour ajouter un livre
    addBookForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Empêche le rechargement de la page
        const title = bookTitleInput.value.trim();
        const downloadLink = bookLinkInput.value.trim();
        const token = sessionStorage.getItem(API_TOKEN_KEY);

        try {
            const response = await fetch('/admin/books', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ title, downloadLink })
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Erreur inconnue.');

            showBookStatus(`Le livre "${title}" a été ajouté avec succès !`);
            addBookForm.reset(); // Vide le formulaire
            loadAdminBooks();    // Rafraîchit la liste

        } catch(error) {
            showBookStatus(error.message, true);
        }
    });

    // Gère la suppression d'un livre en cliquant sur le bouton
    adminBooksList.addEventListener('click', async (e) => {
        // On utilise la délégation d'événement pour ne mettre qu'un seul écouteur
        if (e.target.classList.contains('delete-book-btn')) {
            const bookId = e.target.dataset.id;
            if (!confirm('Êtes-vous sûr de vouloir supprimer ce livre ?')) return;
            
            const token = sessionStorage.getItem(API_TOKEN_KEY);
            try {
                const response = await fetch(`/admin/books/${bookId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) throw new Error("Échec de la suppression.");

                showBookStatus("Livre supprimé avec succès.");
                loadAdminBooks(); // Rafraîchit la liste

            } catch (error) {
                showBookStatus(error.message, true);
            }
        }
    });

    // ---- FIN DE LA GESTION DES UTILISATEURS ----
        // ---- FIN DE LA GESTION DES UTILISATEURS ----
// ==========================================================
    // ===        NOUVELLES FONCTIONS - GESTION DES PROMPTS   ===
    // ==========================================================
    async function loadPrompts() {
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        try {
            const response = await fetch('/admin/prompts', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Impossible de charger les prompts.');

            const prompts = await response.json();
            promptQuestionsTextarea.value = prompts.questions;
            promptCourseTextarea.value = prompts.course;
        } catch (error) {
            promptsStatus.textContent = `Erreur: ${error.message}`;
            promptsStatus.className = 'text-red-500 text-sm mt-3 h-5';
        }
    }

    promptsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        const questions = promptQuestionsTextarea.value;
        const course = promptCourseTextarea.value;

        promptsStatus.textContent = 'Sauvegarde en cours...';
        promptsStatus.className = 'text-yellow-400 text-sm mt-3 h-5';
        savePromptsBtn.disabled = true;

        try {
            const response = await fetch('/admin/prompts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ questions, course })
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Erreur inconnue.');
            
            promptsStatus.textContent = result.message;
            promptsStatus.className = 'text-green-400 text-sm mt-3 h-5';

        } catch (error) {
            promptsStatus.textContent = `Erreur: ${error.message}`;
            promptsStatus.className = 'text-red-500 text-sm mt-3 h-5';
        } finally {
            savePromptsBtn.disabled = false;
        }
    });

    // NOUVEAU : Écouteur pour la sauvegarde du cours édité
    editCourseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        const theme = courseEditThemeInput.value;
        const content = courseEditContentTextarea.value;

        if (!confirm('Êtes-vous sûr de vouloir remplacer le cours actuel par vos modifications ?')) {
            return;
        }

        courseSaveStatus.textContent = 'Sauvegarde en cours...';
        courseSaveStatus.className = 'text-yellow-400 text-sm mt-3 h-5';
        saveCourseBtn.disabled = true;

        try {
            const response = await fetch('/admin/course', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ theme, content })
            });
            
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Erreur inconnue.');
            
            courseSaveStatus.textContent = result.message;
            courseSaveStatus.className = 'text-green-400 text-sm mt-3 h-5';

        } catch (error) {
            courseSaveStatus.textContent = `Erreur: ${error.message}`;
            courseSaveStatus.className = 'text-red-500 text-sm mt-3 h-5';
        } finally {
            saveCourseBtn.disabled = false;
        }
    });

        logoutAdminButton.addEventListener('click', () => {
            sessionStorage.removeItem(API_TOKEN_KEY);
            adminPanelSection.classList.add('hidden');
            adminLoginSection.classList.remove('hidden');
            document.getElementById('admin-password').value = '';
            loginError.textContent = '';
        });

        // ---- GESTION DES QUESTIONS ----

        sessionSelector.addEventListener('change', loadQuestionsForSelectedSession);

        async function loadQuestionsForSelectedSession() {
            const session = sessionSelector.value;
            const token = sessionStorage.getItem(API_TOKEN_KEY);
            questionsList.innerHTML = `<p class="text-gray-400">Chargement des questions...</p>`;
            try {
                const response = await fetch(`/admin/questions/${session}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                    if (response.status === 403) logoutAdminButton.click();
                    throw new Error('Impossible de charger les questions.');
                }
                const questions = await response.json();
                displayQuestions(questions);
            } catch (error) {
                console.error(error);
                questionsList.innerHTML = `<p class="text-red-500">${error.message}</p>`;
            }
        }

function displayQuestions(questions) {
    // Compact rendering: a label + select + action buttons (Edit/Delete)
    if (!Array.isArray(questions) || questions.length === 0) {
        questionsList.innerHTML = '<p class="text-gray-400">Aucune question dans cette session. Ajoutez-en une manuellement ou générez-les avec Gemini.</p>';
        return;
    }

    // Helper to truncate long text and escape tags
    const truncate = (str, n = 100) => (str.length > n ? str.slice(0, n - 1) + '…' : str);
    const escapeHTML = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const selectId = 'questions-compact-select';
    const editBtnId = 'edit-selected-question';
    const deleteBtnId = 'delete-selected-question';

    const optionsHtml = questions
        .map((q, idx) => {
            const full = escapeHTML(q.text || '');
            return `<option value="${q.id}" title="${truncate(full, 200)}">Question ${idx + 1}</option>`;
        }) 
        .join('');

    questionsList.innerHTML = `
        <label for="${selectId}" class="block mb-2 text-sm font-medium">Questions de la session</label>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <select id="${selectId}" class="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500">${optionsHtml}</select>
            <button id="${editBtnId}" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg">Éditer</button>
            <button id="${deleteBtnId}" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg">Supprimer</button>
        </div>
    `;

    // Wire up actions
    const selectEl = document.getElementById(selectId);
    const editBtn = document.getElementById(editBtnId);
    const deleteBtn = document.getElementById(deleteBtnId);

    editBtn.onclick = async () => {
        const id = selectEl.value;
        if (!id) return;
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        const session = sessionSelector.value;
        try {
            const response = await fetch(`/admin/questions/${session}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) throw new Error('Impossible de charger la question.');
            const all = await response.json();
            const questionToEdit = all.find(q => String(q.id) === String(id));
            if (questionToEdit) openModal(questionToEdit);
        } catch (e) {
            alert(e.message || 'Erreur lors du chargement de la question.');
        }
    };

    deleteBtn.onclick = async () => {
        const id = selectEl.value;
        if (!id) return;
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette question ?')) return;
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        const session = sessionSelector.value;
        try {
            const resp = await fetch(`/admin/question/${session}/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) throw new Error('Échec de la suppression');
            // Reload list after deletion
            loadQuestionsForSelectedSession();
        } catch (e) {
            alert(e.message || 'Erreur lors de la suppression.');
        }
    };
}

// Status helpers for Gemini regeneration
function showStatusMessage(message, isError = false) {
    geminiStatus.textContent = message;
    geminiStatus.className = isError ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold';
    geminiStatusContainer.classList.remove('hidden');
}

function hideStatusMessage() {
    geminiStatusContainer.classList.add('hidden');
}

        regenerateQuestionsBtn.addEventListener('click', async () => {
            const session = sessionSelector.value;
            const sessionName = sessionSelector.options[sessionSelector.selectedIndex].text;
            const theme = document.getElementById('gemini-theme').value.trim();
            const level = document.getElementById('gemini-level').value;
            const language = document.getElementById('gemini-language').value;

            if (!theme) {
                alert("Veuillez entrer un thème pour la génération.");
                return;
            }

            const confirmation = confirm(`Êtes-vous sûr de vouloir remplacer les questions de la "${sessionName}" avec le thème "${theme}" (${level}) ?\n\nCette action est irréversible.`);
            if (!confirmation) return;

            regenerateQuestionsBtn.disabled = true;
            addQuestionBtn.disabled = true;
            geminiStatus.className = 'text-yellow-300 animate-pulse font-semibold';
            showStatusMessage('Génération en cours... Cela peut prendre jusqu\'à une minute. Veuillez patienter.');

            try {
                const token = sessionStorage.getItem(API_TOKEN_KEY);
                const response = await fetch(`/admin/regenerate-questions/${session}`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify({ theme, level, language, count: 15 })
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Une erreur est survenue lors de la communication avec le serveur.');
                
                showStatusMessage(result.message, false);
                await loadQuestionsForSelectedSession();

            } catch (error) {
                console.error('Erreur lors de la régénération des questions:', error);
                showStatusMessage(`Erreur : ${error.message}`, true);
            } finally {
                regenerateQuestionsBtn.disabled = false;
                addQuestionBtn.disabled = false;
                geminiStatus.classList.remove('animate-pulse');
                setTimeout(hideStatusMessage, 8000);
            }
        });

        // Régénérer toutes les sessions avec le niveau sélectionné
        if (regenerateAllBtn) {
            regenerateAllBtn.addEventListener('click', async () => {
                const theme = document.getElementById('gemini-theme').value.trim();
                const level = document.getElementById('gemini-level').value;
                const language = document.getElementById('gemini-language').value;

                if (!theme) {
                    alert('Veuillez entrer un thème pour la génération.');
                    return;
                }

                const confirmation = confirm(`Êtes-vous sûr de vouloir remplacer les questions de TOUTES les sessions avec le thème "${theme}" (${level}) ?\n\nCette action est irréversible.`);
                if (!confirmation) return;

                regenerateAllBtn.disabled = true;
                regenerateQuestionsBtn.disabled = true;
                addQuestionBtn.disabled = true;
                geminiStatus.className = 'text-yellow-300 animate-pulse font-semibold';
                showStatusMessage('Génération pour toutes les sessions en cours... Cela peut prendre jusqu\'à une minute. Veuillez patienter.');

                try {
                    const token = sessionStorage.getItem(API_TOKEN_KEY);
                    const response = await fetch('/admin/regenerate-questions-all', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ theme, level, language, count: 15 })
                    });

                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || 'Une erreur est survenue lors de la communication avec le serveur.');

                    showStatusMessage(result.message || 'Régénération terminée pour toutes les sessions.', false);
                    await loadQuestionsForSelectedSession();
                } catch (error) {
                    console.error('Erreur lors de la régénération globale:', error);
                    showStatusMessage(`Erreur : ${error.message}`, true);
                } finally {
                    regenerateAllBtn.disabled = false;
                    regenerateQuestionsBtn.disabled = false;
                    addQuestionBtn.disabled = false;
                    geminiStatus.classList.remove('animate-pulse');
                    setTimeout(hideStatusMessage, 8000);
                }
            });
        }

        // ---- LOGIQUE DU MODAL (AJOUT / ÉDITION MANUELLE) - MODIFIÉE ----

        function renderCorrectAnswerChoices(currentCorrectAnswer = null) {
            const correctAnswerContainer = document.getElementById('correct-answer-container');
            const optionInputs = Array.from(optionsContainer.querySelectorAll('.option-input'));
            const optionValues = optionInputs.map(input => input.value.trim()).filter(Boolean);

            correctAnswerContainer.innerHTML = '';

            if (optionValues.length === 0) {
                correctAnswerContainer.innerHTML = '<p class="text-gray-400">Veuillez d\'abord saisir les options.</p>';
                return;
            }

            optionValues.forEach((option, index) => {
                const isChecked = option === currentCorrectAnswer;
                const div = document.createElement('div');
                div.className = 'flex items-center';
                div.innerHTML = `
                    <input type="radio" id="correct-choice-${index}" name="correct-answer-radio" value="${option}" ${isChecked ? 'checked' : ''} class="mr-2 h-4 w-4 text-cyan-600 bg-gray-700 border-gray-600 focus:ring-cyan-500">
                    <label for="correct-choice-${index}" class="text-white">${option}</label>
                `;
                correctAnswerContainer.appendChild(div);
            });
        }

        function createOptionInput(value = '', index) {
            const div = document.createElement('div');
            div.className = 'flex items-center space-x-2';
            div.innerHTML = `
                <input type="text" placeholder="Option ${index + 1}" value="${value}" class="w-full p-2 rounded bg-gray-700 border border-gray-600 option-input">
                <button type="button" class="remove-option-btn bg-red-500 hover:bg-red-600 px-3 py-2 rounded-lg text-sm">X</button>
            `;
            div.querySelector('.remove-option-btn').addEventListener('click', removeOptionInput);

            div.querySelector('.option-input').addEventListener('input', () => {
                 const selectedRadio = document.querySelector('input[name="correct-answer-radio"]:checked');
                 renderCorrectAnswerChoices(selectedRadio ? selectedRadio.value : null);
            });
            
            return div;
        }

        function addOptionInput(value = '') {
            const count = optionsContainer.querySelectorAll('.option-input').length;
            optionsContainer.appendChild(createOptionInput(value, count));
            updateRemoveButtonsVisibility();
            renderCorrectAnswerChoices();
        }

        function removeOptionInput(event) {
            if (optionsContainer.querySelectorAll('.option-input').length > MIN_OPTIONS) {
                event.target.closest('div').remove();
                updateRemoveButtonsVisibility();
                updateOptionPlaceholders();
                renderCorrectAnswerChoices();
            } else {
                alert(`Une question doit avoir au moins ${MIN_OPTIONS} options.`);
            }
        }

        function updateRemoveButtonsVisibility() {
            const removeButtons = optionsContainer.querySelectorAll('.remove-option-btn');
            const show = removeButtons.length > MIN_OPTIONS;
            removeButtons.forEach(btn => btn.style.display = show ? 'block' : 'none');
        }
        
        function updateOptionPlaceholders() {
            optionsContainer.querySelectorAll('.option-input').forEach((input, index) => {
                input.placeholder = `Option ${index + 1}`;
            });
        }

        function openModal(question = null) {
            questionForm.reset();
            optionsContainer.innerHTML = '';
            
            if (question) {
                modalTitle.textContent = 'Éditer la Question';
                questionIdInput.value = question.id;
                questionTextInput.value = question.text;
                question.options.forEach(opt => addOptionInput(opt));
                renderCorrectAnswerChoices(question.correctAnswer);
            } else {
                modalTitle.textContent = 'Ajouter une Question';
                questionIdInput.value = '';
                for (let i = 0; i < 4; i++) addOptionInput();
                renderCorrectAnswerChoices();
            }
            
            updateRemoveButtonsVisibility();
            modal.classList.remove('hidden');
            modal.classList.add('modal-enter');
        }

        function closeModal() {
            modal.classList.add('modal-leave');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('modal-enter', 'modal-leave');
            }, 300);
        }
        
        addQuestionBtn.addEventListener('click', () => openModal());
        cancelBtn.addEventListener('click', closeModal);
        addOptionBtn.addEventListener('click', () => addOptionInput());

        questionsList.addEventListener('click', async (e) => {
            const token = sessionStorage.getItem(API_TOKEN_KEY);
            const session = sessionSelector.value;
            const id = e.target.dataset.id;
            
            if (e.target.classList.contains('edit-btn')) {
                const response = await fetch(`/admin/questions/${session}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const questions = await response.json();
                const questionToEdit = questions.find(q => q.id == id);
                if (questionToEdit) openModal(questionToEdit);
            }

            if (e.target.classList.contains('delete-btn')) {
                if (confirm('Êtes-vous sûr de vouloir supprimer cette question ?')) {
                    try {
                        const response = await fetch(`/admin/question/${session}/${id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (!response.ok) throw new Error('Échec de la suppression');
                        loadQuestionsForSelectedSession();
                    } catch (error) {
                        alert(error.message);
                    }
                }
            }
        });

        questionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const session = sessionSelector.value;
            const token = sessionStorage.getItem(API_TOKEN_KEY);
            const id = questionIdInput.value;
            const options = Array.from(optionsContainer.querySelectorAll('.option-input')).map(input => input.value.trim()).filter(Boolean);
            const questionText = questionTextInput.value.trim();
            
            const selectedRadio = document.querySelector('input[name="correct-answer-radio"]:checked');
            const correctAnswer = selectedRadio ? selectedRadio.value : null;
            
            if (!questionText || !correctAnswer || options.length < MIN_OPTIONS) {
                alert('Veuillez remplir le texte de la question, fournir au moins 2 options et sélectionner une réponse correcte.');
                return;
            }

            const questionData = { text: questionText, options, correctAnswer };
            const isEditing = !!id;
            const url = isEditing ? `/admin/question/${session}/${id}` : `/admin/question/${session}`;
            const method = isEditing ? 'PUT' : 'POST';

            try {
                const response = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(questionData)
                });
                if (!response.ok) {
                    const { error } = await response.json();
                    throw new Error(error || 'Échec de la sauvegarde');
                }
                closeModal();
                loadQuestionsForSelectedSession();
            } catch (error) {
                alert(error.message);
            }
        });

    // <<< ON DÉPLACE TOUT LE BLOC DE GESTION DES THÈMES ICI, AVANT LA FIN >>>

    // ==========================================================
    // ===         NOUVELLES FONCTIONS - GESTION DES THÈMES   ===
    // ==========================================================

    // Compact view for themes list: limit height and enable scroll
    if (themesList) {
        themesList.classList.add('max-h-64', 'overflow-y-auto', 'space-y-2');
    }

    // Helper to escape attribute values (used for tooltips)
    function escapeAttr(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Helper to truncate visible text
    function truncateText(s, n = 80) {
        const str = String(s || '');
        return str.length > n ? str.slice(0, n - 1) + '…' : str;
    }

    function showThemeStatus(message, isError = false) {
        themeStatus.textContent = message;
        themeStatus.className = isError ? 'text-red-400 text-sm mb-4 h-5' : 'text-green-400 text-sm mb-4 h-5';
        setTimeout(() => themeStatus.textContent = '', 5000);
    }

    // Affiche la liste des thèmes et initialise le glisser-déposer
    function displayThemes(data) {
        themesList.innerHTML = '';
        data.themes.forEach((theme, index) => {
            const themeElement = document.createElement('div');
            themeElement.className = 'theme-item group p-3 rounded-md flex justify-between items-center cursor-move';
            // Le thème actuel est mis en évidence
            themeElement.classList.toggle('bg-green-800', index === data.currentIndex);
            themeElement.classList.toggle('bg-gray-700', index !== data.currentIndex);
            
            themeElement.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <span class="text-gray-400 font-bold">${index + 1}.</span>
                    <span class="font-semibold text-white truncate max-w-[32rem]" data-theme="${escapeAttr(theme)}" title="${escapeAttr(theme)}">${escapeAttr(truncateText(theme, 80))}</span>
                    ${index === data.currentIndex ? '<span class="text-xs font-bold text-green-300 bg-green-900 px-2 py-1 rounded-full">ACTIF</span>' : ''}
                </div>
                <button data-theme="${escapeAttr(theme)}" class="delete-theme-btn bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity">X</button>
            `;
            themesList.appendChild(themeElement);
        });
    }

    // Active la fonctionnalité de glisser-déposer
    new Sortable(themesList, {
        animation: 150,
        ghostClass: 'bg-blue-900',
        onEnd: async function (evt) {
            const orderedThemes = Array.from(themesList.querySelectorAll('.font-semibold')).map(el => el.getAttribute('data-theme'));
            const token = sessionStorage.getItem(API_TOKEN_KEY);
            try {
                const response = await fetch('/admin/themes/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ orderedThemes })
                });
                if (!response.ok) throw new Error('Échec de la réorganisation.');
                loadAndDisplayThemes(); // Recharger pour afficher le nouvel état
                showThemeStatus('Ordre des thèmes sauvegardé !');
            } catch (error) {
                showThemeStatus(error.message, true);
            }
        }
    });

    // Charge et affiche les thèmes
    async function loadAndDisplayThemes() {
        themesList.innerHTML = '<p class="text-gray-400">Chargement...</p>';
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        try {
            const response = await fetch('/admin/themes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Impossible de charger les thèmes.');
            const data = await response.json();
            displayThemes(data);
        } catch(error) {
            showThemeStatus(error.message, true);
        }
    }

    // Ajoute un thème
    addThemeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const theme = themeNameInput.value.trim();
        if (!theme) return;

        const token = sessionStorage.getItem(API_TOKEN_KEY);

        try {
            const response = await fetch('/admin/themes', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ theme })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Une erreur est survenue.');
            }
            
            displayThemes(result);
            themeNameInput.value = '';
            showThemeStatus(`Thème "${theme}" ajouté avec succès.`);

        } catch (error) {
            showThemeStatus(error.message, true);
        }
    });

    // Supprime un thème
    themesList.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-theme-btn')) {
            const theme = e.target.dataset.theme;
            if (!confirm(`Êtes-vous sûr de vouloir supprimer le thème "${theme}" ?`)) return;

            const token = sessionStorage.getItem(API_TOKEN_KEY);
            try {
                const response = await fetch('/admin/themes', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ theme })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                
                displayThemes(result);
                showThemeStatus(`Thème "${theme}" supprimé.`);
            } catch (error) {
                showThemeStatus(error.message, true);
            }
        }
    });

    // ---- NOUVEAU : Gestion de l'historique des questions ----
    if (resetHistoryBtn) {
        resetHistoryBtn.addEventListener('click', async () => {
            if (!confirm("Êtes-vous sûr de vouloir purger l'historique des questions ?\n\nL'IA pourrait régénérer des questions similaires à d'anciennes sessions. Cette action est irréversible.")) {
                return;
            }

            historyResetStatus.textContent = 'Purge en cours...';
            historyResetStatus.className = 'text-yellow-400 text-sm mt-3';

            try {
                const token = sessionStorage.getItem(API_TOKEN_KEY);
                const response = await fetch('/admin/reset-question-history', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                
                historyResetStatus.textContent = result.message;
                historyResetStatus.className = 'text-green-400 text-sm mt-3 h-5';

            } catch (error) {
                historyResetStatus.textContent = `Erreur : ${error.message}`;
                historyResetStatus.className = 'text-red-500 text-sm mt-3 h-5';
            }
        });
    }

    updateWinnersBtn.addEventListener('click', async () => {
        const maxWinners = maxWinnersInput.value;
        const token = sessionStorage.getItem(API_TOKEN_KEY);

        if (!maxWinners || parseInt(maxWinners, 10) <= 0) {
            alert('Veuillez entrer un nombre de gagnants valide.');
            return;
        }

        const prizeMode = prizeModeManualRadio.checked ? 'manual' : 'automatic';
        
        const prizeInputs = document.querySelectorAll('.prize-input');
        const prizes = Array.from(prizeInputs).map(input => ({
            rank: parseInt(input.dataset.rank, 10),
            amount: parseInt(input.value, 10) || 0
        }));

        winnersUpdateStatus.textContent = 'Mise à jour...';
        winnersUpdateStatus.className = 'text-yellow-400 text-sm mt-3';

        try {
            const response = await fetch('/admin/competition-rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ 
                    maxWinners: parseInt(maxWinners, 10),
                    prizes: prizes,
                    prizeMode: prizeMode // On envoie le mode choisi
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            
            winnersUpdateStatus.textContent = result.message;
            winnersUpdateStatus.className = 'text-green-400 text-sm mt-3';

            loadAndDisplayWinners();

        } catch (error) {
            winnersUpdateStatus.textContent = `Erreur : ${error.message}`;
            winnersUpdateStatus.className = 'text-red-500 text-sm mt-3';
        }
    });

    // AJOUTEZ CE BLOC
    if (updatePriceBtn) {
        updatePriceBtn.addEventListener('click', async () => {
            const price = competitionPriceInput.value;
            const token = sessionStorage.getItem(API_TOKEN_KEY);

            if (!price || parseInt(price, 10) < 0) {
                alert('Veuillez entrer un prix valide (0 ou plus).');
                return;
            }

            priceUpdateStatus.textContent = 'Mise à jour...';
            priceUpdateStatus.className = 'text-yellow-400 text-sm mt-3';

            try {
                const response = await fetch('/admin/competition-rules', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ price: parseInt(price, 10) })
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                
                priceUpdateStatus.textContent = result.message;
                priceUpdateStatus.className = 'text-green-400 text-sm mt-3';

            } catch (error) {
                priceUpdateStatus.textContent = `Erreur : ${error.message}`;
                priceUpdateStatus.className = 'text-red-500 text-sm mt-3';
            }
        });
    }

    // ==========================================================
    // ==     NOUVEAU : LOGIQUE D'IMPORT/EXPORT EN MASSE       ==
    // ==========================================================

    // Gère le clic sur le bouton de téléchargement
    if (downloadAllSessionsBtn) {
        downloadAllSessionsBtn.addEventListener('click', async () => {
            const token = sessionStorage.getItem(API_TOKEN_KEY);
            
            massEditStatus.textContent = 'Téléchargement en cours...';
            massEditStatus.className = 'text-yellow-400 text-sm mt-4 h-5 animate-pulse';

            try {
                const response = await fetch('/admin/questions/download-all', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error('Échec du téléchargement.');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                
                // Crée un lien invisible, le clique, puis le supprime pour lancer le téléchargement
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'french_quest_questions_export.json';
                document.body.appendChild(a);
                a.click();
                
                // Nettoyage
                window.URL.revokeObjectURL(url);
                a.remove();

                massEditStatus.textContent = 'Fichier téléchargé !';
                massEditStatus.className = 'text-green-400 text-sm mt-4 h-5';

            } catch (error) {
                massEditStatus.textContent = `Erreur : ${error.message}`;
                massEditStatus.className = 'text-red-500 text-sm mt-4 h-5';
            } finally {
                setTimeout(() => {
                    massEditStatus.textContent = '';
                    massEditStatus.classList.remove('animate-pulse');
                }, 5000);
            }
        });
    }

    // Gère le clic sur le bouton d'importation
    if (uploadAllSessionsBtn) {
        uploadAllSessionsBtn.addEventListener('click', async () => {
            const token = sessionStorage.getItem(API_TOKEN_KEY);
            const file = importQuestionsFile.files[0];

            if (!file) {
                massEditStatus.textContent = 'Veuillez d\'abord sélectionner un fichier.';
                massEditStatus.className = 'text-red-500 text-sm mt-4 h-5';
                return;
            }

            massEditStatus.textContent = 'Importation en cours...';
            massEditStatus.className = 'text-yellow-400 text-sm mt-4 h-5 animate-pulse';
            uploadAllSessionsBtn.disabled = true;

            // On utilise FormData pour envoyer le fichier
            const formData = new FormData();
            formData.append('questionsFile', file);

            try {
                const response = await fetch('/admin/questions/upload-all', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData // Pas besoin de 'Content-Type', le navigateur le gère.
                });

                const result = await response.json();
                if (!response.ok) throw new Error(result.error);

                massEditStatus.textContent = result.message;
                massEditStatus.className = 'text-green-400 text-sm mt-4 h-5';
                
                // On rafraîchit la liste des questions affichées pour refléter les changements
                loadQuestionsForSelectedSession();

            } catch (error) {
                massEditStatus.textContent = `Erreur : ${error.message}`;
                massEditStatus.className = 'text-red-500 text-sm mt-4 h-5';
            } finally {
                uploadAllSessionsBtn.disabled = false;
                importQuestionsFile.value = ''; // Réinitialise le champ de fichier
                massEditStatus.classList.remove('animate-pulse');
                setTimeout(() => { massEditStatus.textContent = ''; }, 8000);
            }
        });
    }

// ---- GESTION DES DÉPÔTS ----
const refreshDepositsBtn = document.getElementById('refresh-deposits-btn');
const depositsList = document.getElementById('deposits-list');
const depositsCount = document.getElementById('deposits-count');
const depositsStatus = document.getElementById('deposits-status');

async function loadPendingDeposits() {
    try {
        depositsStatus.textContent = '';
        depositsList.innerHTML = '<p class="text-gray-400">Chargement...</p>';

        const response = await fetch('/admin/deposits/pending', {
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem(API_TOKEN_KEY)}`
            }
        });

        if (!response.ok) {
            throw new Error('Impossible de charger les dépôts');
        }

        const deposits = await response.json();

        depositsCount.textContent = `${deposits.length} dépôt(s) en attente`;

        if (deposits.length === 0) {
            depositsList.innerHTML = '<p class="text-gray-400">Aucun dépôt en attente.</p>';
            return;
        }

        depositsList.innerHTML = deposits.map(deposit => {
            const date = new Date(deposit.requested_at);
            const formattedDate = date.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            return `
                <div class="bg-gray-700 p-4 rounded-lg border border-gray-600">
                    <div class="flex justify-between items-start mb-3">
                        <div>
                            <h4 class="font-semibold text-white">${deposit.username}</h4>
                            <p class="text-sm text-gray-300">Téléphone: ${deposit.paymentPhone || 'Non renseigné'}</p>
                            <p class="text-sm text-gray-400">Demandé le ${formattedDate}</p>
                        </div>
                        <div class="text-right">
                            <div class="text-xl font-bold text-yellow-400">${deposit.amount} Ar</div>
                            <div class="text-sm text-gray-400">Réf: ${deposit.transaction_ref}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="approveDeposit(${deposit.id})" 
                                class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                            Approuver
                        </button>
                        <button onclick="rejectDeposit(${deposit.id})" 
                                class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
                            Rejeter
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Erreur lors du chargement des dépôts:', error);
        depositsStatus.textContent = `Erreur: ${error.message}`;
        depositsStatus.className = 'text-red-500 text-sm mt-4 h-5';
        depositsList.innerHTML = '<p class="text-red-400">Erreur lors du chargement.</p>';
    }
}

window.approveDeposit = async function(depositId) {
    if (!confirm('Êtes-vous sûr de vouloir approuver ce dépôt ?')) {
        return;
    }

    try {
        depositsStatus.textContent = 'Approbation en cours...';
        depositsStatus.className = 'text-yellow-500 text-sm mt-4 h-5';

        const response = await fetch(`/admin/deposits/${depositId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem(API_TOKEN_KEY)}`
            }
        });

        const result = await response.json();

        if (response.ok) {
            depositsStatus.textContent = result.message;
            depositsStatus.className = 'text-green-500 text-sm mt-4 h-5';
            // Recharger la liste
            setTimeout(() => loadPendingDeposits(), 1000);
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('Erreur lors de l\'approbation:', error);
        depositsStatus.textContent = `Erreur: ${error.message}`;
        depositsStatus.className = 'text-red-500 text-sm mt-4 h-5';
    }

    setTimeout(() => { depositsStatus.textContent = ''; }, 5000);
};

window.rejectDeposit = async function(depositId) {
    const reason = prompt('Raison du rejet (optionnel):');
    if (reason === null) return; // Annulé

    if (!confirm('Êtes-vous sûr de vouloir rejeter ce dépôt ?')) {
        return;
    }

    try {
        depositsStatus.textContent = 'Rejet en cours...';
        depositsStatus.className = 'text-yellow-500 text-sm mt-4 h-5';

        const response = await fetch(`/admin/deposits/${depositId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem(API_TOKEN_KEY)}`
            },
            body: JSON.stringify({ reason: reason || 'Aucune raison spécifiée' })
        });

        const result = await response.json();

        if (response.ok) {
            depositsStatus.textContent = result.message;
            depositsStatus.className = 'text-green-500 text-sm mt-4 h-5';
            // Recharger la liste
            setTimeout(() => loadPendingDeposits(), 1000);
        } else {
            throw new Error(result.error);
        }

    } catch (error) {
        console.error('Erreur lors du rejet:', error);
        depositsStatus.textContent = `Erreur: ${error.message}`;
        depositsStatus.className = 'text-red-500 text-sm mt-4 h-5';
    }

    setTimeout(() => { depositsStatus.textContent = ''; }, 5000);
};

if (refreshDepositsBtn) {
    refreshDepositsBtn.addEventListener('click', loadPendingDeposits);
}

// ---- GESTION DE LA CAGNOTTE ----
async function loadPrizePoolInfo() {
    try {
        const token = sessionStorage.getItem(API_TOKEN_KEY);
        const response = await fetch('/admin/prize-pool', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Erreur lors du chargement de la cagnotte');
        }

        const data = await response.json();
        
        // Mettre à jour les éléments d'affichage
        if (participantsCount) participantsCount.textContent = data.participantsCount;
        if (entryFee) entryFee.textContent = `${data.entryFee} Ar`;
        if (totalPrizePool) totalPrizePool.textContent = `${data.totalPrizePool} Ar`;
        if (adminCommission) adminCommission.textContent = `${data.adminCommission} Ar`;
        if (prizesPool) prizesPool.textContent = `${data.prizesPool} Ar`;
        if (maxWinners) maxWinners.textContent = data.maxWinners;
        
        // Afficher la distribution des prix
        if (prizeDistributionList && data.prizeDistribution) {
            prizeDistributionList.innerHTML = '';
            data.prizeDistribution.forEach(prize => {
                const prizeDiv = document.createElement('div');
                prizeDiv.className = 'flex justify-between items-center p-2 bg-gray-600 rounded';
                
                const positionText = prize.position === 1 ? '🥇 1er place' : 
                                   prize.position === 2 ? '🥈 2ème place' : 
                                   prize.position === 3 ? '🥉 3ème place' : 
                                   `🏆 ${prize.position}ème place`;
                
                const percentageText = prize.percentage > 0 ? ` (${prize.percentage}%)` : '';
                
                prizeDiv.innerHTML = `
                    <span class="font-medium">${positionText}${percentageText}</span>
                    <span class="font-bold text-yellow-400">${prize.amount} Ar</span>
                `;
                prizeDistributionList.appendChild(prizeDiv);
            });
        }
        
        if (prizePoolStatus) {
            prizePoolStatus.textContent = 'Cagnotte mise à jour avec succès';
            prizePoolStatus.className = 'text-green-500 text-sm mt-4 h-5';
            setTimeout(() => { prizePoolStatus.textContent = ''; }, 3000);
        }
        
    } catch (error) {
        console.error('Erreur lors du chargement de la cagnotte:', error);
        if (prizePoolStatus) {
            prizePoolStatus.textContent = `Erreur: ${error.message}`;
            prizePoolStatus.className = 'text-red-500 text-sm mt-4 h-5';
            setTimeout(() => { prizePoolStatus.textContent = ''; }, 5000);
        }
    }
}

if (refreshPrizePoolBtn) {
    refreshPrizePoolBtn.addEventListener('click', loadPrizePoolInfo);
}

    // Lancement initial
    if (sessionStorage.getItem(API_TOKEN_KEY)) {
        adminLoginSection.classList.add('hidden');
        adminPanelSection.classList.remove('hidden');
        loadQuestionsForSelectedSession();
        loadCompetitionInfo();
        loadCompetitionRules();
        loadAndDisplayWinners();
        loadUsersForReset();
        loadAdminBooks();
        loadAndDisplayThemes();
        loadPrompts();
        loadPendingDeposits(); // Charger les dépôts
        loadPrizePoolInfo(); // Charger la cagnotte
    }
});