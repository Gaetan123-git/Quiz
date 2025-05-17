let currentQuestion = null;
let questions = [];
let startTime = null;
let timerInterval = null;
let totalQuestions = 0;
let wordTranslations = {};

// Messages de félicitation pour les réponses correctes
const congratulationMessages = [
  "Super travail ! Continue comme ça !",
  "Excellent ! Tu es sur la bonne voie !",
  "Bravo ! Quelle belle réponse !",
  "Génial ! Tu maîtrises bien !",
  "Magnifique ! Tu progresses à grands pas !"
];

// Messages d'encouragement pour les réponses incorrectes
const encouragementMessages = [
  "Ce n'est pas grave, tu vas y arriver !",
  "Ne t'inquiète pas, continue d'apprendre !",
  "Tu peux faire mieux, essaie encore !",
  "Pas de souci, la prochaine sera la bonne !",
  "Courage, tu es sur le bon chemin !"
];

const songs = [
  { name: "Competition en direct", unlocked: true },
  {
    name: "Apprendre",
    unlocked: true,
    subMenu: [
      { name: "Français", logo: "🇫🇷", page: "french.html" },
      { name: "Anglais", logo: "🇬🇧", page: "english.html" },
      { name: "Chinois", logo: "🇨🇳", page: "chinese.html" },
      { name: "Sujet bac", logo: "📚", page: "bac.html" },
      { name: "Sujet BEPC", logo: "📚", page: "bepc.html" },
    ]
  }
];

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function loadTranslations() {
  try {
    const response = await fetch('/translations.json');
    wordTranslations = await response.json();
    console.log('Traductions chargées :', wordTranslations);
  } catch (error) {
    console.error('Erreur lors du chargement des traductions :', error);
    showNotification('Erreur lors du chargement des traductions.', 'error');
  }
}

function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  if (notification) {
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    setTimeout(() => {
      notification.style.display = 'none';
    }, 3000);
  }
}

function updateView() {
  const path = window.location.pathname;
  const songSelection = document.getElementById('song-selection');
  const game = document.getElementById('game');
  const logoutContainer = document.querySelector('.logout-container');

  if (songSelection) songSelection.style.display = 'none';
  if (game) game.style.display = 'none';
  if (logoutContainer) logoutContainer.style.display = 'none';

  if (path === '/menu') {
    checkSessionAndShowMenu();
  } else if (path === '/quiz') {
    checkSessionAndShowQuiz();
  } else {
    window.location.href = '/login';
  }
}

async function checkSessionAndShowMenu() {
  const response = await fetch('/check-session');
  const result = await response.json();
  if (result.loggedIn) {
    showSongSelection();
  } else {
    window.location.href = '/login';
    showNotification('Veuillez vous connecter.', 'error');
  }
}

