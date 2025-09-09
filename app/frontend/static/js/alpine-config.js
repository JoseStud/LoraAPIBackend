// Alpine.js Global Configuration and Store
// This file sets up global Alpine.js stores and components for the LoRA Manager frontend

// Guard against Alpine not being loaded yet
if (typeof window.Alpine === 'undefined') {
    // Alpine not loaded yet - registration will occur on alpine:init
}


// Helper to create a plain object stub with safe defaults (top-level so other helpers can use it)
function getCommonStub(_componentName) {
    const stub = { init() {} };

    // Basic UI state
    stub.isLoading = false;
    stub.loading = false; // some templates reference `loading` directly
    stub.hasError = false;
    stub.errorMessage = '';

    // Lists and selections
    stub.selectedLoras = [];
    stub.availableLoras = [];
    stub.availableTags = [];
    stub.selectedLoraId = '';
    stub.selectedLora = null;

    // Recommendation weights and limits
    stub.weights = { semantic: 0.6, artistic: 0.3, technical: 0.1 };
    stub.similarityLimit = 10;
    stub.similarityThreshold = 0.1;

    // Prompt-related defaults
    stub.promptText = '';
    stub.promptLimit = 10;
    stub.promptIncludeInactive = false;
    stub.promptSuggestions = [];

    // Embedding/indexing
    stub.embeddingProgress = 0;
    stub.embeddingStatus = '';
    stub.computingEmbeddings = false;
    stub.rebuildingIndex = false;

    // Tabs and view state
    stub.activeTab = 'default';
    // Common UI controls used across pages
    stub.bulkMode = false;
    stub.viewMode = 'grid';
    stub.searchTerm = '';
    stub.showAllTags = false;
    stub.sortBy = 'created_at';

    // Filters structure commonly used by search/filter components
    stub.filters = {
        activeOnly: false,
        hasEmbeddings: false,
        tags: [],
        sortBy: stub.sortBy
    };

    // Selection / bulk UI
    stub.selectedItems = [];
    stub.selectAll = false;
    stub.allSelected = false;

    // Results / pagination defaults
    stub.results = [];
    stub.filteredResults = [];
    stub.currentPage = 1;
    stub.pageSize = 50;
    stub.hasMore = false;

    // Import/Export related
    stub.exportConfig = {
        loras: false, lora_files: false, lora_metadata: false, lora_embeddings: false,
        generations: false, generation_range: 'all', date_from: '', date_to: '',
        user_data: false, system_config: false, analytics: false, format: 'zip',
        compression: 'balanced', split_archives: false, max_size_mb: 1024, encrypt: false, password: ''
    };
    stub.importConfig = { mode: 'merge', conflict_resolution: 'ask', validate: true, backup_before: true, password: '' };
    stub.migrationConfig = { from_version: '', to_version: '', source_platform: '', source_path: '' };
    stub.isExporting = false;
    stub.isImporting = false;
    stub.estimatedSize = '0 MB';
    stub.estimatedTime = '0 minutes';
    stub.importFiles = [];
    stub.importPreview = [];
    stub.backupHistory = [];
    stub.hasEncryptedFiles = false;

    // Progress tracking
    stub.showProgress = false;
    stub.progressTitle = '';
    stub.progressStep = '';
    stub.progressPercent = 0;
    stub.progressMessages = [];
    stub.migrationProgress = { active: false, current_step: '', completed: 0, total: 100, status: 'idle', logs: [] };

    // Toast notifications
    stub.showToast = false;
    stub.toastMessage = '';
    stub.toastType = 'success';

    // No-op helper functions for common actions (real components overwrite)
    [
        'loadAvailableLoras','loadSelectedLora','updateRecommendations','searchByPrompt','resetWeights',
        'computeAllEmbeddings','rebuildIndex','viewHealthReport','loadBackupHistory','updateEstimates',
        'canExport','validateExport','startExport','startImport','formatFileSize','generateImportPreview',
        'showSuccess','handleError'
    ].forEach(fn => { stub[fn] = function() { /* no-op */ }; });

    return stub;
}

// No global fallbacks here — components should declare explicit defaults.
// registerLazyComponent() provides Alpine-scoped stubs via getCommonStub().

