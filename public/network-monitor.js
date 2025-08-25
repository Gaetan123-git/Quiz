/**
 * NetworkMonitor - Gestion de l'état du réseau pour French Quest
 * Détecte les interruptions de connexion et informe l'utilisateur
 */

class NetworkMonitor {
    constructor() {
        this.isOnline = navigator.onLine;
        this.lastOnlineTime = Date.now();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Délai initial en ms
        this.maxReconnectDelay = 30000; // Délai maximum
        this.pingInterval = null;
        this.reconnectTimeout = null;
        this.pendingRequests = new Map();
        this.eventListeners = new Map();
        // Détection simple des appareils mobiles (UA)
        this.isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test((navigator && navigator.userAgent) || '');
        
        // Configuration
        this.config = {
            pingUrl: '/api/ping',
            pingInterval: 30000, // 30 secondes
            notificationDuration: 5000,
            enableOfflineStorage: true
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startPingMonitoring();
        this.createNetworkStatusUI();
        // Vérification immédiate pour refléter l'état réel au chargement
        this.checkConnection();
        console.log('NetworkMonitor initialisé');
    }

    setupEventListeners() {
        // Événements natifs du navigateur avec vérification supplémentaire
        window.addEventListener('online', () => {
            console.log('[NetworkMonitor] Événement online détecté');
            // Vérifier réellement la connexion au lieu de faire confiance à l'événement
            setTimeout(() => this.checkConnection(), 500);
        });
        
        window.addEventListener('offline', () => {
            console.log('[NetworkMonitor] Événement offline détecté');
            this.handleOffline();
        });
        
        // Événements de visibilité de la page
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('[NetworkMonitor] Page redevenue visible, vérification connexion');
                this.checkConnection();
            }
        });

        // Vérification périodique même quand on pense être en ligne
        setInterval(() => {
            this.checkConnection(); // Vérifier dans tous les cas
        }, 5000); // Vérifier toutes les 5 secondes

        // Intercepter les requêtes fetch pour détecter les erreurs réseau
        this.interceptFetch();
    }

    createNetworkStatusUI() {
        // Créer l'indicateur de statut réseau
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'network-status-indicator';
        statusIndicator.className = `network-status-indicator ${this.isOnline ? 'online' : 'offline'}`;
        statusIndicator.innerHTML = `
            <div class="network-status-dot"></div>
            <span class="network-status-text" data-i18n="${this.isOnline ? 'network.online' : 'network.offline'}">${this.isOnline ? 'En ligne' : 'Hors ligne'}</span>
        `;
        
        // Ajouter à l'en-tête (version précédente)
        const header = document.querySelector('#main-header .player-stats');
        if (header) {
            header.appendChild(statusIndicator);
        }

        // Créer la bannière de notification
        const banner = document.createElement('div');
        banner.id = 'network-banner';
        banner.className = 'network-banner hidden';
        banner.innerHTML = `
            <div class="network-banner-content">
                <div class="network-banner-icon">⚠️</div>
                <div class="network-banner-message">
                    <strong class="network-banner-title" data-i18n="network.connectionLost">Connexion perdue</strong>
                    <span class="network-banner-subtitle" data-i18n="network.tryingReconnect">Tentative de reconnexion...</span>
                </div>
                <button class="network-banner-retry" data-i18n="network.retry">Réessayer</button>
                <button class="network-banner-close">×</button>
            </div>
        `;
        
        document.body.appendChild(banner);

        // Événements de la bannière
        const retryButton = banner.querySelector('.network-banner-retry');
        const closeButton = banner.querySelector('.network-banner-close');
        
        if (retryButton) {
            retryButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[NetworkMonitor] Bouton Réessayer cliqué');
                this.forceReconnect();
            });
        }
        
        if (closeButton) {
            closeButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[NetworkMonitor] Bouton Fermer cliqué');
                this.hideBanner();
            });
        }
    }

    startPingMonitoring() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        this.pingInterval = setInterval(() => {
            if (this.isOnline) {
                this.pingServer();
            }
        }, this.config.pingInterval);
    }

    async pingServer() {
        try {
            // Si le navigateur signale hors-ligne (ex: mode avion), considérer hors-ligne sans ping
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                if (this.isOnline) {
                    this.handleOffline();
                }
                return;
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(this.config.pingUrl, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-cache'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Ping failed: ${response.status}`);
            }
            
            if (!this.isOnline) {
                this.handleOnline();
            }
            
        } catch (error) {
            console.warn('Ping server failed:', error.message);
            if (this.isOnline) {
                this.handleOffline();
            }
        }
    }

    async checkConnection() {
        try {
            console.log('[NetworkMonitor] Vérification de la connexion...');
            const online = await this.isConnectedToInternet();
            console.log(`[NetworkMonitor] Résultat test: ${online}, État actuel: ${this.isOnline}`);
            
            if (online && !this.isOnline) {
                console.log('[NetworkMonitor] Connexion détectée, passage en ligne');
                this.handleOnline();
            } else if (!online && this.isOnline) {
                console.log('[NetworkMonitor] Perte de connexion détectée');
                this.handleOffline();
            }
        } catch (error) {
            console.error('Erreur lors de la vérification de connexion:', error);
            if (this.isOnline) {
                this.handleOffline();
            }
        }
    }

    async isConnectedToInternet() {
        try {
            // Court-circuit: si le navigateur est hors-ligne (mode avion), retourner faux
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                return false;
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(this.config.pingUrl, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-cache'
            });
            
            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }

    handleOnline() {
        console.log('Connexion rétablie');
        this.isOnline = true;
        this.lastOnlineTime = Date.now();
        this.reconnectAttempts = 0;
        
        this.updateStatusIndicator(true);
        this.hideBanner();
        this.processPendingRequests();
        this.emit('online');
        
        // Notification de reconnexion
        const key = this.isMobile ? 'network.reconnectedMobile' : 'network.reconnected';
        this.showNotification(key, 'success');
    }

    handleOffline() {
        console.log('Connexion perdue');
        this.isOnline = false;
        
        this.updateStatusIndicator(false);
        this.showBanner();
        this.startReconnectAttempts();
        this.emit('offline');
        
        // Notification de déconnexion
        this.showNotification('network.disconnected', 'warning');
    }

    updateStatusIndicator(online) {
        const indicator = document.getElementById('network-status-indicator');
        if (indicator) {
            indicator.className = `network-status-indicator ${online ? 'online' : 'offline'}`;
            const text = indicator.querySelector('.network-status-text');
            if (text) {
                text.setAttribute('data-i18n', online ? 'network.online' : 'network.offline');
                // Mettre à jour le texte si i18n est disponible
                if (window.i18n) {
                    text.textContent = window.i18n.t(online ? 'network.online' : 'network.offline');
                }
            }
        }
    }

    showBanner() {
        const banner = document.getElementById('network-banner');
        if (banner) {
            banner.classList.remove('hidden');
            banner.classList.add('visible');
        }
    }

    hideBanner() {
        const banner = document.getElementById('network-banner');
        if (banner) {
            banner.classList.remove('visible');
            banner.classList.add('hidden');
        }
    }

    startReconnectAttempts() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        const attemptReconnect = () => {
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.log('Nombre maximum de tentatives de reconnexion atteint');
                this.updateBannerMessage('network.reconnectFailed');
                return;
            }

            this.reconnectAttempts++;
            console.log(`Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            this.updateBannerMessage('network.tryingReconnect');
            
            this.checkConnection().then(() => {
                if (!this.isOnline) {
                    const delay = Math.min(
                        this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
                        this.maxReconnectDelay
                    );
                    
                    this.reconnectTimeout = setTimeout(attemptReconnect, delay);
                }
            });
        };

        attemptReconnect();
    }

    forceReconnect() {
        console.log('[NetworkMonitor] Reconnexion forcée demandée');
        this.reconnectAttempts = 0;
        // Forcer une vérification immédiate
        this.checkConnection();
        // Et une autre dans 2 secondes pour être sûr
        setTimeout(() => this.checkConnection(), 2000);
    }

    updateBannerMessage(i18nKey) {
        const banner = document.getElementById('network-banner');
        if (banner) {
            const subtitle = banner.querySelector('.network-banner-subtitle');
            if (subtitle) {
                subtitle.setAttribute('data-i18n', i18nKey);
                if (window.i18n) {
                    subtitle.textContent = window.i18n.t(i18nKey);
                }
            }
        }
    }

    interceptFetch() {
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            try {
                const response = await originalFetch(...args);
                
                // Si la requête réussit mais qu'on était hors ligne, marquer comme en ligne
                if (!this.isOnline && response.ok) {
                    this.handleOnline();
                }
                
                return response;
            } catch (error) {
                // Si erreur réseau et qu'on était en ligne, marquer comme hors ligne
                if (this.isOnline && (error.name === 'TypeError' || error.message.includes('fetch'))) {
                    this.handleOffline();
                }
                
                // Stocker la requête pour retry si configuré
                if (this.config.enableOfflineStorage) {
                    this.storeFailedRequest(args);
                }
                
                throw error;
            }
        };
    }

    storeFailedRequest(requestArgs) {
        const requestId = Date.now() + Math.random();
        this.pendingRequests.set(requestId, {
            args: requestArgs,
            timestamp: Date.now()
        });
    }

    async processPendingRequests() {
        if (this.pendingRequests.size === 0) return;

        console.log(`Traitement de ${this.pendingRequests.size} requêtes en attente`);
        
        for (const [requestId, request] of this.pendingRequests) {
            try {
                await fetch(...request.args);
                this.pendingRequests.delete(requestId);
            } catch (error) {
                console.warn('Échec de retry pour requête:', error);
                // Supprimer les requêtes trop anciennes (> 5 minutes)
                if (Date.now() - request.timestamp > 300000) {
                    this.pendingRequests.delete(requestId);
                }
            }
        }
    }

    showNotification(i18nKey, type = 'info') {
        // Utiliser le système de notification existant de French Quest
        const notification = document.getElementById('notification');
        if (notification && window.i18n) {
            notification.textContent = window.i18n.t(i18nKey);
            notification.className = `notification ${type} show`;
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, this.config.notificationDuration);
        }
    }

    // Système d'événements
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event, data = null) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Erreur dans listener réseau:', error);
                }
            });
        }
    }

    // API publique
    getStatus() {
        return {
            isOnline: this.isOnline,
            lastOnlineTime: this.lastOnlineTime,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    destroy() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        window.removeEventListener('online', this.handleOnline);
        window.removeEventListener('offline', this.handleOffline);
        
        // Nettoyer l'UI
        const indicator = document.getElementById('network-status-indicator');
        const banner = document.getElementById('network-banner');
        if (indicator) indicator.remove();
        if (banner) banner.remove();
        
        console.log('NetworkMonitor détruit');
    }
}

export default NetworkMonitor;
