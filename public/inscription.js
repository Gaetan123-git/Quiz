// NOUVEAU : Logique pour lire le code de parrainage depuis l'URL
document.addEventListener('DOMContentLoaded', () => {
    // Crée un objet pour manipuler les paramètres de l'URL actuelle
    const urlParams = new URLSearchParams(window.location.search);
    
    // Récupère la valeur du paramètre 'ref' (ex: ?ref=MONCODE)
    const referralCodeFromUrl = urlParams.get('ref');
    
    // Si un code a été trouvé dans l'URL
    if (referralCodeFromUrl) {
        // Trouve le champ de saisie du code de parrainage
        const referralInput = document.getElementById('register-referral');
        if (referralInput) {
            // Remplit automatiquement le champ avec le code
            referralInput.value = referralCodeFromUrl;
            // Affiche une notification pour informer l'utilisateur
            showToast('Code de Parrainage Appliqué !', `Vous avez été invité par ${referralCodeFromUrl}.`, 'info');
        }
    }
});

// Le reste du fichier (fonction showToast, fonction register) reste inchangé


async function register() {
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const paymentPhone = document.getElementById('register-phone').value;
  const referralCode = document.getElementById('register-referral').value;

  if (!username || !password || !paymentPhone) {
    showToast('Champs manquants', 'Veuillez remplir tous les champs obligatoires.', 'error');
    return;
  }

  const response = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, paymentPhone, referralCode }),
  });

  const result = await response.json();
  if (result.error) {
    showToast('Erreur d\'inscription', result.error, 'error');
  } else {
    // On affiche un message de bienvenue et on redirige directement vers le menu
    showToast('Bienvenue !', 'Inscription réussie. Redirection en cours...', 'success');
    
    // Poser les flags pour afficher le toast de bienvenue et la modale "Comment Jouer ?"
    sessionStorage.setItem('showWelcomeToast', 'true');
    sessionStorage.setItem('showHowToPlay', 'true');
    
    setTimeout(() => {
      window.location.href = '/menu';
    }, 1500); // On laisse un court instant pour que l'utilisateur voie le message
  }
}

// On n'a plus besoin de ces anciennes fonctions pour ces pages simples.
// document.addEventListener('DOMContentLoaded', ...);
// function updateView() { ... }
// async function loadTranslations() { ... }