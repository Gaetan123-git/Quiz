/**
 * Ce fichier contient la fonction partagée pour afficher les notifications de type 'toast'.
 * Elle est utilisée par les pages de connexion, d'inscription et par l'application principale.
 */
function showToast(title, message, type = 'info', duration = 5000) {
    // S'assure que le conteneur pour les toasts existe bien dans la page.
    let container = document.getElementById('toast-container');
    if (!container) {
        console.error("Le conteneur de notifications (#toast-container) n'a pas été trouvé dans le HTML.");
        return;
    }

    // Création de l'élément visuel de la notification.
    const toastElement = document.createElement('div');
    // On lui applique les classes CSS qui correspondent au style unifié de l'application.
    toastElement.className = `toast ${type}`;

    // On choisit une icône en fonction du type de notification.
    const icons = {
        info: 'ℹ️',
        success: '✅',
        error: '❌'
    };
    const icon = icons[type] || '🔔';

    // On construit le HTML interne de la notification.
    toastElement.innerHTML = `
        <div class="toast__icon">${icon}</div>
        <div class="toast__content">
            <p class="toast__title">${title}</p>
            <p class="toast__message">${message}</p>
        </div>
    `;

    // On ajoute la notification au conteneur.
    container.appendChild(toastElement);

    // On programme sa disparition automatique après la durée spécifiée.
    setTimeout(() => {
        toastElement.classList.add('toast--exit');
        // On attend la fin de l'animation de sortie pour supprimer proprement l'élément du DOM.
        toastElement.addEventListener('animationend', () => {
            toastElement.remove();
        });
    }, duration);
}
