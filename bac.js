function navigateTo(route) {
    window.history.pushState({}, '', route);
    window.location.reload();
  }
  
  document.getElementById('start-bac-btn').addEventListener('click', () => {
    alert('Démarrage de l\'apprentissage pour le sujet bac !');
    // Vous pouvez ajouter ici la logique pour charger des questions ou démarrer une activité
  });