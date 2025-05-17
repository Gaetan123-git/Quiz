document.addEventListener('DOMContentLoaded', async () => {
  await loadTranslations();
  updateView();
  window.addEventListener('popstate', updateView);
});

function updateView() {
  const path = window.location.pathname;
  const authSection = document.getElementById('auth');
  if (authSection) {
    authSection.style.display = (path === '/inscription') ? 'block' : 'none';
  }
}

async function loadTranslations() {
  try {
    const response = await fetch('/translations.json');
    const wordTranslations = await response.json();
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

async function register() {
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;

  if (!username || !password) {
    showNotification('Veuillez remplir tous les champs.', 'error');
    return;
  }

  const response = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const result = await response.json();
  if (result.error) {
    showNotification(result.error, 'error');
  } else {
    showNotification('Inscription réussie', 'success');
    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);
  }
}