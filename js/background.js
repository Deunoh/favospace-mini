// Background script pour gérer les raccourcis clavier
// Le content script n'est plus injecté en permanence sur tous les sites (<all_urls>) :
// il est injecté à la demande, uniquement sur l'onglet actif, quand le raccourci est déclenché.
// Cela s'appuie sur "activeTab" (qui accorde un accès temporaire à l'onglet actif suite au
// raccourci clavier, sans permission d'hôte large) + "scripting".
const UNINJECTABLE_PROTOCOLS = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'chrome-search://',
    'devtools://',
    'view-source:',
    'chrome-error://',
    'brave://',
    'opera://',
    'vivaldi://'
];

function isInjectableUrl(url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return !UNINJECTABLE_PROTOCOLS.some(protocol => lowerUrl.startsWith(protocol));
}

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'open-bookmark-search') return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !isInjectableUrl(tab.url)) {
        return;
    }

    try {
        // Le content script est peut-être déjà injecté (raccourci pressé une 2e fois) : on tente
        // d'abord un simple toggle, et on n'injecte que si personne n'écoute côté page.
        await chrome.tabs.sendMessage(tab.id, { action: 'toggle-bookmark-search' });
    } catch (error) {
        try {
            await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['css/popup-styles.css']
            });
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['js/utils.js', 'js/content.js']
            });
            await chrome.tabs.sendMessage(tab.id, { action: 'toggle-bookmark-search' });
        } catch (injectError) {
            console.log('Impossible d\'injecter la recherche sur cette page:', injectError.message);
        }
    }
});

// Écoute les messages du content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'get-bookmarks') {
        // Récupérer les favoris et les envoyer au content script
        chrome.bookmarks.getTree((bookmarks) => {
            sendResponse({ bookmarks: bookmarks });
        });
        return true; // Indique que la réponse sera asynchrone
    }

    if (request.action === 'open-bookmark') {
        // Ouvrir un favori dans un nouvel onglet
        chrome.tabs.create({
            url: request.url,
            active: request.active ?? true
        });
    }
});
