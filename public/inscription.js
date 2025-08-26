// NOUVELLE FONCTION AMÉLIORÉE (remplace l'ancienne showNotification)
function showToast(title, message, type = 'info', duration = 5000) {
  // S'assure que le conteneur est créé s'il n'existe pas
  let container = document.getElementById('toast-container');
  if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
  }

  // Création de l'élément toast
  const toastElement = document.createElement('div');
  toastElement.className = `toast ${type}`;

  const icons = { info: 'ℹ️', success: '✅', error: '❌' };
  const icon = icons[type] || '🔔';

  toastElement.innerHTML = `
      <div class="toast__icon">${icon}</div>
      <div class="toast__content">
          <p class="toast__title">${title}</p>
          <p class="toast__message">${message}</p>
      </div>
  `;

  container.appendChild(toastElement);

  setTimeout(() => {
      toastElement.classList.add('toast--exit');
      toastElement.addEventListener('animationend', () => toastElement.remove());
  }, duration);
}

async function register() {
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const paymentPhone = document.getElementById('register-phone').value; // On récupère le numéro

  // On vérifie les 3 champs
  if (!username || !password || !paymentPhone) {
    showToast('Champs manquants', 'Veuillez remplir tous les champs.', 'error');
    return;
  }

  const response = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, paymentPhone }), // On envoie le numéro
  });

  const result = await response.json();
  if (result.error) {
    showToast('Erreur d\'inscription', result.error, 'error');
  } else {
    showToast('Inscription réussie !', 'Vous allez être redirigé vers la page de connexion.', 'success');
    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);
  }
}

// On n'a plus besoin de ces anciennes fonctions pour ces pages simples.
// document.addEventListener('DOMContentLoaded', ...);
// function updateView() { ... }
// async function loadTranslations() { ... }