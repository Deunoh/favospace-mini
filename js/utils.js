// Fonctions utilitaires partagées entre newtab.js et content.js
// Fichier creer car beaucoup de code répété entre les deux fichiers (gestion des favicons principalement)

/**
 * Récupère l'URL du favicon pour un site donné, via l'API favicon native de Chrome
 * (chrome-extension://<id>/_favicon/?pageUrl=...). Local et instantané : contrairement à un
 * service tiers, aucune requête réseau externe n'est faite et aucun domaine visité n'est
 * partagé avec un service externe.
 * @param {string} url - L'URL du site
 * @param {number} size - Taille souhaitée en pixels (16, 24, 32, 48, 64, 96, 128 ou 256)
 * @returns {string} - L'URL du favicon
 */
function getFaviconUrl(url, size = 32) {
    try {
        // Valide que l'URL du site est bien formée avant de la transmettre à l'API favicon
        new URL(url);
        const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
        faviconUrl.searchParams.set('pageUrl', url);
        faviconUrl.searchParams.set('size', size.toString());
        return faviconUrl.toString();
    } catch (error) {
        // Si l'URL n'est pas valide, retourner un favicon par défaut
        return getDefaultFavicon();
    }
}

/**
 * Gère les erreurs de chargement de favicon avec fallback
 * @param {HTMLImageElement} img - L'élément image du favicon
 * @param {string} originalUrl - L'URL originale du site (non utilisée, conservée pour compat d'appel)
 * @param {HTMLElement} loader - Le loader optionnel à cacher (pour newtab.js)
 */
function handleFaviconError(img, originalUrl, loader = null) {
    img.src = getDefaultFavicon();
    if (loader) {
        hideFaviconLoader(img, loader);
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
