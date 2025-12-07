class BookmarkManager {
    constructor() {
        this.bookmarks = [];
        this.currentEditId = null;
        this.currentDeleteId = null;
        this.currentDeleteFolderId = null;
        this.currentDeleteFolderTitle = null;
        this.allFoldersExpanded = false;
        this.searchDebounceTimer = null;
        this.init();
    }

    async init() {
        await this.loadBookmarks();
        this.setupEventListeners();
        await this.setupDarkMode();
        this.renderBookmarks();
        this.setupTipsRotation();
    }

    async setupDarkMode() {
        // charger le theme depuis chrome.storage.sync
        const result = await chrome.storage.sync.get(['darkMode']);
        if (result.darkMode) {
            document.body.classList.add('dark-mode');
        }

        // Boutons desktop
        const darkModeToggle = document.getElementById('darkModeToggle');
        darkModeToggle.addEventListener('click', async () => {
            await this.toggleDarkMode();
        });

        const bookmarkManagerBtn = document.getElementById('bookmarkManagerBtn');
        bookmarkManagerBtn.addEventListener('click', () => {
            this.openBookmarkManager();
        });

        const saveTabsBtn = document.getElementById('saveTabsBtn');
        saveTabsBtn.addEventListener('click', () => {
            this.saveTabs();
        });

        const restoreTabsBtn = document.getElementById('restoreTabsBtn');
        restoreTabsBtn.addEventListener('click', () => {
            this.restoreTabs();
        });

        // Boutons mobile
        const darkModeToggleMobile = document.getElementById('darkModeToggleMobile');
        darkModeToggleMobile.addEventListener('click', async () => {
            await this.toggleDarkMode();
            this.closeMobileMenu();
        });

        const bookmarkManagerBtnMobile = document.getElementById('bookmarkManagerBtnMobile');
        bookmarkManagerBtnMobile.addEventListener('click', () => {
            this.openBookmarkManager();
            this.closeMobileMenu();
        });

        const saveTabsBtnMobile = document.getElementById('saveTabsBtnMobile');
        saveTabsBtnMobile.addEventListener('click', () => {
            this.saveTabs();
            this.closeMobileMenu();
        });

        const restoreTabsBtnMobile = document.getElementById('restoreTabsBtnMobile');
        restoreTabsBtnMobile.addEventListener('click', () => {
            this.restoreTabs();
            this.closeMobileMenu();
        });

        // Menu hamburger mobile
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const mobileMenu = document.getElementById('mobileMenu');
        
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileMenu.classList.toggle('show');
        });

        // Fermer le menu en cliquant ailleurs
        document.addEventListener('click', (e) => {
            if (!mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                this.closeMobileMenu();
            }
        });

        // Vérifier si des onglets sont sauvegardés au chargement
        this.checkSavedTabs();
    }

    closeMobileMenu() {
        const mobileMenu = document.getElementById('mobileMenu');
        mobileMenu.classList.remove('show');
    }

    setupTipsRotation() {
        const tipItems = document.querySelectorAll('.tip-item');
        let currentTipIndex = 0;

        // Ajouter l'event listener sur le lien du gestionnaire de favoris dans la deuxième astuce
        const bookmarkManagerLinkTip = document.querySelector('.bookmark-manager-link-tip');
        if (bookmarkManagerLinkTip) {
            bookmarkManagerLinkTip.addEventListener('click', () => {
                this.openBookmarkManager();
            });
        }

        // Fonction pour changer d'astuce
        const rotateTips = () => {
            // Retirer la classe active de l'astuce actuelle
            tipItems[currentTipIndex].classList.remove('active');
            
            // Passer à l'astuce suivante
            currentTipIndex = (currentTipIndex + 1) % tipItems.length;
            
            // Ajouter la classe active à la nouvelle astuce
            tipItems[currentTipIndex].classList.add('active');
        };

        // Changer d'astuce toutes les 5 secondes
        setInterval(rotateTips, 5000);
    }

    async toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        await chrome.storage.sync.set({ darkMode: isDarkMode });
    }

    openBookmarkManager() {
        chrome.tabs.create({ url: 'chrome://bookmarks/' });
    }

    async saveTabs() {
        try {
            // Récupérer l'onglet actuel
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Récupérer tous les onglets ouverts
            const tabs = await chrome.tabs.query({});
            
            // Filtrer pour ne garder que les onglets avec des URLs valides
            // On exclut les onglets chrome:// et l'onglet actuel (newtab)
            const tabsData = tabs
                .filter(tab => {
                    // Exclure l'onglet actuel si c'est le newtab
                    if (tab.id === currentTab.id) return false;
                    // Exclure les URLs système
                    if (!tab.url || tab.url.startsWith('chrome://')) return false;
                    // Garder le reste
                    return true;
                })
                .map(tab => ({
                    url: tab.url,
                    title: tab.title,
                    pinned: tab.pinned
                }));

            if (tabsData.length === 0) {
                this.showNotification('Aucun onglet à sauvegarder', 'warning');
                return;
            }

            // Sauvegarder dans le storage
            await chrome.storage.local.set({ 
                savedTabs: tabsData,
                savedAt: new Date().toISOString()
            });

            this.showNotification(`${tabsData.length} onglet(s) sauvegardé(s) !`, 'success');
            this.checkSavedTabs(); // Mettre à jour l'affichage du bouton restaurer
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des onglets:', error);
            this.showNotification('Erreur lors de la sauvegarde', 'error');
        }
    }

    async restoreTabs() {
        try {
            const result = await chrome.storage.local.get(['savedTabs']);
            
            if (!result.savedTabs || result.savedTabs.length === 0) {
                this.showNotification('Aucun onglet sauvegardé', 'warning');
                return;
            }

            // Ouvrir tous les onglets sauvegardés
            for (const tabData of result.savedTabs) {
                await chrome.tabs.create({
                    url: tabData.url,
                    pinned: tabData.pinned,
                    active: false
                });
            }

            this.showNotification(`${result.savedTabs.length} onglet(s) restauré(s) !`, 'success');
            
            // Supprimer la sauvegarde après restauration
            await chrome.storage.local.remove(['savedTabs', 'savedAt']);
            
            // Mettre à jour l'affichage des boutons
            this.checkSavedTabs();
        } catch (error) {
            console.error('Erreur lors de la restauration des onglets:', error);
            this.showNotification('Erreur lors de la restauration', 'error');
        }
    }

    async checkSavedTabs() {
        try {
            const result = await chrome.storage.local.get(['savedTabs']);
            const restoreBtn = document.getElementById('restoreTabsBtn');
            const saveBtn = document.getElementById('saveTabsBtn');
            const restoreBtnMobile = document.getElementById('restoreTabsBtnMobile');
            const saveBtnMobile = document.getElementById('saveTabsBtnMobile');
            
            if (result.savedTabs && result.savedTabs.length > 0) {
                // Desktop
                restoreBtn.style.display = 'flex';
                restoreBtn.title = `Restaurer ${result.savedTabs.length} onglet(s) sauvegardé(s)`;
                saveBtn.title = `Remplacer la sauvegarde (${result.savedTabs.length} onglet(s))`;
                
                // Mobile
                restoreBtnMobile.style.display = 'flex';
            } else {
                // Desktop
                restoreBtn.style.display = 'none';
                saveBtn.title = 'Sauvegarder les onglets ouverts';
                
                // Mobile
                restoreBtnMobile.style.display = 'none';
            }
        } catch (error) {
            console.error('Erreur lors de la vérification des onglets sauvegardés:', error);
        }
    }

    showNotification(message, type = 'info') {
        // Créer une notification visuelle
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animation d'apparition
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Retirer après 3 secondes
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    async loadBookmarks() {
        try {
            this.bookmarks = await chrome.bookmarks.getTree();
        } catch (error) {
            console.error('Erreur lors du chargement des favoris:', error);
        }
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        
        searchInput.addEventListener('input', (e) => {
            const searchValue = e.target.value;
            this.updateClearSearchButton(searchValue);
            
            // Debounce la recherche pour améliorer les performances
            clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = setTimeout(() => {
                // Si c'est la première fois qu'on tape et que les dossiers ne sont pas déjà ouverts
                if (searchValue.trim() && !this.allFoldersExpanded) {
                    this.toggleAllFolders();
                }
                
                this.filterBookmarks(searchValue);
            }, 200);
        });

        clearSearchBtn.addEventListener('click', () => {
            this.clearSearch();
        });

        const addBtn = document.getElementById('addBookmarkBtn');
        const toggleAllBtn = document.getElementById('toggleAllBtn');
        const modal = document.getElementById('bookmarkModal');
        const closeBtn = modal.querySelector('.close');
        const cancelBtn = document.getElementById('cancelBtn');
        const form = document.getElementById('bookmarkForm');

        addBtn.addEventListener('click', () => this.showAddModal());
        toggleAllBtn.addEventListener('click', () => this.toggleAllFolders());
        closeBtn.addEventListener('click', () => this.hideModal());
        cancelBtn.addEventListener('click', () => this.hideModal());
        
        // Fermer modal en cliquant n'importe où
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hideModal();
        });

        // Form favori
        form.addEventListener('submit', (e) => this.handleFormSubmit(e));

        // Bouton créer un nouveau dossier
        const createFolderBtn = document.getElementById('createFolderBtn');
        const cancelNewFolderBtn = document.getElementById('cancelNewFolderBtn');
        
        createFolderBtn.addEventListener('click', () => this.showCreateFolderForm());
        cancelNewFolderBtn.addEventListener('click', () => this.hideCreateFolderForm());

        // Modal de suppression
        const deleteModal = document.getElementById('deleteModal');
        const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

        cancelDeleteBtn.addEventListener('click', () => this.hideDeleteModal());
        confirmDeleteBtn.addEventListener('click', () => this.confirmDelete());
        
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) this.hideDeleteModal();
        });

        // Modal de suppression de dossier
        const deleteFolderModal = document.getElementById('deleteFolderModal');
        const cancelDeleteFolderBtn = document.getElementById('cancelDeleteFolderBtn');
        const confirmDeleteFolderBtn = document.getElementById('confirmDeleteFolderBtn');

        cancelDeleteFolderBtn.addEventListener('click', () => this.hideDeleteFolderModal());
        confirmDeleteFolderBtn.addEventListener('click', () => this.confirmDeleteFolder());
        
        deleteFolderModal.addEventListener('click', (e) => {
            if (e.target === deleteFolderModal) this.hideDeleteFolderModal();
        });
    }

    renderBookmarks(bookmarksToRender = null) {
        const container = document.getElementById('bookmarksContainer');
        const bookmarks = bookmarksToRender || this.bookmarks;

        if (!bookmarks || bookmarks.length === 0) {
            container.innerHTML = `
                <div class="no-bookmarks">
                    <h3>Aucun favori trouvé</h3>
                    <p>Vous pouvez importer vos favoris depuis le <span class="bookmark-manager-link" id="bookmarkManagerLink">gestionnaire de favoris</span> de votre navigateur.</p>
                </div>
            `;
            
            // Ajouter l'event listener sur le lien
            const bookmarkManagerLink = document.getElementById('bookmarkManagerLink');
            if (bookmarkManagerLink) {
                bookmarkManagerLink.addEventListener('click', () => {
                    this.openBookmarkManager();
                });
            }
            
            return;
        }

        container.innerHTML = '';
        this.renderBookmarkNodes(bookmarks, container);
    }

    renderBookmarkNodes(nodes, container, level = 0) {
        // Séparer les favoris (liens) et les dossiers (a corriger si ça ne va pas)
        const bookmarks = [];
        const folders = [];
        
        nodes.forEach(node => {
            if (node.url) {
                // C'est un favori
                bookmarks.push(node);
            } else if (node.children) {
                // C'est un dossier
                folders.push(node);
            }
        });

        // Afficher d'abord tous les favoris (liens)
        bookmarks.forEach(bookmark => {
            const bookmarkElement = this.createBookmarkElement(bookmark);
            container.appendChild(bookmarkElement);
        });

        // Ensuite afficher tous les dossiers
        folders.forEach(folder => {
            // Vérifie si c'est le dossier racine artificiel
            const isRoot = !folder.title && level === 0;

            if (!isRoot && folder.title) {
                // Crée un dossier repliable
                const folderElement = this.createFolderElement(folder, level === 0 ? false : true);
                container.appendChild(folderElement);

                if (folder.children.length > 0) {
                    const folderContent = folderElement.querySelector('.folder-content');
                    this.renderBookmarkNodes(folder.children, folderContent, level + 1);
                }
            } else {
                // Si root artificiel → afficher seulement ses enfants
                this.renderBookmarkNodes(folder.children, container, level);
            }
        });
    }

    createFolderElement(folder, collapsedByDefault = false) {
        const bookmarkCount = this.countBookmarks(folder);
        
        const folderDiv = document.createElement('div');
        folderDiv.className = 'folder' + (collapsedByDefault && !this.allFoldersExpanded ? ' collapsed' : '');
        folderDiv.innerHTML = `
            <div class="folder-header">
                <span class="folder-icon">📁</span>
                <span class="folder-title">${this.escapeHtml(folder.title)}</span>
                <span class="folder-count">${bookmarkCount}</span>
                <div class="folder-actions">
                    <button class="action-btn delete-folder-btn" title="Supprimer le dossier">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                    </button>
                    <span class="folder-toggle">▼</span>
                </div>
            </div>
            <div class="folder-content"></div>
        `;

        // Toggle dossier
        const header = folderDiv.querySelector('.folder-header');
        const folderActions = folderDiv.querySelector('.folder-actions');
        
        header.addEventListener('click', (e) => {
            // Ne pas toggle si on clique sur les actions
            if (!e.target.closest('.folder-actions')) {
                folderDiv.classList.toggle('collapsed');
            }
        });

        // Action de suppression du dossier
        const deleteFolderBtn = folderDiv.querySelector('.delete-folder-btn');
        deleteFolderBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeleteFolderModal(folder.id, folder.title);
        });

        return folderDiv;
    }

    createBookmarkElement(bookmark) {
        const bookmarkDiv = document.createElement('div');
        bookmarkDiv.className = 'bookmark-item';
        
        // Extraire le domaine pour le favicon
        const faviconUrl = this.getFaviconUrl(bookmark.url);
        
        bookmarkDiv.innerHTML = `
            <div class="favicon-container" style="position: relative; width: 32px; height: 32px;">
                <div class="favicon-loader"></div>
                <img class="bookmark-favicon loading" 
                     src="${faviconUrl}" 
                     alt="Favicon"
                     loading="lazy"
                     style="position: absolute; top: 0; left: 0; width: 32px; height: 32px;">
            </div>
            <div class="bookmark-info">
                <div class="bookmark-title">${this.escapeHtml(bookmark.title || bookmark.url)}</div>
                <div class="bookmark-url">${this.escapeHtml(bookmark.url)}</div>
            </div>
            <div class="bookmark-actions">
                <button class="action-btn edit-btn" title="Modifier">✏️</button>
                <button class="action-btn delete-btn" title="Supprimer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"></path>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
        `;

        // Gestion du chargement et des erreurs de favicon
        const favicon = bookmarkDiv.querySelector('.bookmark-favicon');
        const loader = bookmarkDiv.querySelector('.favicon-loader');
        
        favicon.addEventListener('load', () => {
            loader.style.display = 'none';
            favicon.classList.remove('loading');
            favicon.classList.add('loaded');
        });
        
        favicon.addEventListener('error', () => {
            this.handleFaviconError(favicon, bookmark.url, loader);
        });

        // Click pour ouvrir le lien
        bookmarkDiv.addEventListener('click', (e) => {
            if (!e.target.closest('.bookmark-actions')) {
                // Vérifier que l'URL est sûre avant d'ouvrir
                if (this.isUrlSafe(bookmark.url)) {
                    window.open(bookmark.url, '_blank');
                }
            }
        });

        // Clic molette pour ouvrir le lien dans un nouvel onglet en arrière-plan
        bookmarkDiv.addEventListener('auxclick', (e) => {
            if (e.button === 1 && !e.target.closest('.bookmark-actions')) { // Bouton molette
                e.preventDefault();
                
                // Vérifier que l'URL est sûre avant d'ouvrir
                if (this.isUrlSafe(bookmark.url)) {
                    chrome.tabs.create({
                        url: bookmark.url,
                        active: false // Ouvre en arrière-plan
                    });
                }
            }
        });

        // Support alternatif pour le clic molette avec mousedown
        bookmarkDiv.addEventListener('mousedown', (e) => {
            if (e.button === 1 && !e.target.closest('.bookmark-actions')) { // Bouton molette
                e.preventDefault();
            }
        });

        // Actions buttons
        const editBtn = bookmarkDiv.querySelector('.edit-btn');
        const deleteBtn = bookmarkDiv.querySelector('.delete-btn');

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showEditModal(bookmark);
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeleteModal(bookmark.id);
        });

        return bookmarkDiv;
    }

    getFaviconUrl(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            // Ancienne API Google
            // return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
            
            // Nouvelle API Vemetric
            return `https://favicon.vemetric.com/${domain}?size=128`;
        } catch (error) {
            // Si l'URL n'est pas valide, retourner un favicon par défaut
            return this.getDefaultFavicon();
        }
    }

    handleFaviconError(img, originalUrl, loader = null) {
        // if (img.src.includes('google.com/s2/favicons')) {
        if (img.src.includes('favicon.vemetric.com')) {
            try {
                const urlObj = new URL(originalUrl);
                img.src = `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`;
            } catch (error) {
                img.src = this.getDefaultFavicon();
                this.hideFaviconLoader(img, loader);
            }
        } else {
            img.src = this.getDefaultFavicon();
            this.hideFaviconLoader(img, loader);
        }
    }

    hideFaviconLoader(img, loader) {
        if (loader) {
            loader.style.display = 'none';
        }
        img.classList.remove('loading');
        img.classList.add('loaded');
    }

    getDefaultFavicon() {
        // Utiliser le logo Favospace comme fallback (si API down ou URL invalide)
        return chrome.runtime.getURL('logo-fs128.png');
    }

    countBookmarks(folder) {
        let count = 0;
        if (folder.children) {
            folder.children.forEach(child => {
                if (child.url) {
                    count++;
                } else if (child.children) {
                    count += this.countBookmarks(child);
                }
            });
        }
        return count;
    }

    async showAddModal() {
        this.currentEditId = null;
        document.getElementById('modalTitle').textContent = 'Ajouter un favori';
        document.getElementById('bookmarkTitle').value = '';
        document.getElementById('bookmarkUrl').value = '';
        
        await this.populateFolderSelect();
        
        const modal = document.getElementById('bookmarkModal');
        modal.classList.add('show');
    }

    async showEditModal(bookmark) {
        this.currentEditId = bookmark.id;
        document.getElementById('modalTitle').textContent = 'Modifier le favori';
        document.getElementById('bookmarkTitle').value = bookmark.title;
        document.getElementById('bookmarkUrl').value = bookmark.url;
        
        await this.populateFolderSelect(bookmark.parentId);
        
        const modal = document.getElementById('bookmarkModal');
        modal.classList.add('show');
    }

    async populateFolderSelect(selectedId = null) {
        const select = document.getElementById('bookmarkFolder');
        select.innerHTML = '';
        
        const folders = await this.getAllFolders();
        folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.title;
            if (folder.id === selectedId) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    async getAllFolders() {
        const tree = await chrome.bookmarks.getTree();
        const folders = [];
        
        const traverseTree = (nodes, path = '') => {
            nodes.forEach(node => {
                if (node.children) {
                    if (node.title) { // pour ne pas avoir le dossier racine sans titre sinon bug possible 
                        const fullPath = path ? `${path} > ${node.title}` : node.title;
                        folders.push({
                            id: node.id,
                            title: fullPath
                        });
                        traverseTree(node.children, fullPath);
                    } else {
                        traverseTree(node.children, path);
                    }
                }
            });
        };
        
        traverseTree(tree);
        return folders;
    }

    hideModal() {
        const modal = document.getElementById('bookmarkModal');
        modal.classList.remove('show');
        // Réinitialiser le formulaire de création de dossier
        this.hideCreateFolderForm();
    }

    showCreateFolderForm() {
        const newFolderGroup = document.getElementById('newFolderGroup');
        const createFolderBtn = document.getElementById('createFolderBtn');
        const folderSelect = document.getElementById('bookmarkFolder');
        
        newFolderGroup.style.display = 'block';
        createFolderBtn.style.display = 'none';
        folderSelect.disabled = true;
        
        // Focus sur le champ de nom du dossier
        document.getElementById('newFolderName').focus();
    }

    hideCreateFolderForm() {
        const newFolderGroup = document.getElementById('newFolderGroup');
        const createFolderBtn = document.getElementById('createFolderBtn');
        const folderSelect = document.getElementById('bookmarkFolder');
        const newFolderName = document.getElementById('newFolderName');
        
        newFolderGroup.style.display = 'none';
        createFolderBtn.style.display = 'flex';
        folderSelect.disabled = false;
        newFolderName.value = '';
    }

    showDeleteModal(bookmarkId) {
        this.currentDeleteId = bookmarkId;
        const modal = document.getElementById('deleteModal');
        modal.classList.add('show');
    }

    hideDeleteModal() {
        const modal = document.getElementById('deleteModal');
        modal.classList.remove('show');
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        const title = document.getElementById('bookmarkTitle').value.trim();
        const url = document.getElementById('bookmarkUrl').value.trim();
        const newFolderName = document.getElementById('newFolderName').value.trim();
        let parentId = document.getElementById('bookmarkFolder').value;

        if (!title || !url) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        try {
            // Si on crée un nouveau dossier
            if (newFolderName) {
                if (!newFolderName.trim()) {
                    alert('Veuillez entrer un nom pour le nouveau dossier');
                    return;
                }
                
                // Créer le nouveau dossier
                const newFolder = await chrome.bookmarks.create({
                    parentId: parentId,
                    title: newFolderName
                });
                
                // Utiliser le nouveau dossier comme parent
                parentId = newFolder.id;
            }

            if (this.currentEditId) {
                // D'abord on met à jour le titre et l'URL
                await chrome.bookmarks.update(this.currentEditId, { title, url });

                // Ensuite on déplace si le dossier a changé
                const currentNode = await chrome.bookmarks.get(this.currentEditId);
                if (currentNode[0].parentId !== parentId) {
                    await chrome.bookmarks.move(this.currentEditId, { parentId });
                }
            } else {
                // Création d'un nouveau favori
                await chrome.bookmarks.create({
                    parentId: parentId,
                    title: title,
                    url: url
                });
            }

            this.hideModal();
            await this.loadBookmarks();
            this.renderBookmarks();
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            alert('Erreur lors de la sauvegarde du favori');
        }
    }

    async confirmDelete() {
        if (!this.currentDeleteId) return;

        try {
            await chrome.bookmarks.remove(this.currentDeleteId);
            this.hideDeleteModal();
            await this.loadBookmarks();
            this.renderBookmarks();
        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            alert('Erreur lors de la suppression du favori');
        }
    }

    showDeleteFolderModal(folderId, folderTitle) {
        this.currentDeleteFolderId = folderId;
        this.currentDeleteFolderTitle = folderTitle;
        
        const modal = document.getElementById('deleteFolderModal');
        const folderNameSpan = document.getElementById('deleteFolderName');
        folderNameSpan.textContent = folderTitle;
        
        modal.classList.add('show');
    }

    hideDeleteFolderModal() {
        const modal = document.getElementById('deleteFolderModal');
        modal.classList.remove('show');
        this.currentDeleteFolderId = null;
        this.currentDeleteFolderTitle = null;
    }

    async confirmDeleteFolder() {
        if (!this.currentDeleteFolderId) return;

        try {
            await chrome.bookmarks.removeTree(this.currentDeleteFolderId);
            this.hideDeleteFolderModal();
            await this.loadBookmarks();
            this.renderBookmarks();
        } catch (error) {
            console.error('Erreur lors de la suppression du dossier:', error);
            alert('Erreur lors de la suppression du dossier');
        }
    }

    filterBookmarks(searchTerm) {
        if (!searchTerm.trim()) {
            this.renderBookmarks();
            return;
        }

        const filtered = this.searchInBookmarks(this.bookmarks, searchTerm.toLowerCase());
        this.renderBookmarks(filtered);
    }

    clearSearch() {
        const searchInput = document.getElementById('searchInput');
        searchInput.value = '';
        this.updateClearSearchButton('');
        this.renderBookmarks();
        searchInput.focus();
    }

    updateClearSearchButton(searchValue) {
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (searchValue.trim()) {
            clearSearchBtn.style.display = 'flex';
        } else {
            clearSearchBtn.style.display = 'none';
        }
    }

    searchInBookmarks(nodes, searchTerm) {
        const results = [];
        
        const searchInNode = (node) => {
            if (node.url) {
                if (node.title.toLowerCase().includes(searchTerm) || 
                    node.url.toLowerCase().includes(searchTerm)) {
                    return { ...node };
                }
            } else if (node.children) {
                const matchingChildren = [];
                node.children.forEach(child => {
                    const result = searchInNode(child);
                    if (result) {
                        if (Array.isArray(result)) {
                            matchingChildren.push(...result);
                        } else {
                            matchingChildren.push(result);
                        }
                    }
                });
                
                if (matchingChildren.length > 0) {
                    return {
                        ...node,
                        children: matchingChildren
                    };
                }
            }
            return null;
        };

        nodes.forEach(node => {
            const result = searchInNode(node);
            if (result) {
                results.push(result);
            }
        });

        return results;
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

    toggleAllFolders() {
        const folders = document.querySelectorAll('.folder');
        const toggleBtn = document.getElementById('toggleAllBtn');
        
        if (this.allFoldersExpanded) {
            // Fermer tous les dossiers
            folders.forEach(folder => folder.classList.add('collapsed'));
            this.allFoldersExpanded = false;
            toggleBtn.textContent = '📁 Tout ouvrir';
            toggleBtn.title = 'Ouvrir tous les dossiers';
        } else {
            // Ouvrir tous les dossiers
            folders.forEach(folder => folder.classList.remove('collapsed'));
            this.allFoldersExpanded = true;
            toggleBtn.textContent = '📂 Tout fermer';
            toggleBtn.title = 'Fermer tous les dossiers';
        }
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    new BookmarkManager();
});