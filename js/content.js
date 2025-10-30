// Content script pour injecter la popup de recherche de favoris
class FavospacePopup {
    constructor() {
        this.isOpen = false;
        this.bookmarks = [];
        this.popupElement = null;
        this.searchInput = null;
        this.bookmarksList = null;
        this.allBookmarks = [];
        this.searchDebounceTimer = null;
        
        // Écouter les messages du background script
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'toggle-bookmark-search') {
                this.toggle();
            }
        });
        
        // Écouter la touche Escape pour fermer la popup
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }
    
    async toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            await this.open();
        }
    }
    
    async open() {
        if (this.isOpen) return;
        
        this.isOpen = true;
        await this.loadBookmarks();
        this.createPopup();
        this.renderBookmarks();
        
        // Focus sur le champ de recherche
        setTimeout(() => {
            if (this.searchInput) {
                this.searchInput.focus();
            }
        }, 100);
    }
    
    close() {
        if (!this.isOpen) return;
        
        this.isOpen = false;
        if (this.popupElement) {
            this.popupElement.remove();
            this.popupElement = null;
        }
    }
    
    async loadBookmarks() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({action: 'get-bookmarks'}, (response) => {
                if (response && response.bookmarks) {
                    this.allBookmarks = this.flattenBookmarks(response.bookmarks);
                }
                resolve();
            });
        });
    }
    
    flattenBookmarks(nodes, result = []) {
        for (const node of nodes) {
            if (node.url) {
                // C'est un favori
                result.push(node);
            } else if (node.children) {
                // C'est un dossier, explorer ses enfants
                this.flattenBookmarks(node.children, result);
            }
        }
        return result;
    }
    
    createPopup() {
        this.popupElement = document.createElement('div');
        this.popupElement.className = 'favospace-popup-overlay';
        this.popupElement.innerHTML = `
            <div class="favospace-popup">
                <div class="favospace-popup-header">
                    <button class="favospace-close-btn" title="Fermer (Échap)">×</button>
                    <h2 class="favospace-popup-title">Favospace bookmarks</h2>
                    <div class="favospace-search-container">
                        <input 
                            type="text" 
                            class="favospace-search-input" 
                            placeholder="Rechercher dans vos favoris..."
                            autocomplete="off"
                        >
                        <button class="favospace-clear-btn" title="Effacer">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="favospace-popup-content">
                    <div class="favospace-bookmarks-list"></div>
                </div>
                <div class="favospace-footer">
                    Échap ou clic extérieur pour fermer
                </div>
            </div>
        `;
        
        // Ajouter au DOM
        document.body.appendChild(this.popupElement);
        
        // Récupérer les références
        this.searchInput = this.popupElement.querySelector('.favospace-search-input');
        this.bookmarksList = this.popupElement.querySelector('.favospace-bookmarks-list');
        const closeBtn = this.popupElement.querySelector('.favospace-close-btn');
        const clearBtn = this.popupElement.querySelector('.favospace-clear-btn');
        
        // Event listeners
        this.popupElement.addEventListener('click', (e) => {
            if (e.target === this.popupElement) {
                this.close();
            }
        });
        
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.close();
        });
        
        // Double sécurité pour la croix de fermeture
        closeBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        closeBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.close();
        });
        
        this.searchInput.addEventListener('input', (e) => {
            const searchValue = e.target.value;
            this.updateClearButton(searchValue);
            
            // Debounce la recherche pour améliorer les performances
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                this.filterBookmarks(searchValue);
            }, 200);
        });
        
        clearBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.renderBookmarks();
            this.updateClearButton('');
            this.searchInput.focus();
        });
        
        // Gérer Enter pour ouvrir le premier résultat
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const firstBookmark = this.bookmarksList.querySelector('.favospace-bookmark-item');
                if (firstBookmark) {
                    firstBookmark.click();
                }
            }
        });
    }
    
    renderBookmarks(bookmarksToRender = null) {
        const bookmarks = bookmarksToRender || this.allBookmarks;
        
        if (!bookmarks || bookmarks.length === 0) {
            this.bookmarksList.innerHTML = `
                <div class="favospace-no-results">
                    <h3>Aucun favori trouvé</h3>
                    <p>Aucun résultat ne correspond à votre recherche.</p>
                </div>
            `;
            return;
        }
        
        this.bookmarksList.innerHTML = '';
        
        // Limiter à 50 résultats pour les performances, les agris..
        const limitedBookmarks = bookmarks.slice(0, 50);
        
        limitedBookmarks.forEach(bookmark => {
            const bookmarkElement = this.createBookmarkElement(bookmark);
            this.bookmarksList.appendChild(bookmarkElement);
        });
        
        if (bookmarks.length > 50) {
            const moreElement = document.createElement('div');
            moreElement.className = 'favospace-no-results';
            moreElement.innerHTML = `<p>Et ${bookmarks.length - 50} autres résultats...</p>`;
            this.bookmarksList.appendChild(moreElement);
        }
    }
    
    createBookmarkElement(bookmark) {
        const bookmarkDiv = document.createElement('div');
        bookmarkDiv.className = 'favospace-bookmark-item';
        
        const faviconUrl = this.getFaviconUrl(bookmark.url);
        
        bookmarkDiv.innerHTML = `
            <img class="favospace-bookmark-favicon" 
                 src="${faviconUrl}" 
                 alt="Favicon"
                 loading="lazy">
            <div class="favospace-bookmark-info">
                <div class="favospace-bookmark-title">${this.escapeHtml(bookmark.title || bookmark.url)}</div>
                <div class="favospace-bookmark-url">${this.escapeHtml(bookmark.url)}</div>
            </div>
        `;
        
        // Gestion des erreurs de favicon
        const favicon = bookmarkDiv.querySelector('.favospace-bookmark-favicon');
        favicon.addEventListener('error', () => {
            this.handleFaviconError(favicon, bookmark.url);
        });
        
        // Click pour ouvrir le lien
        bookmarkDiv.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Vérifier que l'URL est sûre
            if (!this.isUrlSafe(bookmark.url)) {
                console.warn('URL bloquée pour des raisons de sécurité:', bookmark.url);
                return;
            }
            
            // Déterminer si on ouvre en arrière-plan ou au premier plan
            const active = !e.ctrlKey && !e.metaKey; // Ctrl/Cmd + clic = arrière-plan
            
            chrome.runtime.sendMessage({
                action: 'open-bookmark',
                url: bookmark.url,
                active: active
            });
            
            // Fermer la popup si on ouvre au premier plan
            if (active) {
                this.close();
            }
        });
        
        // Support pour clic molette (ouvrir en arrière-plan)
        bookmarkDiv.addEventListener('auxclick', (e) => {
            if (e.button === 1) { // Clic molette
                e.preventDefault();
                
                // Vérifier que l'URL est sûre
                if (!this.isUrlSafe(bookmark.url)) {
                    console.warn('URL bloquée pour des raisons de sécurité:', bookmark.url);
                    return;
                }
                
                chrome.runtime.sendMessage({
                    action: 'open-bookmark',
                    url: bookmark.url,
                    active: false
                });
            }
        });
        
        return bookmarkDiv;
    }
    
    filterBookmarks(searchTerm) {
        if (!searchTerm.trim()) {
            this.renderBookmarks();
            return;
        }
        
        const filtered = this.allBookmarks.filter(bookmark => {
            return bookmark.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                   bookmark.url.toLowerCase().includes(searchTerm.toLowerCase());
        });
        
        this.renderBookmarks(filtered);
    }
    
    updateClearButton(searchValue) {
        const clearBtn = this.popupElement?.querySelector('.favospace-clear-btn');
        if (clearBtn) {
            clearBtn.style.display = searchValue.trim() ? 'flex' : 'none';
        }
    }
    
    getFaviconUrl(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch (error) {
            return this.getDefaultFavicon();
        }
    }
    
    handleFaviconError(img, originalUrl) {
        if (img.src.includes('google.com/s2/favicons')) {
            try {
                const urlObj = new URL(originalUrl);
                img.src = `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
            } catch (error) {
                img.src = this.getDefaultFavicon();
            }
        } else {
            img.src = this.getDefaultFavicon();
        }
    }
    
    getDefaultFavicon() {
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjOWNhM2FmIi8+Cjwvc3ZnPgo=';
    }
    
    // Vérifier si une URL est sûre
    isUrlSafe(url) {
        if (!url) return false;
        const lowerUrl = url.toLowerCase().trim();
        // Bloquer les URLs dangereuses
        return !lowerUrl.startsWith('javascript:') && 
               !lowerUrl.startsWith('data:') && 
               !lowerUrl.startsWith('file:') &&
               !lowerUrl.startsWith('vbscript:');
    }
    
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
}

// Initialiser la popup seulement si on n'est pas sur une page d'extension
if (!window.location.href.startsWith('chrome-extension://')) {
    new FavospacePopup();
}
