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

async function login() {
const username = document.getElementById('login-username')?.value;
const password = document.getElementById('login-password')?.value;
if (!username || !password) {
  showToast('Champs manquants', 'Veuillez remplir tous les champs.', 'error');
  return;
}

const response = await fetch('/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});

const result = await response.json();
if (result.error) {
  showToast('Erreur de connexion', result.error, 'error');
} else {
  showToast('Bienvenue !', 'Connexion réussie. Redirection en cours...', 'success');
  setTimeout(() => {
    window.location.href = '/menu';
  }, 2000);
}
}