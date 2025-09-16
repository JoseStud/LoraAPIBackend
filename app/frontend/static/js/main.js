/**
 * Vite Main Entry Point for LoRA Manager
 *
 * This is the SINGLE source of truth for all JavaScript in the application.
 */

// STEP 1: ALL IMPORTS AT THE TOP
// =================================================================

// Import CSS bundle (Vite will handle bundling all CSS files)
import '../css/styles.css';
import '../css/design-system.css';
import '../css/mobile-enhanced.css';
import '../css/loading-animations.css';
import '../css/accessibility.css';

// External libraries
import Alpine from 'alpinejs';
import 'htmx.org';
import Chart from 'chart.js/auto';
import { createApp } from 'vue';
import HelloWorld from '../vue/HelloWorld.vue';
import RecommendationsPanel from '../vue/RecommendationsPanel.vue';
import MobileNav from '../vue/MobileNav.vue';
import SystemStatusCard from '../vue/SystemStatusCard.vue';

import GenerationHistory from '../vue/GenerationHistory.vue';


// Utilities
import Utils, {
    formatFileSize,
    formatDuration,
    formatRelativeTime,
    debounce,
    throttle,
    generateUUID,
    copyToClipboard,
    downloadFile,
    validateFile,
    escapeHtml,
    truncateText,
    delay
} from './utils/index.js';

// All Component Creators
import { createDashboardComponent } from './components/dashboard/index.js';
import { createRecommendationsComponent } from './components/recommendations/index.js';
import { createGenerationHistoryComponent } from './components/generation-history/index.js';
import { createLoraGalleryComponent } from './components/lora-gallery/index.js';
import { createGenerationStudioComponent } from './components/generation-studio/index.js';
import { createPromptComposerComponent } from './components/prompt-composer/index.js';
import { createPerformanceAnalyticsComponent } from './components/performance-analytics/index.js';
import { createImportExportComponent } from './components/import-export/index.js';
import { createSystemAdminComponent } from './components/system-admin/index.js';
import { createDatabaseManagerComponent } from './components/system-admin/databaseManager.js';
import { createLogViewerComponent } from './components/system-admin/logViewer.js';

// Import the lora-card component module to register it with Alpine
import './components/lora-card/index.js';
import { createGenerationFormComponent } from './components/generation-form/index.js';
import { createJobQueueComponent } from './components/job-queue/index.js';
import { createNotificationsComponent } from './components/notifications/index.js';


// STEP 2: CONFIGURE EXTERNAL LIBRARIES
// =================================================================

// Make HTMX available globally (htmx auto-registers itself when imported)
// window.htmx is already available globally from the htmx.org import


// Make Chart.js available globally  
window.Chart = Chart;
// STEP 3: ALL CONFIGURATION AND REGISTRATION
// =================================================================

// Make utilities globally available (if needed by templates)
window.Utils = Utils;
window.formatFileSize = formatFileSize;
window.formatDuration = formatDuration;
window.formatRelativeTime = formatRelativeTime;
window.formatSize = formatFileSize; // Alias for backward compatibility
window.debounce = debounce;
window.throttle = throttle;
window.generateUUID = generateUUID;
window.copyToClipboard = copyToClipboard;
window.downloadFile = downloadFile;
window.validateFile = validateFile;
window.escapeHtml = escapeHtml;
window.truncateText = truncateText;
window.delay = delay;

// Define Global Stores FIRST
Alpine.store('app', {
    // System-wide status
    systemStatus: {
        gpu_available: true,
        queue_length: 0,
        status: 'healthy',
        gpu_status: 'Available',
        memory_used: 0,
        memory_total: 8192
    },
    
    // Active generation jobs (shared between generation studio and job queue)
    activeJobs: [],
    
    // Recent generation results (shared between components)
    recentResults: [],
    
    // Global notifications/toasts
    notifications: [],
    
    // User preferences
    preferences: {
        autoSave: true,
        notifications: true,
        theme: 'light'
    },
    
    // Store methods for managing state
    addJob(job) {
        this.activeJobs.push({
            id: job.id || Date.now(),
            name: job.name || 'Generation Job',
            status: 'running',
            progress: 0,
            startTime: new Date(),
            ...job
        });
    },
    
    updateJob(jobId, updates) {
        const job = this.activeJobs.find(j => j.id === jobId);
        if (job) {
            Object.assign(job, updates);
        }
    },
    
    removeJob(jobId) {
        const index = this.activeJobs.findIndex(j => j.id === jobId);
        if (index > -1) {
            this.activeJobs.splice(index, 1);
        }
    },
    
    addResult(result) {
        this.recentResults.unshift(result);
        // Keep only the last 20 results
        if (this.recentResults.length > 20) {
            this.recentResults = this.recentResults.slice(0, 20);
        }
    },
    
    updateSystemStatus(status) {
        Object.assign(this.systemStatus, status);
    },
    
    addNotification(message, type = 'info') {
        const notification = {
            id: Date.now(),
            message,
            type,
            timestamp: new Date()
        };
        this.notifications.push(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            this.removeNotification(notification.id);
        }, 5000);
    },
    
    removeNotification(id) {
        const index = this.notifications.findIndex(n => n.id === id);
        if (index > -1) {
            this.notifications.splice(index, 1);
        }
    }
});

