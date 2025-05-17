function navigateTo(route) {
    window.history.pushState({}, '', route);
    window.location.reload();
  }
  
  document.getElementById('start-bepc-btn').addEventListener('click', () => {
    alert('Démarrage de l\'apprentissage pour le sujet BEPC !');
    // Vous pouvez ajouter ici la logique pour charger des questions ou démarrer une activité
  });