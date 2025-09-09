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
    
    // Poser les flags pour afficher le toast de bienvenue et la modale "Comment Jouer ?"
    sessionStorage.setItem('showWelcomeToast', 'true');
    sessionStorage.setItem('showHowToPlay', 'true');
    
    setTimeout(() => {
      window.location.href = '/menu';
    }, 2000);
  }
}