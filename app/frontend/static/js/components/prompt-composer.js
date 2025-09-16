/**
 * Prompt Composer Alpine.js Component
 * Handles drag-and-drop LoRA composition, weight management, and prompt generation
 */

import { fetchData, postData } from '../utils/api.js';

function promptComposer() {
    return {
        // State
        availableLoras: [],
        filteredLoras: [],
        activeLoras: [],
        searchTerm: '',
        activeOnly: false,
        basePrompt: '',
        negativePrompt: '',
        finalPrompt: '',
        
        // UI State
        isLoading: false,
        isGenerating: false,
        showToast: false,
        toastMessage: '',
        draggedIndex: null,
        
        // Computed properties
        get totalWeight() {
            return this.activeLoras.reduce((sum, lora) => sum + parseFloat(lora.weight || 0), 0);
        },
        
        // Initialization
        async init() {
            console.log('Initializing Prompt Composer...');
            await this.loadAvailableLoras();
            this.updatePrompt();
            
            // Watch for changes
            this.$watch('basePrompt', () => this.updatePrompt());
            this.$watch('activeLoras', () => this.updatePrompt());
            // Component ready for template bindings
            this.isInitialized = true;
        },
        
        // API Methods
        async loadAvailableLoras() {
            this.isLoading = true;
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/adapters');
                this.availableLoras = data;
                this.filterLoras();
            } catch (error) {
                console.error('Error loading LoRAs:', error);
                this.showToastMessage('Error loading LoRAs', 'error');
            } finally {
                this.isLoading = false;
            }
        },
        
        // Filtering and Search
        filterLoras() {
            let filtered = [...this.availableLoras];
            
            // Apply search filter
            if (this.searchTerm.trim()) {
                const term = this.searchTerm.toLowerCase();
                filtered = filtered.filter(lora => 
                    lora.name.toLowerCase().includes(term) ||
                    (lora.description && lora.description.toLowerCase().includes(term)) ||
                    (lora.tags && lora.tags.some(tag => tag.toLowerCase().includes(term)))
                );
            }
            
            // Apply active filter
            if (this.activeOnly) {
                filtered = filtered.filter(lora => lora.active);
            }
            
            this.filteredLoras = filtered;
        },
        
        // Composition Management
        addToComposition(lora) {
            if (this.isInComposition(lora.id)) {
                this.showToastMessage('LoRA already in composition', 'warning');
                return;
            }
            
            const compositionLora = {
                ...lora,
                weight: 1.0,
                order: this.activeLoras.length
            };
            
            this.activeLoras.push(compositionLora);
            this.showToastMessage(`Added ${lora.name} to composition`, 'success');
        },
        
        removeFromComposition(index) {
            const lora = this.activeLoras[index];
            this.activeLoras.splice(index, 1);
            this.showToastMessage(`Removed ${lora.name} from composition`, 'success');
        },
        
        clearComposition() {
            if (this.activeLoras.length === 0) return;
            
            if (confirm('Are you sure you want to clear the entire composition?')) {
                this.activeLoras = [];
                this.basePrompt = '';
                this.negativePrompt = '';
                this.showToastMessage('Composition cleared', 'success');
            }
        },
        
        isInComposition(loraId) {
            return this.activeLoras.some(lora => lora.id === loraId);
        },
        
        // Drag and Drop Handlers
        handleDragStart(index, event) {
            this.draggedIndex = index;
            event.dataTransfer.setData('text/plain', index);
            event.target.style.opacity = '0.5';
        },
        
        handleDragOver(index, event) {
            event.preventDefault();
            // Add visual feedback
            if (this.draggedIndex !== null && this.draggedIndex !== index) {
                event.target.style.borderTop = '2px solid #3b82f6';
            }
        },
        
        handleDrop(index, event) {
            event.preventDefault();
            event.target.style.borderTop = '';
            
            const draggedIndex = parseInt(event.dataTransfer.getData('text/plain'));
            if (draggedIndex !== index) {
                this.reorderLoras(draggedIndex, index);
            }
        },
        
        handleDragEnd(event) {
            event.target.style.opacity = '';
            event.target.style.borderTop = '';
            this.draggedIndex = null;
        },
        
        reorderLoras(fromIndex, toIndex) {
            const item = this.activeLoras.splice(fromIndex, 1)[0];
            this.activeLoras.splice(toIndex, 0, item);
            this.showToastMessage('LoRAs reordered', 'success');
        },
        
        // Weight Management
        normalizeWeights() {
            if (this.activeLoras.length === 0) return;
            
            const totalWeight = this.totalWeight;
            if (totalWeight > 0) {
                this.activeLoras.forEach(lora => {
                    lora.weight = (parseFloat(lora.weight) / totalWeight).toFixed(2);
                });
                this.showToastMessage('Weights normalized', 'success');
            }
        },
        
        balanceWeights() {
            if (this.activeLoras.length === 0) return;
            
            const equalWeight = (1.0 / this.activeLoras.length).toFixed(2);
            this.activeLoras.forEach(lora => {
                lora.weight = equalWeight;
            });
            this.showToastMessage('Weights balanced equally', 'success');
        },
        
        // Prompt Generation
        updatePrompt() {
            let prompt = this.basePrompt.trim();
            
            if (this.activeLoras.length > 0) {
                const loraPrompts = this.activeLoras.map(lora => {
                    const weight = parseFloat(lora.weight);
                    if (weight === 1.0) {
                        return `<lora:${lora.name}>`;
                    } else {
                        return `<lora:${lora.name}:${weight}>`;
                    }
                });
                
                if (prompt) {
                    prompt += ', ' + loraPrompts.join(', ');
                } else {
                    prompt = loraPrompts.join(', ');
                }
            }
            
            this.finalPrompt = prompt;
        },
        
        // Actions
        async copyPrompt() {
            if (!this.finalPrompt) return;
            
            try {
                await navigator.clipboard.writeText(this.finalPrompt);
                this.showToastMessage('Prompt copied to clipboard', 'success');
            } catch (error) {
                console.error('Failed to copy prompt:', error);
                this.showToastMessage('Failed to copy prompt', 'error');
            }
        },
        
        async saveComposition() {
            if (this.activeLoras.length === 0) {
                this.showToastMessage('No LoRAs to save', 'warning');
                return;
            }
            
            const composition = {
                name: prompt('Enter a name for this composition:'),
                basePrompt: this.basePrompt,
                negativePrompt: this.negativePrompt,
                loras: this.activeLoras.map(lora => ({
                    id: lora.id,
                    name: lora.name,
                    weight: parseFloat(lora.weight),
                    order: lora.order
                })),
                createdAt: new Date().toISOString()
            };
            
            if (!composition.name) return;
            
            try {
                // Save to localStorage for now (could be enhanced to save to backend)
                const savedCompositions = JSON.parse(localStorage.getItem('loraCompositions') || '[]');
                savedCompositions.push(composition);
                localStorage.setItem('loraCompositions', JSON.stringify(savedCompositions));
                
                this.showToastMessage(`Composition "${composition.name}" saved`, 'success');
            } catch (error) {
                console.error('Failed to save composition:', error);
                this.showToastMessage('Failed to save composition', 'error');
            }
        },
        
        async loadComposition() {
            try {
                const savedCompositions = JSON.parse(localStorage.getItem('loraCompositions') || '[]');
                if (savedCompositions.length === 0) {
                    this.showToastMessage('No saved compositions found', 'warning');
                    return;
                }
                
                // For now, just load the most recent composition
                // TODO: Implement a proper composition selection dialog
                const latest = savedCompositions[savedCompositions.length - 1];
                
                this.basePrompt = latest.basePrompt || '';
                this.negativePrompt = latest.negativePrompt || '';
                
                // Load LoRAs back into composition
                this.activeLoras = [];
                for (const loraData of latest.loras) {
                    const lora = this.availableLoras.find(l => l.id === loraData.id);
                    if (lora) {
                        this.activeLoras.push({
                            ...lora,
                            weight: loraData.weight,
                            order: loraData.order
                        });
                    }
                }
                
                // Sort by order
                this.activeLoras.sort((a, b) => a.order - b.order);
                
                this.showToastMessage(`Loaded composition "${latest.name}"`, 'success');
            } catch (error) {
                console.error('Failed to load composition:', error);
                this.showToastMessage('Failed to load composition', 'error');
            }
        },
        
        async generateImage() {
            if (!this.finalPrompt) {
                this.showToastMessage('No prompt to generate', 'warning');
                return;
            }
            
            this.isGenerating = true;
            
            try {
                const generationParams = {
                    prompt: this.finalPrompt,
                    negative_prompt: this.negativePrompt || '',
                    width: 512,
                    height: 512,
                    steps: 20,
                    cfg_scale: 7.0,
                    seed: -1,
                    batch_count: 1,
                    batch_size: 1
                };
                
                const result = await postData((window?.BACKEND_URL || '') + '/generation/generate', generationParams);

                
                this.showToastMessage('Generation started successfully', 'success');
                

                // Redirect to generation monitoring page or show progress
                if (result.job_id) {
                    window.location.href = `/generate?job_id=${result.job_id}`;
                }
            } catch (error) {
                console.error('Error starting generation:', error);
                this.showToastMessage('Error starting generation', 'error');
            } finally {
                this.isGenerating = false;
            }
        },
        
        // Utility Methods
        addRandomLoras(count = 3) {
            const available = this.filteredLoras.filter(lora => !this.isInComposition(lora.id));
            const toAdd = available.slice(0, count);
            
            toAdd.forEach(lora => this.addToComposition(lora));
            
            if (toAdd.length > 0) {
                this.showToastMessage(`Added ${toAdd.length} random LoRAs`, 'success');
            } else {
                this.showToastMessage('No available LoRAs to add', 'warning');
            }
        },
        
        duplicateComposition() {
            if (this.activeLoras.length === 0) return;
            
            const duplicated = this.activeLoras.map(lora => ({
                ...lora,
                weight: parseFloat(lora.weight)
            }));
            
            this.activeLoras = [...this.activeLoras, ...duplicated];
            this.showToastMessage('Composition duplicated', 'success');
        },
        
        // Toast Notification System
        showToastMessage(message, type = 'success') {
            this.toastMessage = message;
            this.showToast = true;
            
            setTimeout(() => {
                this.showToast = false;
            }, 3000);
        }
    };
}
