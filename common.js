let wordTranslations = {};

// Fonction pour mélanger un tableau (Fisher-Yates Shuffle)
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Charger les traductions depuis translations.json
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

// Fonction pour afficher une notification
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

// Gestion des routes
function navigateTo(route) {
  window.history.pushState({}, '', route);
  updateView();
}

// Cette fonction sera appelée par chaque page pour gérer l'affichage
function updateView() {
  const path = window.location.pathname;
  // La logique spécifique à chaque page sera gérée dans les fichiers respectifs
  // Cette fonction reste ici pour la navigation globale
}