async function checkSessionAndShowQuiz() {
  const response = await fetch('/check-session');
  const result = await response.json();
  if (result.loggedIn) {
    const game = document.getElementById('game');
    const logoutContainer = document.querySelector('.logout-container');
    if (game) game.style.display = 'block';
    if (logoutContainer) logoutContainer.style.display = 'block';
    questions = [];
    if (questions.length === 0) {
      await fetchQuestions();
    }
    setupLeaderboardStream();
  } else {
    window.location.href = '/login';
    showNotification('Veuillez vous connecter.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadTranslations();
  updateView();
  window.addEventListener('popstate', updateView);

  // Gestionnaire pour le bouton "Retour au menu"
  const returnMenuButton = document.getElementById('return-menu-button');
  if (returnMenuButton) {
    returnMenuButton.addEventListener('click', async () => {
      try {
        const response = await fetch('/reset-score', { method: 'POST' });
        const result = await response.json();
        if (result.message) {
          showNotification('Score réinitialisé. Retour au menu.', 'success');
          setTimeout(() => window.location.href = '/menu', 2000);
        } else {
          showNotification('Erreur lors de la réinitialisation du score.', 'error');
        }
      } catch (error) {
        console.error('Erreur lors de la réinitialisation du score :', error);
        showNotification('Erreur lors de la réinitialisation du score.', 'error');
      }
    });
  }
});

async function fetchQuestions() {
  const response = await fetch('/questions');
  questions = await response.json();
  totalQuestions = questions.length;
  if (questions.length > 0) {
    updateProgress();
    nextQuestion();
  } else {
    const question = document.getElementById('question');
    if (question) question.textContent = 'Aucune phrase disponible pour le moment.';
    const options = document.getElementById('options');
    if (options) options.style.display = 'none';
  }
}

function updateProgress() {
  const remainingQuestions = questions.length;
  const answeredQuestions = totalQuestions - remainingQuestions;
  const progress = (answeredQuestions / totalQuestions) * 100;
  const progressBar = document.querySelector('.progress');
  if (progressBar) progressBar.style.width = `${progress}%`;
}

function startTimer() {
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const timer = document.getElementById('timer');
    if (timer) timer.textContent = `Temps : ${elapsed}s`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  return Math.floor((Date.now() - startTime) / 1000);
}

function replayAudio() {
  const audioElement = document.getElementById('question-audio');
  if (audioElement) {
    audioElement.currentTime = 0;
    audioElement.play().catch(error => {
      console.error('Erreur lors de la relecture :', error);
      showNotification('Erreur lors de la relecture de l’audio.', 'error');
    });
  }
}

function nextQuestion() {
  if (questions.length === 0) {
    const question = document.getElementById('question');
    const options = document.getElementById('options');
    const correctTranslation = document.getElementById('correct-translation');
    const imgElement = document.getElementById('registration-form-img');
    const timer = document.getElementById('timer');
    const returnMenuContainer = document.getElementById('return-menu-container');
    if (question) question.textContent = 'Plus de phrases à traduire !';
    if (options) options.style.display = 'none';
    if (correctTranslation) correctTranslation.textContent = '';
    if (imgElement) imgElement.style.display = 'none';
    if (timer) timer.textContent = 'Quiz terminé !';
    if (returnMenuContainer) returnMenuContainer.style.display = 'block';
    return;
  }

  currentQuestion = questions.shift();
  updateProgress();

  const imgElement = document.getElementById('registration-form-img');
  if (imgElement) {
    if (currentQuestion.id === 2) {
      imgElement.src = '/photo/formulaire.png';
      imgElement.style.display = 'block';
      imgElement.alt = "Formulaire d'inscription";
    } else if (currentQuestion.id === 6) {
      imgElement.src = '/photo/boulangerie.png';
      imgElement.style.display = 'block';
      imgElement.alt = "Gâteau à la boulangerie";
    } else if (currentQuestion.id === 10) {
      imgElement.src = '/photo/collègue.png';
      imgElement.style.display = 'block';
      imgElement.alt = "Email de collègue";
    } else if (currentQuestion.id === 13) {
      imgElement.src = '/photo/SMS.png';
      imgElement.style.display = 'block';
      imgElement.alt = "SMS reçu";
    } else if (currentQuestion.id === 15) {
      imgElement.src = '/photo/aéroport.png';
      imgElement.style.display = 'block';
      imgElement.alt = "Panneau d'indication des vols";
    } else {
      imgElement.style.display = 'none';
    }
  }

  const feedback = document.getElementById('feedback');
  const correctTranslation = document.getElementById('correct-translation');
  const options = document.getElementById('options');
  const returnMenuContainer = document.getElementById('return-menu-container');
  if (feedback) feedback.textContent = '';
  if (correctTranslation) correctTranslation.textContent = '';
  if (options) options.style.display = 'block';
  if (returnMenuContainer) returnMenuContainer.style.display = 'none';

  if (currentQuestion.id === 3) {
    const question = document.getElementById('question');
    if (question) {
      question.innerHTML = `
        <div class="context">
          <p>Vous êtes en vacances en France et vous demandez des informations à un habitant. Complétez la phrase suivante :</p>
        </div>
        <div class="sentence-gap">
          <p>Excusez-moi, <span class="gap">______</span> vous où se trouve la gare, s’il vous plaît ?</p>
        </div>
      `;
    }

    const shuffledOptions = shuffleArray(currentQuestion.options);
    const optionsContainer = document.getElementById('options');
    if (optionsContainer) {
      optionsContainer.innerHTML = shuffledOptions
        .map((option, index) => `<button class="option-btn" data-option="${index}">${option}</button>`)
        .join('');
    }

    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const optionIndex = button.getAttribute('data-option');
        const selectedOption = shuffledOptions[optionIndex];
        submitAnswer(selectedOption);
      });
    });
  } else if (currentQuestion.id === 5) {
    const question = document.getElementById('question');
    if (question) {
      question.innerHTML = `
        <div class="audio-question">
          <p>${currentQuestion.text}</p>
          <audio id="question-audio" controls src="${currentQuestion.audio}"></audio>
          <button class="replay-btn" onclick="replayAudio()">Réécouter</button>
          <p class="english-hint">${currentQuestion.englishHint || ''}</p>
        </div>
      `;
    }

    const audioElement = document.getElementById('question-audio');
    if (audioElement) {
      audioElement.play().catch(error => {
        console.error('Erreur lors de la lecture automatique :', error);
        showNotification('Lecture automatique bloquée. Cliquez sur Réécouter.', 'info');
      });
    }

    const shuffledImages = shuffleArray(currentQuestion.images);
    const optionsContainer = document.getElementById('options');
    if (optionsContainer) {
      optionsContainer.innerHTML = `
        <div class="image-options">
          ${shuffledImages.map((img, index) => `
            <div class="image-option" data-correct="${img.correct}">
              <img src="${img.src}" alt="Option ${index + 1}">
            </div>
          `).join('')}
        </div>
      `;
    }

    const imageOptions = document.querySelectorAll('.image-option');
    imageOptions.forEach(option => {
      option.addEventListener('click', function() {
        const isCorrect = this.getAttribute('data-correct') === 'true';
        submitAnswer(isCorrect ? currentQuestion.correctAnswer : "Mauvaise image");
      });
    });
  } else if ([7, 9, 12, 14].includes(currentQuestion.id)) {
    const question = document.getElementById('question');
    if (question) {
      question.innerHTML = `
        <div class="audio-question">
          <p>${currentQuestion.text}</p>
          <audio id="question-audio" controls src="${currentQuestion.audio}"></audio>
          <button class="replay-btn" onclick="replayAudio()">Réécouter</button>
          <p class="english-hint">${currentQuestion.englishHint || ''}</p>
        </div>
      `;
    }

    const audioElement = document.getElementById('question-audio');
    if (audioElement) {
      audioElement.play().catch(error => {
        console.error('Erreur lors de la lecture automatique :', error);
        showNotification('Lecture automatique bloquée. Cliquez sur Réécouter.', 'info');
      });
    }

    const shuffledOptions = shuffleArray(currentQuestion.options);
    const optionsContainer = document.getElementById('options');
    if (optionsContainer) {
      optionsContainer.innerHTML = shuffledOptions
        .map((option, index) => `<button class="option-btn" data-option="${index}">${option}</button>`)
        .join('');
    }

    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const optionIndex = button.getAttribute('data-option');
        const selectedOption = shuffledOptions[optionIndex];
        submitAnswer(selectedOption);
      });
    });
  } else if (currentQuestion.id === 11) {
    const question = document.getElementById('question');
    if (question) {
      question.innerHTML = `
        <div class="context">
          <p>Un collègue vous invite au restaurant avec des amis. Vous répondez.</p>
        </div>
        <div class="sentence-gap">
          <p>Merci ! Nous <span class="gap">____________</span> avec plaisir. Tu penses aller au restaurant vers quelle heure ?</p>
        </div>
      `;
    }

    const shuffledOptions = shuffleArray(currentQuestion.options);
    const optionsContainer = document.getElementById('options');
    if (optionsContainer) {
      optionsContainer.innerHTML = shuffledOptions
        .map((option, index) => `<button class="option-btn" data-option="${index}">${option}</button>`)
        .join('');
    }

    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const optionIndex = button.getAttribute('data-option');
        const selectedOption = shuffledOptions[optionIndex];
        submitAnswer(selectedOption);
      });
    });
  } else if (currentQuestion.id === 13) {
    const question = document.getElementById('question');
    if (question) {
      question.innerHTML = `
        <div class="image-question">
          <p>${currentQuestion.text}</p>
          <p class="english-hint">${currentQuestion.englishHint || ''}</p>
        </div>
      `;
    }

    const optionsContainer = document.getElementById('options');
    const shuffledImages = shuffleArray(currentQuestion.options);
    if (optionsContainer) {
      optionsContainer.innerHTML = `
        <div class="image-options">
          ${shuffledImages.map((img, index) => `
            <div class="image-option" data-correct="${img.correct}">
              <img src="${img.src}" alt="Option ${index + 1}" style="width: auto; height: auto; max-width: 300px; max-height: 300px; cursor: pointer;">
            </div>
          `).join('')}
        </div>
      `;
    }

    const imageElements = document.querySelectorAll('img');
    imageElements.forEach(img => {
      img.style.width = 'auto';
      img.style.height = 'auto';
      img.style.maxWidth = '300px';
      img.style.maxHeight = '300px';
    });

    const imageOptions = document.querySelectorAll('.image-option');
    imageOptions.forEach(option => {
      option.addEventListener('click', function() {
        const isCorrect = this.getAttribute('data-correct') === 'true';
        submitAnswer(isCorrect ? currentQuestion.correctAnswer : "Mauvaise image");
      });
    });
  } else {
    const question = document.getElementById('question');
    if (question) {
      const words = currentQuestion.text.split(' ').map(word => {
        const cleanWord = word.replace(/[.,!?]/g, '').toLowerCase();
        const translation = wordTranslations[cleanWord] || 'Non traduit';
        return `<span class="word" data-translation="${translation}">${word}</span>`;
      }).join(' ');
      question.innerHTML = `
        <div class="text-question">
          <p>${words}</p>
          <p class="english-hint">${currentQuestion.englishHint || ''}</p>
        </div>
      `;
    }

    const shuffledOptions = shuffleArray(currentQuestion.options);
    const optionsContainer = document.getElementById('options');
    if (optionsContainer) {
      optionsContainer.innerHTML = shuffledOptions
        .map((option, index) => `<button class="option-btn" data-option="${index}">${option}</button>`)
        .join('');
    }

    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const optionIndex = button.getAttribute('data-option');
        const selectedOption = shuffledOptions[optionIndex];
        submitAnswer(selectedOption);
      });
    });
  }

  if ([1, 4, 8].includes(currentQuestion.id)) {
    const wordElements = document.querySelectorAll('.word');
    wordElements.forEach(word => {
      word.addEventListener('mouseover', () => {
        const tooltip = document.createElement('span');
        tooltip.className = 'tooltip';
        tooltip.textContent = word.getAttribute('data-translation');
        word.appendChild(tooltip);
      });
      word.addEventListener('mouseout', () => {
        const tooltip = word.querySelector('.tooltip');
        if (tooltip) tooltip.remove();
      });
    });
  }

  startTimer();
}

