/**
 * NetworkMonitor - Gestion améliorée de l'état du réseau pour French Quest
 * Détecte les interruptions, gère les reconnexions et les requêtes en attente.
 */

class NetworkMonitor {
    constructor() {
        this.isOnline = navigator.onLine;
        this.pingInterval = null;
        this.offlineCheckInterval = null;
        this.pendingRequests = new Map();
        this.eventListeners = new Map();
        
        this.config = {
            pingUrl: '/api/ping',
            pingInterval: 90000,
            checkIntervalWhenOffline: 10000,
        };

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.startPingMonitoring();
        this.createNetworkStatusUI();
        this.checkConnection();
        console.log('NetworkMonitor (version robuste) initialisé');
    }

    setupEventListeners() {
        window.addEventListener('online', () => this.checkConnection());
        window.addEventListener('offline', () => this.handleOffline());
        
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.checkConnection();
        });

        window.addEventListener('unhandledrejection', (event) => {
            if (event.reason && (event.reason.message.includes('Failed to fetch') || event.reason.name === 'AbortError')) {
                if (this.isOnline) {
                    this.checkConnection();
                }
            }
        });
    }

    createNetworkStatusUI() {
        const statusIndicator = document.createElement('div');
        statusIndicator.id = 'network-status-indicator';
        statusIndicator.className = `network-status-indicator ${this.isOnline ? 'online' : 'offline'}`;
        statusIndicator.innerHTML = `
            <div class="network-status-dot"></div>
            <span class="network-status-text">${this.isOnline ? 'En ligne' : 'Hors ligne'}</span>
        `;
        
        const header = document.querySelector('#main-header .player-stats');
        if (header) header.appendChild(statusIndicator);

        const banner = document.createElement('div');
        banner.id = 'network-banner';
        banner.className = 'network-banner hidden';
        banner.innerHTML = `
            <div class="network-banner-content">
                <div class="network-banner-icon">⚠️</div>
                <div class="network-banner-message">
                    <strong class="network-banner-title">Connexion perdue</strong>
                    <span class="network-banner-subtitle">Tentative de reconnexion...</span>
                </div>
            </div>
        `;
        document.body.appendChild(banner);
    }

    startPingMonitoring() {
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            if (this.isOnline) this.checkConnection();
        }, this.config.pingInterval);
    }

    async checkConnection() {
        try {
            if (!navigator.onLine) {
                 if (this.isOnline) this.handleOffline();
                 return;
            }
            const response = await fetch(this.config.pingUrl, { cache: 'no-cache' });
            if (response.ok && !this.isOnline) {
                this.handleOnline();
            }
        } catch (error) {
            if (this.isOnline) {
                this.handleOffline();
            }
        }
    }

    handleOnline() {
        if (this.isOnline) return;
        console.log('Connexion rétablie');
        this.isOnline = true;
        
        if (this.offlineCheckInterval) {
            clearInterval(this.offlineCheckInterval);
            this.offlineCheckInterval = null;
        }

        this.updateStatusIndicator(true);
        this.hideBanner();
        this.emit('online');
        this.retryPendingRequests();
    }

    handleOffline() {
        if (!this.isOnline) return;
        if (typeof window.isPrimaryTab !== 'undefined' && !window.isPrimaryTab) return;

        console.log('Connexion perdue');
        this.isOnline = false;
        
        if (!this.offlineCheckInterval) {
            this.offlineCheckInterval = setInterval(() => this.checkConnection(), this.config.checkIntervalWhenOffline);
        }

        this.updateStatusIndicator(false);
        this.showBanner();
        this.emit('offline');
    }

    updateStatusIndicator(online) {
        const indicator = document.getElementById('network-status-indicator');
        if (!indicator) return;
        indicator.className = `network-status-indicator ${online ? 'online' : 'offline'}`;
        const text = indicator.querySelector('.network-status-text');
        if (text && window.i18n) {
             text.textContent = window.i18n.t(online ? 'network.online' : 'network.offline');
        }
    }

    showBanner() {
        const banner = document.getElementById('network-banner');
        if (banner) banner.classList.remove('hidden');
    }

    hideBanner() {
        const banner = document.getElementById('network-banner');
        if (banner) banner.classList.add('hidden');
    }

    storeFailedRequest(resource, options) {
        if (resource.includes('/ping') || resource.includes('-stream')) {
            return;
        }
        const timestamp = Date.now();
        console.log(`[NetworkMonitor] Mise en attente de la requête vers ${resource}`);
        this.pendingRequests.set(timestamp, { resource, options });
    }
    
    async retryPendingRequests() {
        if (this.pendingRequests.size === 0) return;

        console.log(`[NetworkMonitor] Tentative de renvoi de ${this.pendingRequests.size} requête(s) en attente.`);
        this.emit('retrying-requests', this.pendingRequests.size);

        const requestsToRetry = new Map(this.pendingRequests);
        this.pendingRequests.clear();

        for (const [timestamp, request] of requestsToRetry) {
            try {
                await (window.originalFetch || fetch)(request.resource, request.options);
                console.log(`[NetworkMonitor] Requête de ${new Date(timestamp).toLocaleTimeString()} renvoyée avec succès.`);
            } catch (error) {
                console.warn(`[NetworkMonitor] Échec du renvoi de la requête de ${new Date(timestamp).toLocaleTimeString()}. Elle est abandonnée.`, error);
            }
        }
    }

    on(event, callback) {
        if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
        this.eventListeners.get(event).push(callback);
    }
    emit(event, data = null) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(cb => cb(data));
        }
    }
}

export default NetworkMonitor;
