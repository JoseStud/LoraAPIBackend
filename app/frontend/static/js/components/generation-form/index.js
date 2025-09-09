/**
 * Generation Form Component
 * 
 * Handles only the generation parameters and starting generations.
 * Uses the global store for shared state like activeJobs.
 */

export function createGenerationFormComponent() {
    return {
        // Component initialization
        isInitialized: false,
        
        // Form-specific state only
        params: {
            prompt: '',
            negative_prompt: '',
            width: 512,
            height: 512,
            steps: 20,
            cfg_scale: 7.0,
            seed: -1,
            batch_count: 1,
            batch_size: 1
        },
        
        // Form validation
        validation: {
            isValid: true,
            errors: []
        },
        
        // Local UI state
        isGenerating: false,
        
        init() {
            this.loadSavedParams();
            this.isInitialized = true;
        },
        
        // Load saved parameters from localStorage
        loadSavedParams() {
            try {
                const saved = localStorage.getItem('generation_params');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    Object.assign(this.params, parsed);
                }
            } catch (error) {
                // Ignore invalid saved data
            }
        },
        
        // Save parameters to localStorage
        saveParams() {
            localStorage.setItem('generation_params', JSON.stringify(this.params));
        },
        
        // Validate the form
        validateForm() {
            this.validation.errors = [];
            
            if (!this.params.prompt.trim()) {
                this.validation.errors.push('Prompt is required');
            }
            
            if (this.params.width < 128 || this.params.width > 2048) {
                this.validation.errors.push('Width must be between 128 and 2048');
            }
            
            if (this.params.height < 128 || this.params.height > 2048) {
                this.validation.errors.push('Height must be between 128 and 2048');
            }
            
            this.validation.isValid = this.validation.errors.length === 0;
            return this.validation.isValid;
        },
        
        // Start generation (uses global store)
        async startGeneration() {
            if (this.isGenerating || !this.validateForm()) {
                return;
            }
            
            this.isGenerating = true;
            let jobId = null;
            
            try {
                // Save params for next time
                this.saveParams();
                
                // Create job object
                const job = {
                    id: `gen_${Date.now()}`,
                    name: `Generate: ${this.params.prompt.substring(0, 30)}...`,
                    params: { ...this.params },
                    status: 'starting'
                };
                
                jobId = job.id;
                
                // Add to global store
                this.$store.app.addJob(job);
                
                // Make API call
                const response = await fetch('/api/v1/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.params)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    
                    // Update job in store
                    this.$store.app.updateJob(jobId, {
                        status: 'running',
                        jobId: result.job_id
                    });
                    
                    // Show success notification
                    this.$store.app.addNotification('Generation started successfully', 'success');
                    
                } else {
                    throw new Error('Failed to start generation');
                }
                
            } catch (error) {
                // Remove failed job from store
                if (jobId) {
                    this.$store.app.removeJob(jobId);
                }
                
                // Show error notification
                this.$store.app.addNotification(`Generation failed: ${error.message}`, 'error');
                
            } finally {
                this.isGenerating = false;
            }
        },
        
        // Quick actions
        clearPrompt() {
            this.params.prompt = '';
        },
        
        randomSeed() {
            this.params.seed = Math.floor(Math.random() * 1000000);
        },
        
        // Computed properties
        get canGenerate() {
            return !this.isGenerating && this.params.prompt.trim().length > 0;
        },
        
        get hasActiveJobs() {
            return this.$store.app.activeJobs.length > 0;
        }
    };
}
