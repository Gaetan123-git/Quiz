/**
 * Système d'internationalisation (i18n) pour French Quest
 * Gère le changement de langue et la traduction des textes
 */

class I18n {
    constructor() {
        this.currentLanguage = localStorage.getItem('language') || 'fr';
        this.translations = {};
        this.observers = [];
    }

    /**
     * Charge les traductions pour une langue donnée
     */
    async loadTranslations(language) {
        try {
            const response = await fetch(`/i18n/${language}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load translations for ${language}`);
            }
            this.translations[language] = await response.json();
        } catch (error) {
            console.error('Error loading translations:', error);
            // Fallback vers le français si erreur
            if (language !== 'fr') {
                await this.loadTranslations('fr');
            }
        }
    }

    /**
     * Change la langue actuelle
     */
    async setLanguage(language) {
        if (language !== this.currentLanguage) {
            this.currentLanguage = language;
            localStorage.setItem('language', language);
            
            // Charger les traductions si pas encore fait
            if (!this.translations[language]) {
                await this.loadTranslations(language);
            }
            
            // Mettre à jour l'attribut lang du document
            document.documentElement.lang = language;
            
            // Notifier tous les observateurs
            this.notifyObservers();
        }
    }

    /**
     * Obtient la langue actuelle
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Traduit une clé donnée
     */
    t(key, params = {}) {
        const keys = key.split('.');
        let translation = this.translations[this.currentLanguage];
        
        // Naviguer dans l'objet de traduction
        for (const k of keys) {
            if (translation && typeof translation === 'object') {
                translation = translation[k];
            } else {
                translation = undefined;
                break;
            }
        }
        
        // Si pas de traduction trouvée, essayer en français (fallback)
        if (translation === undefined && this.currentLanguage !== 'fr') {
            let fallback = this.translations['fr'];
            for (const k of keys) {
                if (fallback && typeof fallback === 'object') {
                    fallback = fallback[k];
                } else {
                    fallback = undefined;
                    break;
                }
            }
            translation = fallback;
        }
        
        // Si toujours pas de traduction, retourner la clé
        if (translation === undefined) {
            console.warn(`Translation not found for key: ${key}`);
            return key;
        }
        
        // Si c'est un tableau, retourner un élément aléatoire
        if (Array.isArray(translation)) {
            return translation[Math.floor(Math.random() * translation.length)];
        }
        
        // Remplacer les paramètres dans la traduction
        if (typeof translation === 'string' && Object.keys(params).length > 0) {
            return translation.replace(/\{\{(\w+)\}\}/g, (match, param) => {
                return params[param] !== undefined ? params[param] : match;
            });
        }
        
        return translation;
    }

    /**
     * Ajoute un observateur pour les changements de langue
     */
    addObserver(callback) {
        this.observers.push(callback);
    }

    /**
     * Supprime un observateur
     */
    removeObserver(callback) {
        const index = this.observers.indexOf(callback);
        if (index > -1) {
            this.observers.splice(index, 1);
        }
    }

    /**
     * Notifie tous les observateurs
     */
    notifyObservers() {
        this.observers.forEach(callback => {
            try {
                callback(this.currentLanguage);
            } catch (error) {
                console.error('Error in i18n observer:', error);
            }
        });
    }

    /**
     * Met à jour automatiquement tous les éléments avec l'attribut data-i18n
     */
    updateDOM() {
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            this.translateElement(element);
        });
    }

    /**
     * Traduit un seul élément HTML en se basant sur son attribut data-i18n.
     * @param {HTMLElement} element - L'élément du DOM à traduire.
     */
    translateElement(element) {
        const key = element.getAttribute('data-i18n');
        const skip = element.getAttribute('data-i18n-skip') === 'true';

        // Si l'attribut "skip" est présent, on ne touche pas à l'élément.
        // C'est utile pour les noms d'utilisateurs ou autres données dynamiques.
        if (skip) {
            return;
        }

        if (key) {
            // On récupère la traduction correspondante à la clé.
            const translation = this.t(key);

            if (translation) {
                // Déterminer si c'est pour un attribut ou le contenu
                const attr = element.getAttribute('data-i18n-attr');
                if (attr) {
                    element.setAttribute(attr, translation);
                } else {
                    // ==========================================================
                    // ==                 LA CORRECTION EST ICI                ==
                    // ==========================================================
                    // On utilise .innerHTML au lieu de .textContent.
                    // .innerHTML permet au navigateur d'interpréter les balises HTML (comme <strong>)
                    // qui se trouvent dans nos fichiers de traduction (fr.json, en.json).
                    // C'est la solution pour que le texte s'affiche bien en gras.
                    element.innerHTML = translation;
                }
            } else {
                // Si aucune traduction n'est trouvée, on affiche un avertissement dans la console.
                console.warn(`[i18n] Clé de traduction introuvable: ${key}`);
            }
        }
    }

    /**
     * Initialise le système i18n
     */
    async init() {
        // Charger les traductions pour la langue actuelle
        await this.loadTranslations(this.currentLanguage);
        
        // Charger aussi le français comme fallback si ce n'est pas la langue actuelle
        if (this.currentLanguage !== 'fr') {
            await this.loadTranslations('fr');
        }
        
        // Mettre à jour l'attribut lang du document
        document.documentElement.lang = this.currentLanguage;
        
        // Ajouter un observateur pour mettre à jour le DOM automatiquement
        this.addObserver(() => {
            this.updateDOM();
        });
        
        // Mise à jour initiale du DOM
        this.updateDOM();
    }
}

// Instance globale
const i18n = new I18n();

// Export pour utilisation dans d'autres scripts
window.i18n = i18n;

export default i18n;
