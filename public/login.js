document.addEventListener('DOMContentLoaded', () => {
  updateView();
  window.addEventListener('popstate', updateView);
});

function updateView() {
  const path = window.location.pathname;
  const authSection = document.getElementById('auth');
  if (authSection) {
    authSection.style.display = (path === '/login' || path === '/') ? 'block' : 'none';
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

function navigateTo(route) {
  window.history.pushState({}, '', route);
  updateView();
}

async function login() {
  const username = document.getElementById('login-username')?.value;
  const password = document.getElementById('login-password')?.value;
  if (!username || !password) {
    showNotification('Veuillez remplir tous les champs.', 'error');
    return;
  }

  const response = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const result = await response.json();
  if (result.error) {
    showNotification(result.error, 'error');
  } else {
    showNotification('Connexion réussie', 'success');
    setTimeout(() => {
      window.location.href = '/menu';
    }, 2000);
  }
}