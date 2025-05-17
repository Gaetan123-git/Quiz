const songs = [
    { name: "A1", unlocked: true },
    { name: "A2", unlocked: false },
    { name: "B1", unlocked: false },
    { name: "B2", unlocked: false }
  ];
  
  document.addEventListener('DOMContentLoaded', async () => {
    await loadTranslations();
    checkSessionAndShowMenu();
    window.addEventListener('popstate', updateView);
  });
  
  function updateView() {
    const path = window.location.pathname;
    const songSelection = document.getElementById('song-selection');
    if (songSelection) {
      songSelection.style.display = (path === '/menu') ? 'block' : 'none';
    }
  }
  
  async function checkSessionAndShowMenu() {
    const response = await fetch('/check-session');
    const result = await response.json();
    if (result.loggedIn) {
      showSongSelection();
    } else {
      navigateTo('/login');
      showNotification('Veuillez vous connecter.', 'error');
    }
  }
  
  function showSongSelection() {
    const songSelection = document.getElementById('song-selection');
    if (songSelection) {
      songSelection.style.display = 'block';
      const songList = document.getElementById('song-list');
      if (songList) {
        songList.innerHTML = songs.map(song => `
          <div class="song-item ${song.unlocked ? 'unlocked' : 'locked'}">
            <div class="song-icon">${song.unlocked ? '🎵' : '🔒'}</div>
            <div class="song-title">${song.name}</div>
            ${song.unlocked ? `<button onclick="startGame('${song.name}')">Jouer</button>` : '<span>Verrouillé</span>'}
          </div>
        `).join('');
      }
    }
  }
  
  function startGame(songName) {
    if (songName === "A1") {
      navigateTo('/quiz');
    }
  }
  
  async function logout() {
    try {
      const response = await fetch('/logout', { method: 'POST' });
      const result = await response.json();
      if (result.error) {
        showNotification(result.error, 'error');
      } else {
        showNotification('Déconnexion réussie', 'success');
        setTimeout(() => {
          navigateTo('/login');
        }, 2000);
      }
    } catch (error) {
      console.error('Erreur lors de la déconnexion :', error);
      showNotification('Erreur lors de la déconnexion.', 'error');
    }
  }