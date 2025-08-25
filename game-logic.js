// Variable pour garder en mémoire l'état du jeu et éviter de recalculer inutilement.
let gameState = {
    isGameOver: false,
    winners: []
  };
  
  // Fonction principale pour vérifier l'état du jeu.
  // Elle prend en paramètre la liste de tous les utilisateurs.
  function checkGameState(users) {
    // Si le jeu est déjà marqué comme terminé, on ne fait rien de plus.
    if (gameState.isGameOver) {
      return gameState;
    }
  
    // 1. Déterminer qui participe au jeu "Squid Game".
    //    Pour l'instant, on considère que tous les utilisateurs inscrits y participent.
    const participants = users.filter(user => user.username !== 'devtest'); // On exclut le compte de test.
    
    // 2. Filtrer pour trouver qui sont les survivants.
    const survivors = participants.filter(user => !user.isEliminated);
  
    // 3. Vérifier si la condition de fin de jeu est remplie.
    //    Le jeu se termine s'il reste 3 survivants ou moins, ET s'il y a eu au moins un participant.
    if (participants.length > 0 && survivors.length <= 3) {
      console.log('[GAME LOGIC] Condition de fin de jeu atteinte !');
      
      // 4. Calculer le classement final des survivants.
      //    On trie les survivants en fonction de leur score final sur la dernière session jouée.
      const finalRanking = survivors.sort((a, b) => {
        const scoreA = a.scores.filter(s => s.session === `session10`).reduce((sum, s) => sum + s.score, 0);
        const scoreB = b.scores.filter(s => s.session === `session10`).reduce((sum, s) => sum + s.score, 0);
        return scoreB - scoreA; // Tri décroissant
      });
  
      // 5. Calculer la cagnotte totale.
      const totalPrizePool = participants.length * 200;
      console.log(`[GAME LOGIC] Cagnotte totale : ${totalPrizePool} points, basée sur ${participants.length} participants.`);
  
      // 6. Attribuer les gains selon les règles.
      const winners = finalRanking.map((winner, index) => {
        let prize = 0;
        if (index === 0) { // 1er
          prize = totalPrizePool * 0.50;
        } else if (index === 1) { // 2ème
          prize = totalPrizePool * 0.20;
        } else if (index === 2) { // 3ème
          prize = totalPrizePool * 0.10;
        }
        console.log(`[GAME LOGIC] Vainqueur #${index + 1}: ${winner.username} gagne ${prize} points.`);
        
        // On pourrait ici ajouter les points au compte du joueur si on le souhaitait.
        // Par exemple : winner.squidGameCapital += prize;
        
        return {
          rank: index + 1,
          username: winner.username,
          prize: prize
        };
      });
  
      // Mettre à jour l'état du jeu pour le marquer comme terminé.
      gameState.isGameOver = true;
      gameState.winners = winners;
  
      // On pourrait sauvegarder l'état du jeu dans un fichier si on voulait le rendre persistant
      // fs.writeFileSync('gamestate.json', JSON.stringify(gameState, null, 2));
    }
  
    return gameState;
  }
  
  // Exporte la fonction pour qu'elle puisse être utilisée dans server.js
  module.exports = { checkGameState };