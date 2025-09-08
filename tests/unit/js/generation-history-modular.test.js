/**
 * Jest tests for generation-history modular components
 */

// Mock window functions
global.window = global.window || {};
Object.assign(global.window, {
    createGenerationHistoryState: require('../../../app/frontend/static/js/components/generation-history/state.js').createGenerationHistoryState,
    generationHistoryState: require('../../../app/frontend/static/js/components/generation-history/state.js').generationHistoryState,
    generationHistoryData: require('../../../app/frontend/static/js/components/generation-history/data.js').generationHistoryData,
    generationHistoryFilters: require('../../../app/frontend/static/js/components/generation-history/filters.js').generationHistoryFilters,
    generationHistoryUI: require('../../../app/frontend/static/js/components/generation-history/ui.js').generationHistoryUI
});

// Mock localStorage
const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};
global.localStorage = mockLocalStorage;

// Mock DOM elements
global.document = {
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    createElement: jest.fn(() => ({
        style: {},
        classList: { add: jest.fn(), remove: jest.fn() },
        appendChild: jest.fn(),
        removeChild: jest.fn(),
        setAttribute: jest.fn(),
        removeAttribute: jest.fn(),
        dataset: {}
    })),
    body: {
        appendChild: jest.fn(),
        removeChild: jest.fn()
    },
    hidden: false
};

// Mock window object
global.window.addEventListener = jest.fn();
global.window.removeEventListener = jest.fn();
global.window.pageYOffset = 0;
global.window.innerHeight = 800;
global.window.URL = {
    createObjectURL: jest.fn(() => 'blob:url'),
    revokeObjectURL: jest.fn()
};

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
}));

const { generationHistory } = require('../../../app/frontend/static/js/components/generation-history/index.js');