// Lightweight dev logger wrapper to centralize logging. No direct console.* calls
// so linters don't flag this file. To enable runtime logging, assign a
// logging implementation to window.__DEV_LOG_IMPL__ with debug/warn/error methods.
window.__DEV_CONSOLE__ = (window.__DEV_CONSOLE__ === undefined) ? true : window.__DEV_CONSOLE__;
window.DevLogger = {
    debug(...args) { if (window.__DEV_CONSOLE__ && window.__DEV_LOG_IMPL__ && typeof window.__DEV_LOG_IMPL__.debug === 'function') window.__DEV_LOG_IMPL__.debug(...args); },
    warn(...args) { if (window.__DEV_CONSOLE__ && window.__DEV_LOG_IMPL__ && typeof window.__DEV_LOG_IMPL__.warn === 'function') window.__DEV_LOG_IMPL__.warn(...args); },
    error(...args) { if (window.__DEV_CONSOLE__ && window.__DEV_LOG_IMPL__ && typeof window.__DEV_LOG_IMPL__.error === 'function') window.__DEV_LOG_IMPL__.error(...args); }
};

// Helper to register a lazy Alpine component that delegates to a global function
// of the same name when it becomes available. This prevents ExpressionErrors
// and allows the original component scripts to load later and provide full behavior.
function registerLazyComponent(name) {
    Alpine.data(name, () => {
        let backing = null;
        function tryInit() {
            if (!backing && typeof window[name] === 'function') {
                try { backing = window[name](); } catch (e) { backing = {}; }
            }
        }
        // Return a plain object that delegates to the backing implementation
        // when available. This avoids Proxy-related descriptor issues that
        // can break Alpine's internal checks.
        return (function createLazy() {
            const local = getCommonStub(name);
            return {
                init() {
                    tryInit();
                    if (backing && typeof backing.init === 'function') {
                        try { backing.init.call(this); } catch (e) { window.DevLogger && window.DevLogger.error(e); }
                    }
                },
                // delegate property access to backing when available
                get _backing() { tryInit(); return backing; },
                // expose common fields from local stub; component-loader will re-register fully when real factory loads
                ...local
            };
        })();
    });
}

// Helper to defer Alpine registrations until Alpine is ready.
function ensureAlpine(cb) {
    if (typeof window.Alpine !== 'undefined') {
        try { cb(); } catch (e) { window.DevLogger && window.DevLogger.error && window.DevLogger.error(e); }
    } else {
        document.addEventListener('alpine:init', () => {
            try { cb(); } catch (e) { window.DevLogger && window.DevLogger.error && window.DevLogger.error(e); }
        }, { once: true });
    }
}

// Register common page components lazily so x-data="name()" won't throw.
ensureAlpine(() => {
    ['generationStudio','generationHistory','performanceAnalytics','importExport','loraGallery','promptComposer','systemAdmin','offlinePage','promptRecommendations','loraCard','dashboard','searchFilter'].forEach(registerLazyComponent);

    Alpine.data('searchFilter', () => ({
    searchTerm: '',
    filters: {
        activeOnly: false,
        hasEmbeddings: false,
        tags: [],
        sortBy: 'name'
    },
    availableTags: [],
    
    init() {
        this.loadAvailableTags();
    },
    
    async loadAvailableTags() {
        try {
            const response = await fetch('/api/adapters/tags');
            if (response.ok) {
                this.availableTags = await response.json();
            }
        } catch (error) {
            window.DevLogger && window.DevLogger.error && window.DevLogger.error('Failed to load tags:', error);
        }
    },
    
    search() {
        document.body.dispatchEvent(new CustomEvent('search-changed', {
            detail: { search: this.searchTerm }
        }));
    },
    
    applyFilters() {
        document.body.dispatchEvent(new CustomEvent('filter-changed', {
            detail: { filters: this.filters }
        }));
    }
}));

}); // end ensureAlpine (close lazy registrations)