// Register ALL Components
Alpine.data('dashboard', createDashboardComponent);
Alpine.data('recommendationsData', createRecommendationsComponent);
Alpine.data('generationHistory', createGenerationHistoryComponent);
Alpine.data('loraGallery', createLoraGalleryComponent);
Alpine.data('generationStudio', createGenerationStudioComponent);
Alpine.data('promptComposer', createPromptComposerComponent);
Alpine.data('performanceAnalytics', createPerformanceAnalyticsComponent);
Alpine.data('importExport', createImportExportComponent);
Alpine.data('systemAdmin', createSystemAdminComponent);
Alpine.data('databaseManager', createDatabaseManagerComponent);
Alpine.data('logViewer', createLogViewerComponent);
Alpine.data('generationForm', createGenerationFormComponent);
Alpine.data('jobQueue', createJobQueueComponent);
Alpine.data('notifications', createNotificationsComponent);

// Register additional simple components
Alpine.data('searchFilter', () => ({
    query: '',
    filters: {},
    results: [],
    
    search() {
        if (this.query.length < 2) {
            this.results = [];
            return;
        }
        // Basic search functionality
        if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('Searching for:', this.query);
        }
    },
    
    clearSearch() {
        this.query = '';
        this.results = [];
    }
}));

// loraCard is now defined in the lora-gallery component module
// and attached to the window object for global access

Alpine.data('imageViewer', () => ({
    isOpen: false,
    currentImage: null,
    init() {
        // Image viewer functionality
    },
    openImage(src, alt = '') {
        this.currentImage = { src, alt };
        this.isOpen = true;
    },
    closeImage() {
        this.isOpen = false;
        this.currentImage = null;
    }
}));

Alpine.data('confirmDialog', () => ({
    isOpen: false,
    title: '',
    message: '',
    confirmCallback: null,
    init() {
        // Confirmation dialog functionality
    },
    show(title, message, callback) {
        this.title = title;
        this.message = message;
        this.confirmCallback = callback;
        this.isOpen = true;
    },
    confirm() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.close();
    },
    close() {
        this.isOpen = false;
        this.title = '';
        this.message = '';
        this.confirmCallback = null;
    }
}));

// Configure Alpine
Alpine.prefix('x-');

// Make Alpine instance globally available
window.Alpine = Alpine;

// eslint-disable-next-line no-console
console.log('🚀 LoRA Manager Initializing...');


// STEP 3.5: Mount Vue Islands (progressive enhancement)
// =================================================================
const mountVueApp = (selector, component) => {
    const el = document.querySelector(selector);
    if (el) {
        const props = { ...el.dataset };
        const app = createApp(component, props);
        app.mount(el);
        return app;
    }
    return null;
};

// Attempt immediate mount, then fallback after DOM is ready
mountVueApp('[data-vue-root="hello-world"]', HelloWorld) ||
    window.addEventListener('DOMContentLoaded', () => {
        mountVueApp('[data-vue-root="hello-world"]', HelloWorld);
    });

// Mount Recommendations panel if present on page
mountVueApp('[data-vue-root="recommendations-panel"]', RecommendationsPanel) ||
    window.addEventListener('DOMContentLoaded', () => {
        mountVueApp('[data-vue-root="recommendations-panel"]', RecommendationsPanel);
    });

// Mount Mobile Navigation if present on page
mountVueApp('[data-vue-root="mobile-nav"]', MobileNav) ||
    window.addEventListener('DOMContentLoaded', () => {
        mountVueApp('[data-vue-root="mobile-nav"]', MobileNav);
    });

// Mount System Status card if present on page
mountVueApp('[data-vue-root="system-status-card"]', SystemStatusCard) ||
    window.addEventListener('DOMContentLoaded', () => {
        mountVueApp('[data-vue-root="system-status-card"]', SystemStatusCard);
    });


// Mount Generation History if present on page
mountVueApp('[data-vue-root="generation-history"]', GenerationHistory) ||
    window.addEventListener('DOMContentLoaded', () => {
        mountVueApp('[data-vue-root="generation-history"]', GenerationHistory);



// STEP 4: A SINGLE START CALL AT THE VERY END
// =================================================================
Alpine.start();

// eslint-disable-next-line no-console
console.log('🔧 LoRA Manager Initialized Successfully!');

if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('🏃 Development mode active');
    
    // Enable Alpine devtools in development
    window.Alpine.store('dev', {
        enabled: true,
        version: '3.x'
    });
}

export default Alpine;