async function submitAnswer(selectedOption) {
  const timeTaken = stopTimer();
  const response = await fetch('/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      questionId: currentQuestion.id,
      answer: selectedOption,
      timeTaken,
    }),
  });

  const result = await response.json();
  const randomCongratulation = congratulationMessages[Math.floor(Math.random() * congratulationMessages.length)];
  const randomEncouragement = encouragementMessages[Math.floor(Math.random() * encouragementMessages.length)];

  const feedback = document.getElementById('feedback');
  const correctTranslation = document.getElementById('correct-translation');
  if (feedback) feedback.textContent = result.isCorrect
    ? `Correct ! Score : ${result.score.toFixed(2)} Ar - ${randomCongratulation}`
    : `Incorrect. ${randomEncouragement}`;
  if (correctTranslation) correctTranslation.textContent = `Réponse correcte : ${result.correctAnswer}`;
  const options = document.getElementById('options');
  if (options) options.innerHTML = '';

  setTimeout(() => {
    nextQuestion();
  }, 2000);
}

function showSongSelection() {
  const songSelection = document.getElementById('song-selection');
  if (songSelection) songSelection.style.display = 'block';
  const songList = document.getElementById('song-list');
  if (songList) {
    songList.innerHTML = songs.map(song => {
      if (song.subMenu) {
        return `
          <div class="song-item ${song.unlocked ? 'unlocked' : 'locked'}">
            <div class="song-icon">${song.unlocked ? '🎓' : '🔒'}</div>
            <div class="song-title">${song.name}</div>
            <div class="sub-menu">
              ${song.unlocked ? song.subMenu.map(subItem => `
                <a href="${subItem.page}" class="sub-menu-item">
                  <span class="sub-menu-logo">${subItem.logo}</span>
                  <span>${subItem.name}</span>
                </a>
              `).join('') : '<span>Verrouillé</span>'}
            </div>
          </div>
        `;
      }
      return `
        <div class="song-item ${song.unlocked ? 'unlocked' : 'locked'}">
          <div class="song-icon">${song.unlocked ? '🎵' : '🔒'}</div>
          <div class="song-title">${song.name}</div>
          ${song.unlocked ? `<button onclick="startGame('${song.name}')">Jouer</button>` : '<span>Verrouillé</span>'}
        </div>
      `;
    }).join('');
  }
}