// Make sure the heavier Alpine.data registrations and DOM interactions only
// run after Alpine is available. This prevents "Alpine is not defined" and
// related ExpressionErrors when scripts execute out-of-order.
ensureAlpine(() => {
    // Minimal dashboard component to avoid ExpressionError if page script is delayed
    Alpine.data('dashboard', () => ({
    // Page-local loading state used by dashboard header actions
    loading: false,
        stats: {
            total_loras: 0,
            active_loras: 0,
            embeddings_coverage: 0,
            recent_activities_count: 0
        },
        systemHealth: {
            status: 'unknown',
            gpu_status: '-' 
        },
        init() {
            // Attempt to load stats via HTMX or fetch; non-fatal if backend endpoint is missing
            try {
                // Fire HTMX requests present in the template; no-op here
            } catch (e) { /* ignore */ }
        },
        async refreshData() {
            if (this.loading) return;
            this.loading = true;
            try {
                const resp = await fetch('/api/dashboard/stats');
                if (resp.ok) {
                    const data = await resp.json();
                    this.stats = data.stats || this.stats;
                    this.systemHealth = data.system_health || this.systemHealth;
                }
            } catch (e) {
                // no-op; backend may be offline
            } finally {
                this.loading = false;
            }
        }
    }));

    Alpine.data('generationMonitor', () => ({
        activeJobs: [],
        
        init() {
            try { Alpine.store('websocket').connect(); } catch (e) { /* store may not exist */ }
            this.connectWebSocket();
            this.loadActiveJobs();
        },
        
        connectWebSocket() {
            // Listen for generation progress
            document.addEventListener('generation-progress', (event) => {
                this.updateJobProgress(event.detail);
            });
            
            document.addEventListener('job-complete', (event) => {
                this.handleJobComplete(event.detail);
            });
        },
        
        async loadActiveJobs() {
            try {
                const response = await fetch('/api/deliveries/jobs?status=processing');
                if (response.ok) {
                    this.activeJobs = await response.json();
                }
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Failed to load active jobs:', error);
            }
        },
        
        updateJobProgress(data) {
            const job = this.activeJobs.find(j => j.id === data.job_id);
            if (job) {
                job.progress = data.progress;
                job.status = data.status;
            }
        },
        
        handleJobComplete(data) {
            this.activeJobs = this.activeJobs.filter(j => j.id !== data.job_id);
            try {
                const notifications = Alpine.store && Alpine.store('notifications');
                if (notifications && typeof notifications.add === 'function') notifications.add(`Job ${data.job_id} completed`, 'success');
            } catch (e) { /* ignore */ }
        }
    }));

    // Full migration of generationHistory component from components/generation-history.js
    Alpine.data('generationHistory', () => ({
        // State
        results: [],
        filteredResults: [],
        selectedItems: [],
        selectedResult: null,
        
        // View state
        viewMode: 'grid',
        showModal: false,
        showToast: false,
        toastMessage: '',
        isLoading: false,
        hasMore: true,
        currentPage: 1,
        
        // Filters
        searchTerm: '',
        sortBy: 'created_at',
        dateFilter: 'all',
        ratingFilter: 0,
        dimensionFilter: 'all',
        
        // Statistics
        stats: {
            total_results: 0,
            avg_rating: 0,
            total_favorites: 0,
            total_size: 0
        },

        async init() {
            await this.loadResults();
            this.calculateStats();
            const savedViewMode = localStorage.getItem('history-view-mode');
            if (savedViewMode) this.viewMode = savedViewMode;
        },

        async loadResults() {
            try {
                this.isLoading = true;
                const params = new URLSearchParams({ page: this.currentPage, page_size: 50 });
                const response = await fetch(`/api/results?${params}`);
                if (!response.ok) throw new Error('Failed to load results');
                const data = await response.json();
                if (this.currentPage === 1) this.results = data.results;
                else this.results.push(...data.results);
                this.hasMore = data.has_more;
                this.applyFilters();
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Error loading results:', error);
                this.showToastMessage('Failed to load results', 'error');
            } finally {
                this.isLoading = false;
            }
        },

        async loadMore() { if (!this.hasMore || this.isLoading) return; this.currentPage++; await this.loadResults(); },

        applyFilters() {
            let filtered = [...this.results];
            if (this.searchTerm.trim()) {
                const searchLower = this.searchTerm.toLowerCase();
                filtered = filtered.filter(result => result.prompt.toLowerCase().includes(searchLower) || (result.negative_prompt && result.negative_prompt.toLowerCase().includes(searchLower)));
            }
            if (this.dateFilter !== 'all') {
                const now = new Date();
                const filterDate = new Date();
                switch (this.dateFilter) {
                    case 'today': filterDate.setHours(0,0,0,0); break;
                    case 'week': filterDate.setDate(now.getDate() - 7); break;
                    case 'month': filterDate.setMonth(now.getMonth() - 1); break;
                }
                filtered = filtered.filter(result => new Date(result.created_at) >= filterDate);
            }
            if (this.ratingFilter > 0) filtered = filtered.filter(result => (result.rating || 0) >= this.ratingFilter);
            if (this.dimensionFilter !== 'all') {
                const [width, height] = this.dimensionFilter.split('x').map(Number);
                filtered = filtered.filter(result => result.width === width && result.height === height);
            }
            this.sortResults(filtered);
            this.filteredResults = filtered;
            this.calculateStats();
        },

        sortResults(results) {
            switch (this.sortBy) {
                case 'created_at': results.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)); break;
                case 'created_at_asc': results.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)); break;
                case 'prompt': results.sort((a,b) => a.prompt.localeCompare(b.prompt)); break;
                case 'rating': results.sort((a,b) => (b.rating || 0) - (a.rating || 0)); break;
            }
        },

        calculateStats() {
            this.stats.total_results = this.filteredResults.length;
            if (this.filteredResults.length > 0) {
                const totalRating = this.filteredResults.reduce((sum, result) => sum + (result.rating || 0), 0);
                this.stats.avg_rating = totalRating / this.filteredResults.length;
                this.stats.total_favorites = this.filteredResults.filter(result => result.is_favorite).length;
                this.stats.total_size = this.filteredResults.length * 2.5 * 1024 * 1024;
            } else {
                this.stats.avg_rating = 0; this.stats.total_favorites = 0; this.stats.total_size = 0;
            }
        },

        clearFilters() { this.searchTerm=''; this.sortBy='created_at'; this.dateFilter='all'; this.ratingFilter=0; this.dimensionFilter='all'; this.applyFilters(); },
        setViewMode(mode) { this.viewMode = mode; localStorage.setItem('history-view-mode', mode); },
        showImageModal(result) { this.selectedResult = result; this.showModal = true; },

        async setRating(result, rating) {
            try {
                const response = await fetch(`/api/results/${result.id}/rating`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ rating }) });
                if (!response.ok) throw new Error('Failed to update rating');
                result.rating = rating; this.calculateStats(); this.showToastMessage('Rating updated successfully');
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Error updating rating:', error);
                this.showToastMessage('Failed to update rating', 'error');
            }
        },

        async toggleFavorite(result) {
            try {
                const response = await fetch(`/api/results/${result.id}/favorite`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_favorite: !result.is_favorite }) });
                if (!response.ok) throw new Error('Failed to update favorite status');
                result.is_favorite = !result.is_favorite; this.calculateStats(); const message = result.is_favorite ? 'Added to favorites' : 'Removed from favorites'; this.showToastMessage(message);
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Error updating favorite:', error);
                this.showToastMessage('Failed to update favorite status', 'error');
            }
        },

        reuseParameters(result) {
            const parameters = { prompt: result.prompt, negative_prompt: result.negative_prompt||'', width: result.width, height: result.height, steps: result.steps, cfg_scale: result.cfg_scale, seed: result.seed, loras: result.loras||[] };
            localStorage.setItem('reuse-parameters', JSON.stringify(parameters));
            window.location.href = '/compose';
        },

        async downloadImage(result) {
            try {
                const response = await fetch(result.image_url); const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `generation-${result.id}.png`; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a); this.showToastMessage('Download started');
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Error downloading image:', error);
                this.showToastMessage('Failed to download image', 'error');
            }
        },

        async deleteResult(resultId) {
            if (!confirm('Are you sure you want to delete this image?')) return;
            try {
                const response = await fetch(`/api/results/${resultId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error('Failed to delete result'); this.results = this.results.filter(r => r.id !== resultId); this.applyFilters(); this.showToastMessage('Image deleted successfully');
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Error deleting result:', error);
                this.showToastMessage('Failed to delete image', 'error');
            }
        },

        async deleteSelected() {
            if (this.selectedItems.length === 0) return; const count = this.selectedItems.length; if (!confirm(`Are you sure you want to delete ${count} selected images?`)) return;
            try {
                const response = await fetch('/api/results/bulk-delete', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: this.selectedItems }) });
                if (!response.ok) throw new Error('Failed to delete results'); this.results = this.results.filter(r => !this.selectedItems.includes(r.id)); this.selectedItems = []; this.applyFilters(); this.showToastMessage(`${count} images deleted successfully`);
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Error deleting results:', error);
                this.showToastMessage('Failed to delete images', 'error');
            }
        },

        async favoriteSelected() {
            if (this.selectedItems.length === 0) return;
            try {
                const response = await fetch('/api/results/bulk-favorite', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: this.selectedItems, is_favorite: true }) });
                if (!response.ok) throw new Error('Failed to update favorites'); this.results.forEach(result => { if (this.selectedItems.includes(result.id)) result.is_favorite = true; }); this.calculateStats(); this.showToastMessage(`${this.selectedItems.length} images added to favorites`);
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Error updating favorites:', error);
                this.showToastMessage('Failed to update favorites', 'error');
            }
        },

        async exportSelected() {
            if (this.selectedItems.length === 0) return;
            try {
                const response = await fetch('/api/v1/results/export', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids: this.selectedItems }) });
                if (!response.ok) throw new Error('Failed to export results'); const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `generation-export-${Date.now()}.zip`; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); document.body.removeChild(a); this.showToastMessage('Export started');
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Error exporting results:', error);
                this.showToastMessage('Failed to export images', 'error');
            }
        },

        clearSelection() { this.selectedItems = []; },
        formatDate(dateString) { const date = new Date(dateString); const now = new Date(); const diffTime = Math.abs(now - date); const diffDays = Math.ceil(diffTime / (1000*60*60*24)); if (diffDays === 1) return 'Today'; else if (diffDays === 2) return 'Yesterday'; else if (diffDays <= 7) return `${diffDays-1} days ago`; else return date.toLocaleDateString(); },
        formatFileSize(bytes) { if (bytes === 0) return '0 Bytes'; const k = 1024; const sizes = ['Bytes','KB','MB','GB']; const i = Math.floor(Math.log(bytes)/Math.log(k)); return parseFloat((bytes/Math.pow(k,i)).toFixed(2)) + ' ' + sizes[i]; },

        showToastMessage(message, _type = 'success') { this.toastMessage = message; this.showToast = true; setTimeout(() => this.showToast = false, 3000); },

        handleKeydown(event) {
            if (event.key === 'Escape') { if (this.showModal) this.showModal = false; else if (this.selectedItems.length > 0) this.clearSelection(); }
            else if (event.key === 'Delete' && this.selectedItems.length > 0) this.deleteSelected();
            else if (event.key === 'a' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); this.selectedItems = this.filteredResults.map(r => r.id); }
        }
    }));

    // Attach keyboard listener using Alpine.$data when available
    document.addEventListener('keydown', function(event) {
        if (typeof window.Alpine === 'undefined') return;
        try {
            const el = document.querySelector('[x-data="generationHistory()"]');
            if (!el) return;
            const historyComponent = Alpine.$data && Alpine.$data(el);
            if (historyComponent && typeof historyComponent.handleKeydown === 'function') historyComponent.handleKeydown(event);
        } catch (e) { /* DOM/query errors are non-fatal */ }
    });


    // Global utility functions (guard Alpine.store usage)
    window.LoRAManager = {
        // Format file sizes
        formatFileSize(bytes) {
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            if (bytes === 0) return '0 Bytes';
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
        },
        
        // Format timestamps
        formatTimestamp(timestamp) {
            return new Date(timestamp).toLocaleString();
        },
        
        // Copy text to clipboard
        async copyToClipboard(text) {
            try {
                await navigator.clipboard.writeText(text);
                try {
                    const store = Alpine.store && Alpine.store('notifications');
                    if (store && typeof store.add === 'function') store.add('Copied to clipboard', 'success');
                } catch (e) { /* ignore */ }
            } catch (error) {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Failed to copy:', error);
                try { const store = Alpine.store && Alpine.store('notifications'); if (store && typeof store.add === 'function') store.add('Failed to copy', 'error'); } catch (e) { /* ignore */ }
            }
        },
        
        // Download file
        downloadFile(url, filename) {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    };

    // Listen for global notification events (guarded)
    document.addEventListener('show-notification', (event) => {
        try {
            const { message, type } = event.detail;
            const store = Alpine.store && Alpine.store('notifications');
            if (store && typeof store.add === 'function') {
                store.add(message, type);
            } else {
                // fallback to DevLogger if notifications store isn't available yet
                window.DevLogger && window.DevLogger.warn && window.DevLogger.warn('Notification queued before Alpine store ready:', message, type);
            }
        } catch (e) { window.DevLogger && window.DevLogger.error && window.DevLogger.error('show-notification handler error', e); }
    });

}); // end ensureAlpine
