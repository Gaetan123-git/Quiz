function navigateTo(route) {
    window.history.pushState({}, '', route);
    window.location.reload();
  }
  
  document.getElementById('start-chinese-btn').addEventListener('click', () => {
    alert('Démarrage de l\'apprentissage en chinois !');
    // Vous pouvez ajouter ici la logique pour charger des questions ou démarrer une activité
  });