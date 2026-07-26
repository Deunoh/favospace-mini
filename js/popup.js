// Gestion des espaces de travail
class WorkspaceManager {
    constructor() {
        this.spaces = [];
        this.currentDeleteId = null;
        this.init();
    }

    async init() {
        await this.loadSpaces();
        await this.setupDarkMode();
        this.setupEventListeners();
        this.updateTabsCount();
        this.renderSpaces();
    }

    // Configuration du mode sombre
    async setupDarkMode() {
        // Charger le thème depuis chrome.storage.sync
        const result = await chrome.storage.sync.get(['darkMode']);
        if (result.darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }

    // Charger les espaces depuis le storage
    async loadSpaces() {
        const result = await chrome.storage.local.get(['workspaces']);
        this.spaces = result.workspaces || [];
    }

    // Sauvegarder les espaces dans le storage
    async saveSpaces() {
        await chrome.storage.local.set({ workspaces: this.spaces });
    }

    // Configuration des écouteurs d'événements
    setupEventListeners() {
        const saveBtn = document.getElementById('save-space-btn');
        const spaceNameInput = document.getElementById('space-name');

        saveBtn.addEventListener('click', () => this.createSpace());
        spaceNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createSpace();
            }
        });

        // Modal de suppression
        const deleteModal = document.getElementById('deleteModal');
        const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

        cancelDeleteBtn.addEventListener('click', () => this.hideDeleteModal());
        confirmDeleteBtn.addEventListener('click', () => this.confirmDelete());

        // Fermer en cliquant sur le fond
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) {
                this.hideDeleteModal();
            }
        });
    }

    // Créer un nouvel espace avec les onglets actuels
    async createSpace() {
        const spaceNameInput = document.getElementById('space-name');
        const saveBtn = document.getElementById('save-space-btn');
        const spaceName = spaceNameInput.value.trim();

        if (!spaceName) {
            this.showToast('Veuillez entrer un nom d\'espace', 'error');
            return;
        }

        // Vérifier si un espace avec ce nom existe déjà
        if (this.spaces.some(space => space.name.toLowerCase() === spaceName.toLowerCase())) {
            this.showToast('Un espace avec ce nom existe déjà', 'error');
            return;
        }

        // Désactiver le bouton pendant le traitement pour éviter les doubles clics
        saveBtn.disabled = true;

        try {
            const tabsData = await this.getCurrentWindowTabsData();

            if (tabsData.length === 0) {
                this.showToast('Aucun onglet valide à sauvegarder', 'error');
                return;
            }

            // Créer le nouvel espace
            const newSpace = {
                id: Date.now().toString(),
                name: spaceName,
                tabs: tabsData,
                createdAt: new Date().toISOString(),
                tabsCount: tabsData.length
            };

            this.spaces.unshift(newSpace);
            await this.saveSpaces();

            spaceNameInput.value = '';
            this.renderSpaces();
            this.showToast(`Espace "${spaceName}" créé avec ${tabsData.length} onglet(s)`, 'success');
        } catch (error) {
            console.error('Erreur lors de la création de l\'espace:', error);
            this.showToast('Erreur lors de la création de l\'espace', 'error');
        } finally {
            // Réactiver le bouton dans tous les cas
            saveBtn.disabled = false;
        }
    }

    // Récupère et formate les onglets valides de la fenêtre actuelle
    async getCurrentWindowTabsData() {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        return tabs
            .filter(tab => this.isValidTab(tab) && this.isUrlSafe(tab.url))
            .map(tab => ({
                url: tab.url,
                title: tab.title,
                favIconUrl: tab.favIconUrl
            }));
    }

    // Ouvrir tous les onglets d'un espace dans la fenêtre actuelle
    async openSpace(spaceId) {
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;

        try {
            // Filtrer les URLs sûres uniquement
            const urls = space.tabs
                .filter(tab => this.isUrlSafe(tab.url))
                .map(tab => tab.url);

            // Ouvrir tous les onglets dans la fenêtre actuelle
            for (const url of urls) {
                await chrome.tabs.create({ url: url, active: false });
            }

            this.showToast(`${space.tabsCount} onglet(s) ouvert(s)`, 'success');
        } catch (error) {
            console.error('Erreur lors de l\'ouverture de l\'espace:', error);
            this.showToast('Erreur lors de l\'ouverture de l\'espace', 'error');
        }
    }

    // Ouvrir tous les onglets d'un espace dans une nouvelle fenêtre
    async openSpaceInNewWindow(spaceId) {
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;

        try {
            const urls = space.tabs
                .filter(tab => this.isUrlSafe(tab.url))
                .map(tab => tab.url);

            if (urls.length === 0) {
                this.showToast('Aucun onglet valide à ouvrir', 'error');
                return;
            }

            await chrome.windows.create({ url: urls });
            this.showToast(`${urls.length} onglet(s) ouvert(s) dans une nouvelle fenêtre`, 'success');
        } catch (error) {
            console.error('Erreur lors de l\'ouverture dans une nouvelle fenêtre:', error);
            this.showToast('Erreur lors de l\'ouverture de l\'espace', 'error');
        }
    }

    // Remplacer les onglets sauvegardés d'un espace par les onglets actuellement ouverts
    async updateSpace(spaceId) {
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;

        try {
            const tabsData = await this.getCurrentWindowTabsData();

            if (tabsData.length === 0) {
                this.showToast('Aucun onglet valide à sauvegarder', 'error');
                return;
            }

            space.tabs = tabsData;
            space.tabsCount = tabsData.length;
            space.updatedAt = new Date().toISOString();

            await this.saveSpaces();
            this.renderSpaces();
            this.showToast(`Espace "${space.name}" mis à jour (${tabsData.length} onglet(s))`, 'success');
        } catch (error) {
            console.error('Erreur lors de la mise à jour de l\'espace:', error);
            this.showToast('Erreur lors de la mise à jour de l\'espace', 'error');
        }
    }

    // Démarre le renommage inline d'un espace (remplace le titre par un champ de saisie)
    startRename(spaceId, card) {
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;

        const nameEl = card.querySelector('.space-name');
        if (!nameEl || nameEl.tagName === 'INPUT') return;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'space-name-input';
        input.maxLength = 30;
        input.value = space.name; // Affectation de propriété : pas de risque d'injection HTML

        nameEl.replaceWith(input);
        input.focus();
        input.select();

        let settled = false;

        const commit = async () => {
            if (settled) return;
            settled = true;

            const newName = input.value.trim();
            if (!newName || newName === space.name) {
                this.renderSpaces();
                return;
            }

            const duplicate = this.spaces.some(
                s => s.id !== spaceId && s.name.toLowerCase() === newName.toLowerCase()
            );
            if (duplicate) {
                this.showToast('Un espace avec ce nom existe déjà', 'error');
                this.renderSpaces();
                return;
            }

            space.name = newName;
            await this.saveSpaces();
            this.renderSpaces();
            this.showToast(`Espace renommé en "${newName}"`, 'success');
        };

        const cancel = () => {
            if (settled) return;
            settled = true;
            this.renderSpaces();
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });
        input.addEventListener('blur', () => commit());
    }

    // Supprimer un espace
    async deleteSpace(spaceId) {
        const space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;

        // Afficher la modal de confirmation
        this.currentDeleteId = spaceId;
        const deleteModalText = document.getElementById('deleteModalText');
        deleteModalText.textContent = `Voulez-vous vraiment supprimer l'espace "${space.name}" ?`;
        this.showDeleteModal();
    }

    // Afficher la modal de suppression
    showDeleteModal() {
        const modal = document.getElementById('deleteModal');
        modal.classList.add('show');
    }

    // Masquer la modal de suppression
    hideDeleteModal() {
        const modal = document.getElementById('deleteModal');
        modal.classList.remove('show');
        this.currentDeleteId = null;
    }

    // Confirmer la suppression
    async confirmDelete() {
        if (!this.currentDeleteId) return;

        const space = this.spaces.find(s => s.id === this.currentDeleteId);
        if (!space) return;

        this.spaces = this.spaces.filter(s => s.id !== this.currentDeleteId);
        await this.saveSpaces();
        this.renderSpaces();
        this.showToast(`Espace "${space.name}" supprimé`, 'success');
        this.hideDeleteModal();
    }

    // Afficher les espaces
    renderSpaces() {
        const container = document.getElementById('spaces-container');

        if (!container) {
            console.error('Container non trouvé');
            return;
        }

        // Vider complètement le conteneur
        container.innerHTML = '';

        if (this.spaces.length === 0) {
            // Créer l'état vide
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <p>Aucun espace sauvegardé</p>
                <p class="hint">Créez votre premier espace ci-dessus !</p>
            `;
            container.appendChild(emptyState);
            return;
        }

        // Ajouter tous les espaces
        this.spaces.forEach(space => {
            const spaceCard = this.createSpaceCard(space);
            container.appendChild(spaceCard);
        });
    }

    // Créer une rangée de miniatures de favicons pour un espace
    createFaviconsRow(tabs) {
        const container = document.createElement('div');
        container.className = 'space-favicons';

        if (!tabs || tabs.length === 0) {
            return container;
        }

        const defaultIcon = chrome.runtime.getURL('logo-fs48.png');
        const maxShown = 8;

        tabs.slice(0, maxShown).forEach(tab => {
            const img = document.createElement('img');
            img.className = 'space-favicon';
            img.src = tab.favIconUrl || defaultIcon;
            img.alt = '';
            img.loading = 'lazy';
            img.title = tab.title || tab.url || '';
            img.addEventListener('error', () => {
                img.src = defaultIcon;
            });
            container.appendChild(img);
        });

        if (tabs.length > maxShown) {
            const more = document.createElement('span');
            more.className = 'space-favicon-more';
            more.textContent = `+${tabs.length - maxShown}`;
            container.appendChild(more);
        }

        return container;
    }

    // Créer une carte d'espace
    createSpaceCard(space) {
        const card = document.createElement('div');
        card.className = 'space-card';

        const date = new Date(space.createdAt).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });

        card.innerHTML = `
            <div class="space-header">
                <div class="space-name">${this.escapeHtml(space.name)}</div>
                <button class="icon-btn" data-action="rename" title="Renommer l'espace" aria-label="Renommer l'espace">✏️</button>
            </div>
            <div class="space-info">
                <span>📑 ${space.tabsCount} onglet${space.tabsCount > 1 ? 's' : ''}</span>
                <span>📅 ${date}</span>
            </div>
            <div class="space-favicons-placeholder"></div>
            <div class="space-actions">
                <button class="btn-secondary" data-action="open">
                    Ouvrir
                </button>
                <button class="icon-btn" data-action="open-window" title="Ouvrir dans une nouvelle fenêtre" aria-label="Ouvrir dans une nouvelle fenêtre">↗</button>
                <button class="icon-btn" data-action="update" title="Remplacer par les onglets actuels" aria-label="Mettre à jour avec les onglets actuels">🔄</button>
                <button class="btn-danger" data-action="delete">
                    Supprimer
                </button>
            </div>
        `;

        // Insertion de la rangée de favicons via DOM (pas d'interpolation dans du HTML)
        const faviconsRow = this.createFaviconsRow(space.tabs);
        card.querySelector('.space-favicons-placeholder').replaceWith(faviconsRow);

        // Délégation des actions de la carte
        card.querySelector('[data-action="open"]').addEventListener('click', () => this.openSpace(space.id));
        card.querySelector('[data-action="open-window"]').addEventListener('click', () => this.openSpaceInNewWindow(space.id));
        card.querySelector('[data-action="update"]').addEventListener('click', () => this.updateSpace(space.id));
        card.querySelector('[data-action="delete"]').addEventListener('click', () => this.deleteSpace(space.id));
        card.querySelector('[data-action="rename"]').addEventListener('click', () => this.startRename(space.id, card));

        return card;
    }

    // Mettre à jour le compteur d'onglets
    async updateTabsCount() {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const validTabs = tabs.filter(tab => this.isValidTab(tab));
        document.getElementById('tabs-count').textContent =
            `${validTabs.length} onglet${validTabs.length > 1 ? 's' : ''} ouvert${validTabs.length > 1 ? 's' : ''}`;
    }

    // Afficher une notification toast
    showToast(message, type = 'success') {
        // Supprimer les toasts existants
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // Échapper le HTML pour éviter les XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Vérifier si un onglet est valide (pas une page système)
    isValidTab(tab) {
        if (!tab || !tab.url) return false;
        const url = tab.url.toLowerCase();

        // Filtrer toutes les pages système des navigateurs Chromium
        // Voir plus tard si je peux faire en sorte de rendre ça plus générique
        const systemProtocols = [
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

        // Vérifier si l'URL commence par un protocole système
        const isSystemPage = systemProtocols.some(protocol => url.startsWith(protocol));

        // Vérifier aussi que c'est une URL web valide (http/https) ou une extension valide
        const isValidUrl = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');

        return !isSystemPage && isValidUrl;
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
}

// Initialiser le gestionnaire d'espaces
document.addEventListener('DOMContentLoaded', () => {
    new WorkspaceManager();
});