function startGame(songName) {
  if (songName === "Competition en direct") {
    window.location.href = '/quiz';
  }
}

async function logout() {
  try {
    const response = await fetch('/logout', { method: 'POST' });
    const result = await response.json();
    if (result.error) {
      showNotification(result.error, 'error');
    } else {
      showNotification('Déconnexion réussie', 'success');
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    }
  } catch (error) {
    console.error('Erreur lors de la déconnexion :', error);
    showNotification('Erreur lors de la déconnexion.', 'error');
  }
}

function updateLeaderboard(leaderboard) {
  const leaderboardList = document.getElementById('leaderboard-list');
  if (leaderboardList) {
    const topPlayers = leaderboard.slice(0, 10);
    leaderboardList.innerHTML = topPlayers
      .map((entry, index) => `<li>${index + 1}. ${entry.username}: ${entry.score.toFixed(2)} Ar</li>`)
      .join('');
  }
}

function setupLeaderboardStream() {
  const eventSource = new EventSource('/leaderboard-stream');

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('Événement reçu du flux :', data);
      updateLeaderboard(data.leaderboard);

      if (data.newUser) {
        showNotification(`${data.newUser} a rejoint le quiz !`, 'info');
      }
      if (data.leftUser) {
        showNotification(`${data.leftUser} a quitté le quiz.`, 'info');
      }
    } catch (error) {
      console.error('Erreur lors du traitement de l’événement du flux :', error);
      showNotification('Erreur dans la mise à jour du classement.', 'error');
    }
  };

  eventSource.onerror = (error) => {
    console.error('Erreur EventSource :', error);
    showNotification('Connexion au classement interrompue. Réessayez plus tard.', 'error');
    eventSource.close();
  };
}