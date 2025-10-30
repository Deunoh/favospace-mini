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
            // Récupérer tous les onglets de la fenêtre actuelle
            const tabs = await chrome.tabs.query({ currentWindow: true });
            
            // Filtrer et formater les onglets
            const tabsData = tabs
                .filter(tab => 
                    !tab.url.startsWith('chrome://') && 
                    !tab.url.startsWith('chrome-extension://') &&
                    this.isUrlSafe(tab.url)
                )
                .map(tab => ({
                    url: tab.url,
                    title: tab.title,
                    favIconUrl: tab.favIconUrl
                }));

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

    // Ouvrir tous les onglets d'un espace
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
            </div>
            <div class="space-info">
                <span>📑 ${space.tabsCount} onglet${space.tabsCount > 1 ? 's' : ''}</span>
                <span>📅 ${date}</span>
            </div>
            <div class="space-actions">
                <button class="btn-secondary" data-action="open" data-id="${space.id}">
                    Ouvrir
                </button>
                <button class="btn-danger" data-action="delete" data-id="${space.id}">
                    Supprimer
                </button>
            </div>
        `;

        // Ajouter les écouteurs d'événements
        const openBtn = card.querySelector('[data-action="open"]');
        const deleteBtn = card.querySelector('[data-action="delete"]');

        openBtn.addEventListener('click', () => this.openSpace(space.id));
        deleteBtn.addEventListener('click', () => this.deleteSpace(space.id));

        return card;
    }

    // Mettre à jour le compteur d'onglets
    async updateTabsCount() {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const validTabs = tabs.filter(tab => 
            !tab.url.startsWith('chrome://') && 
            !tab.url.startsWith('chrome-extension://')
        );
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
    // Échapper le HTML pour éviter les XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
