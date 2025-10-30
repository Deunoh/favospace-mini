// Background script pour gérer les raccourcis clavier
chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-bookmark-search') {
        // get onglet actif
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {action: 'toggle-bookmark-search'}, (response) => {
                    if (chrome.runtime.lastError) {
                        // Content script non disponible (pages chrome://, extensions, etc.)
                        console.log('Content script non disponible sur cette page:', chrome.runtime.lastError.message);
                    }
                });
            }
        });
    }
});

// Écoute les messages du content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'get-bookmarks') {
        // Récupérer les favoris et les envoyer au content script
        chrome.bookmarks.getTree((bookmarks) => {
            sendResponse({bookmarks: bookmarks});
        });
        return true; // Indique que la réponse sera asynchrone
    }
    
    if (request.action === 'open-bookmark') {
        // Ouvrir un favori dans un nouvel onglet
        chrome.tabs.create({
            url: request.url,
            active: request.active || true
        });
    }
});
