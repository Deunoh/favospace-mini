// Fonctions utilitaires partagées entre newtab.js et content.js
// Fichier creer car beaucoup de code répété entre les deux fichiers (gestion des favicons principalement)

/**
 * Récupère l'URL du favicon pour un site donné
 * @param {string} url - L'URL du site
 * @returns {string} - L'URL du favicon
 */
function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        // Ancienne API Google
        // return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        
        // Nouvelle API Vemetric
        return `https://favicon.vemetric.com/${domain}?size=128`;
    } catch (error) {
        // Si l'URL n'est pas valide, retourner un favicon par défaut
        return getDefaultFavicon();
    }
}

/**
 * Gère les erreurs de chargement de favicon avec fallback
 * @param {HTMLImageElement} img - L'élément image du favicon
 * @param {string} originalUrl - L'URL originale du site
 * @param {HTMLElement} loader - Le loader optionnel à cacher (pour newtab.js)
 */
function handleFaviconError(img, originalUrl, loader = null) {
    // if (img.src.includes('google.com/s2/favicons')) {
    if (img.src.includes('favicon.vemetric.com')) {
        try {
            const urlObj = new URL(originalUrl);
            img.src = `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
        } catch (error) {
            img.src = getDefaultFavicon();
            if (loader) {
                hideFaviconLoader(img, loader);
            }
        }
    } else {
        img.src = getDefaultFavicon();
        if (loader) {
            hideFaviconLoader(img, loader);
        }
    }
}

/**
 * Cache le loader et ajoute les classes de chargement terminé
 * @param {HTMLImageElement} img - L'élément image du favicon
 * @param {HTMLElement} loader - Le loader à cacher
 */
function hideFaviconLoader(img, loader) {
    if (loader) {
        loader.style.display = 'none';
    }
    img.classList.remove('loading');
    img.classList.add('loaded');
}

/**
 * Retourne l'URL du favicon par défaut (logo Favospace)
 * @returns {string} - L'URL du favicon par défaut
 */
function getDefaultFavicon() {
    // Utiliser le logo Favospace comme fallback (si API down ou URL invalide)
    return chrome.runtime.getURL('logo-fs128.png');
}

/**
 * Vérifie si une URL est sûre à ouvrir
 * @param {string} url - L'URL à vérifier
 * @returns {boolean} - true si l'URL est sûre, false sinon
 */
function isUrlSafe(url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase().trim();
    // Bloquer les URLs dangereuses
    return !lowerUrl.startsWith('javascript:') && 
           !lowerUrl.startsWith('data:') && 
           !lowerUrl.startsWith('file:') &&
           !lowerUrl.startsWith('vbscript:');
}

/**
 * Échappe les caractères HTML spéciaux
 * @param {string} text - Le texte à échapper
 * @returns {string} - Le texte échappé
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}