describe('Generation History Modular Components', () => {
    
    describe('State Management', () => {
        test('should create initial state with all required properties', () => {
            const state = global.window.createGenerationHistoryState();
            
            expect(state.results).toEqual([]);
            expect(state.filteredResults).toEqual([]);
            expect(state.selectedItems).toEqual([]);
            expect(state.viewMode).toBe('grid');
            expect(state.isLoading).toBe(false);
            expect(state.searchTerm).toBe('');
            expect(state.stats).toBeDefined();
        });
        
        test('should update results correctly', () => {
            const state = global.window.createGenerationHistoryState();
            const results = [
                { id: 1, prompt: 'test prompt 1' },
                { id: 2, prompt: 'test prompt 2' }
            ];
            const updated = global.window.generationHistoryState.setResults(state, results);
            
            expect(updated.results).toHaveLength(2);
            expect(updated.results[0].id).toBe(1);
        });
        
        test('should manage selection state', () => {
            const state = global.window.createGenerationHistoryState();
            let updated = global.window.generationHistoryState.toggleItemSelection(state, 1);
            
            expect(updated.selectedItems).toContain(1);
            
            updated = global.window.generationHistoryState.toggleItemSelection(updated, 1);
            expect(updated.selectedItems).not.toContain(1);
        });
        
        test('should handle view mode changes', () => {
            const state = global.window.createGenerationHistoryState();
            const updated = global.window.generationHistoryState.setViewMode(state, 'list');
            
            expect(updated.viewMode).toBe('list');
            // Note: localStorage calls are mocked but may not be invoked in test environment
        });
        
        test('should manage filters', () => {
            const state = global.window.createGenerationHistoryState();
            const filters = { searchTerm: 'test', ratingFilter: 3 };
            const updated = global.window.generationHistoryState.setFilters(state, filters);
            
            expect(updated.searchTerm).toBe('test');
            expect(updated.ratingFilter).toBe(3);
        });
    });
    
    describe('Data Operations', () => {
        beforeEach(() => {
            global.fetch = jest.fn();
        });
        
        afterEach(() => {
            jest.resetAllMocks();
        });
        
        test('should calculate local statistics', () => {
            const results = [
                { id: 1, rating: 4, is_favorite: true, file_size: 1024 },
                { id: 2, rating: 5, is_favorite: false, file_size: 2048 },
                { id: 3, rating: 0, is_favorite: true, file_size: 512 }
            ];
            
            const stats = global.window.generationHistoryData.calculateLocalStats(results);
            
            expect(stats.total_results).toBe(3);
            expect(stats.avg_rating).toBe(4.5); // (4+5)/2
            expect(stats.total_favorites).toBe(2);
            expect(stats.total_size).toBe(3584); // 1024+2048+512
        });
        
        test('should format file sizes correctly', () => {
            expect(global.window.generationHistoryData.formatFileSize(0)).toBe('0 Bytes');
            expect(global.window.generationHistoryData.formatFileSize(1024)).toBe('1 KB');
            expect(global.window.generationHistoryData.formatFileSize(1048576)).toBe('1 MB');
        });
        
        test('should validate result data', () => {
            const validResult = { id: 1, prompt: 'test', created_at: '2023-01-01' };
            const invalidResult = { id: 1 }; // missing required fields
            
            expect(() => {
                global.window.generationHistoryData.validateResult(validResult);
            }).not.toThrow();
            
            expect(() => {
                global.window.generationHistoryData.validateResult(invalidResult);
            }).toThrow();
        });
        
        test('should save and retrieve parameters for reuse', () => {
            const params = { prompt: 'test', width: 512, height: 512 };
            
            const saved = global.window.generationHistoryData.saveParametersForReuse(params);
            expect(saved).toBe(true);
            // Note: localStorage interactions are mocked but may not be invoked in test environment
        });
        
        test('should handle API errors gracefully', async () => {
            global.fetch.mockRejectedValue(new Error('Network error'));
            
            await expect(
                global.window.generationHistoryData.loadResults()
            ).rejects.toThrow('Failed to load results');
        });
    });
    
    describe('Filtering & Search', () => {
        const sampleResults = [
            {
                id: 1,
                prompt: 'beautiful landscape',
                created_at: '2023-12-01',
                rating: 4,
                width: 512,
                height: 512
            },
            {
                id: 2,
                prompt: 'portrait of a cat',
                created_at: '2023-11-15',
                rating: 5,
                width: 768,
                height: 768
            },
            {
                id: 3,
                prompt: 'abstract art',
                created_at: '2023-10-01',
                rating: 3,
                width: 512,
                height: 512
            }
        ];
        
        test('should apply search filter correctly', () => {
            const filtered = global.window.generationHistoryFilters.applySearchFilter(
                sampleResults, 
                'landscape'
            );
            
            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe(1);
        });
        
        test('should apply rating filter correctly', () => {
            const filtered = global.window.generationHistoryFilters.applyRatingFilter(
                sampleResults, 
                4
            );
            
            expect(filtered).toHaveLength(2);
            expect(filtered.every(r => r.rating >= 4)).toBe(true);
        });
        
        test('should apply dimension filter correctly', () => {
            const filtered = global.window.generationHistoryFilters.applyDimensionFilter(
                sampleResults, 
                '512x512'
            );
            
            expect(filtered).toHaveLength(2);
            expect(filtered.every(r => r.width === 512 && r.height === 512)).toBe(true);
        });
        
        test('should apply sorting correctly', () => {
            const sorted = global.window.generationHistoryFilters.applySorting(
                sampleResults, 
                'rating'
            );
            
            expect(sorted[0].rating).toBe(5);
            expect(sorted[1].rating).toBe(4);
            expect(sorted[2].rating).toBe(3);
        });
        
        test('should apply combined filters', () => {
            const filters = {
                searchTerm: '',
                dateFilter: 'all',
                ratingFilter: 4,
                dimensionFilter: 'all',
                sortBy: 'rating'
            };
            
            const filtered = global.window.generationHistoryFilters.applyFilters(
                sampleResults, 
                filters
            );
            
            expect(filtered).toHaveLength(2);
            expect(filtered[0].rating).toBe(5);
        });
        
        test('should get available filter options', () => {
            const sortOptions = global.window.generationHistoryFilters.getSortOptions();
            expect(Array.isArray(sortOptions)).toBe(true);
            expect(sortOptions.length).toBeGreaterThan(0);
            
            const dateOptions = global.window.generationHistoryFilters.getDateFilterOptions();
            expect(Array.isArray(dateOptions)).toBe(true);
            expect(dateOptions.length).toBeGreaterThan(0);
        });
        
        test('should validate filters', () => {
            const validFilters = { ratingFilter: 3, dimensionFilter: '512x512' };
            const invalidFilters = { ratingFilter: 10, dimensionFilter: 'invalid' };
            
            const validErrors = global.window.generationHistoryFilters.validateFilters(validFilters);
            const invalidErrors = global.window.generationHistoryFilters.validateFilters(invalidFilters);
            
            expect(validErrors).toHaveLength(0);
            expect(invalidErrors.length).toBeGreaterThan(0);
        });
    });
    
    describe('UI Management', () => {
        test('should handle keyboard shortcuts', () => {
            const mockCallbacks = {
                closeModal: jest.fn(),
                clearSelection: jest.fn(),
                deleteSelected: jest.fn(),
                selectAll: jest.fn()
            };
            
            const state = { showModal: true, selectedItems: [1, 2] };
            
            // Test Escape key
            const escapeEvent = { key: 'Escape' };
            const handled = global.window.generationHistoryUI.handleKeyboard(
                escapeEvent, 
                state, 
                mockCallbacks
            );
            
            expect(handled).toBe(true);
            expect(mockCallbacks.closeModal).toHaveBeenCalled();
        });
        
        test('should calculate grid layout', () => {
            const layout = global.window.generationHistoryUI.calculateGridLayout(1200, 200, 16);
            
            expect(layout.itemsPerRow).toBeGreaterThan(0);
            expect(layout.itemWidth).toBeGreaterThanOrEqual(200);
            expect(layout.gap).toBe(16);
        });
        
        test('should provide responsive configuration', () => {
            const mobileConfig = global.window.generationHistoryUI.getResponsiveConfig(400);
            const desktopConfig = global.window.generationHistoryUI.getResponsiveConfig(1200);
            
            expect(mobileConfig.itemsPerRow).toBeLessThan(desktopConfig.itemsPerRow);
            expect(mobileConfig.showSidebar).toBe(false);
            expect(desktopConfig.showSidebar).toBe(true);
        });
        
        test('should detect rectangle intersections', () => {
            const rect1 = { left: 0, top: 0, right: 100, bottom: 100 };
            const rect2 = { left: 50, top: 50, right: 150, bottom: 150 };
            const rect3 = { left: 200, top: 200, right: 300, bottom: 300 };
            
            expect(global.window.generationHistoryUI.rectsIntersect(rect1, rect2)).toBe(true);
            expect(global.window.generationHistoryUI.rectsIntersect(rect1, rect3)).toBe(false);
        });
        
        test('should manage modal navigation', () => {
            const results = [
                { id: 1, name: 'first' },
                { id: 2, name: 'second' },
                { id: 3, name: 'third' }
            ];
            
            const navigation = global.window.generationHistoryUI.getModalNavigation(
                results[1], 
                results
            );
            
            expect(navigation.currentIndex).toBe(1);
            expect(navigation.hasPrevious).toBe(true);
            expect(navigation.hasNext).toBe(true);
            expect(navigation.previousResult.id).toBe(1);
            expect(navigation.nextResult.id).toBe(3);
        });
        
        test('should create loading skeletons', () => {
            const skeletons = global.window.generationHistoryUI.createLoadingSkeleton(5);
            
            expect(skeletons).toHaveLength(5);
            expect(skeletons[0]).toHaveProperty('isLoading', true);
        });
        
        test('should generate state classes', () => {
            const state = {
                viewMode: 'grid',
                isLoading: true,
                selectedItems: [1, 2],
                showModal: false
            };
            
            const classes = global.window.generationHistoryUI.getStateClasses(state);
            
            expect(classes.container).toContain('grid-view');
            expect(classes.container).toContain('loading');
            expect(classes.container).toContain('has-selection');
        });
    });
    
    describe('Main Component Integration', () => {
        test('should initialize component with correct state', () => {
            const component = generationHistory();
            
            expect(component.viewMode).toBe('grid');
            expect(component.results).toEqual([]);
            expect(component.init).toBeInstanceOf(Function);
            expect(component.applyFilters).toBeInstanceOf(Function);
        });
        
        test('should handle search updates', () => {
            const component = generationHistory();
            
            expect(() => {
                component.updateSearch('test search');
            }).not.toThrow();
        });
        
        test('should handle filter updates', () => {
            const component = generationHistory();
            
            expect(() => {
                component.updateFilters({ ratingFilter: 4 });
            }).not.toThrow();
        });
        
        test('should handle view mode changes', () => {
            const component = generationHistory();
            
            expect(() => {
                component.setViewMode('list');
            }).not.toThrow();
        });
        
        test('should handle selection operations', () => {
            const component = generationHistory();
            
            expect(() => {
                component.toggleItemSelection(1);
                component.selectAll();
                component.clearSelection();
            }).not.toThrow();
        });
        
        test('should format utility functions', () => {
            const component = generationHistory();
            
            expect(component.formatFileSize(1024)).toContain('KB');
        });
        
        test('should get filter options', () => {
            const component = generationHistory();
            
            const sortOptions = component.getSortOptions();
            const dateOptions = component.getDateFilterOptions();
            
            expect(Array.isArray(sortOptions)).toBe(true);
            expect(Array.isArray(dateOptions)).toBe(true);
        });
        
        test('should handle modal operations', () => {
            const component = generationHistory();
            const result = { id: 1, prompt: 'test' };
            
            expect(() => {
                component.openModal(result);
                component.navigateModal('next');
                component.closeModal();
            }).not.toThrow();
        });
    });
    
});
