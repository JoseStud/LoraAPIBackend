/**
 * Import/Export Component - Migration Logic Module
 * 
 * Handles migration operations between different versions and platforms.
 */

/**
 * Migration operations and utilities
 */
const migrationOperations = {
    /**
     * Validates migration configuration
     */
    validateMigrationConfig(migrationConfig) {
        const issues = [];
        
        if (!migrationConfig.source_path) {
            issues.push('Source path is required for migration');
        }
        
        if (migrationConfig.from_version === migrationConfig.to_version) {
            issues.push('Source and target versions must be different');
        }
        
        const supportedPlatforms = ['automatic1111', 'comfyui', 'invokeai', 'lora-manager'];
        if (!supportedPlatforms.includes(migrationConfig.source_platform)) {
            issues.push('Unsupported source platform');
        }
        
        return issues;
    },
    
    /**
     * Analyzes migration source and generates preview
     */
    async analyzeMigrationSource(migrationConfig) {
        const validation = this.validateMigrationConfig(migrationConfig);
        if (validation.length > 0) {
            throw new Error(`Migration validation failed: ${validation.join(', ')}`);
        }
        
        // Simulate source analysis
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return this.generateMigrationPreview(migrationConfig);
    },
    
    /**
     * Generates migration preview based on source platform
     */
    generateMigrationPreview(migrationConfig) {
        const preview = {
            platform: migrationConfig.source_platform,
            version: migrationConfig.from_version,
            targetVersion: migrationConfig.to_version,
            items: []
        };
        
        // Generate preview items based on platform
        const platformItems = this.getPlatformItems(migrationConfig.source_platform);
        
        platformItems.forEach((item, index) => {
            preview.items.push({
                id: index + 1,
                type: item.type,
                name: item.name,
                status: item.needsConversion ? 'convert' : 'compatible',
                action: item.needsConversion ? 'Convert' : 'Import',
                description: item.description,
                size: this.formatFileSize(Math.random() * 50 * 1024 * 1024)
            });
        });
        
        return preview;
    },
    
    /**
     * Gets platform-specific items for migration
     */
    getPlatformItems(platform) {
        const platformData = {
            'automatic1111': [
                { type: 'LoRA', name: 'models/Lora/*.safetensors', needsConversion: false, description: 'LoRA model files' },
                { type: 'Config', name: 'config.json', needsConversion: true, description: 'A1111 configuration' },
                { type: 'Extensions', name: 'extensions/*', needsConversion: true, description: 'Extension settings' },
                { type: 'Embeddings', name: 'embeddings/*.pt', needsConversion: true, description: 'Textual inversions' },
                { type: 'VAE', name: 'models/VAE/*', needsConversion: false, description: 'VAE models' }
            ],
            'comfyui': [
                { type: 'LoRA', name: 'models/loras/*.safetensors', needsConversion: false, description: 'LoRA model files' },
                { type: 'Workflows', name: 'workflows/*.json', needsConversion: true, description: 'ComfyUI workflows' },
                { type: 'Custom Nodes', name: 'custom_nodes/*', needsConversion: true, description: 'Custom node configs' },
                { type: 'Models', name: 'models/*', needsConversion: false, description: 'Base models' }
            ],
            'invokeai': [
                { type: 'LoRA', name: 'models/lora/*.safetensors', needsConversion: false, description: 'LoRA model files' },
                { type: 'Config', name: 'invokeai.yaml', needsConversion: true, description: 'InvokeAI configuration' },
                { type: 'Models', name: 'models/*', needsConversion: false, description: 'Model registry' },
                { type: 'Outputs', name: 'outputs/*', needsConversion: true, description: 'Generated images' }
            ],
            'lora-manager': [
                { type: 'LoRA', name: 'loras/*.json', needsConversion: false, description: 'LoRA metadata' },
                { type: 'Database', name: 'database.sqlite', needsConversion: false, description: 'Application database' },
                { type: 'Settings', name: 'settings.json', needsConversion: false, description: 'Application settings' },
                { type: 'Cache', name: 'cache/*', needsConversion: false, description: 'Cached data' }
            ]
        };
        
        return platformData[platform] || [];
    },
    
    /**
     * Starts the migration process
     */
    async startMigration(migrationConfig, progressCallback) {
        const validation = this.validateMigrationConfig(migrationConfig);
        if (validation.length > 0) {
            throw new Error(`Migration validation failed: ${validation.join(', ')}`);
        }
        
        const steps = this.generateMigrationSteps(migrationConfig);
        
        try {
            // Process each migration step
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                const progress = Math.round(((i + 1) / steps.length) * 100);
                
                if (progressCallback) {
                    progressCallback({
                        value: progress,
                        step: step.step,
                        message: step.step
                    });
                }
                
                // Simulate step processing
                await new Promise(resolve => setTimeout(resolve, step.duration));
            }
            
            return { 
                success: true, 
                migrated: this.getPlatformItems(migrationConfig.source_platform).length 
            };
            
        } catch (error) {
            throw new Error(`Migration failed: ${error.message}`);
        }
    },
    
    /**
     * Generates migration processing steps
     */
    generateMigrationSteps(migrationConfig) {
        const steps = [];
        const platform = migrationConfig.source_platform;
        
        steps.push({ step: 'Initializing migration...', duration: 500 });
        steps.push({ step: `Analyzing ${platform} installation...`, duration: 2000 });
        steps.push({ step: 'Creating migration backup...', duration: 1500 });
        
        const platformItems = this.getPlatformItems(platform);
        platformItems.forEach(item => {
            if (item.needsConversion) {
                steps.push({ 
                    step: `Converting ${item.type.toLowerCase()}...`, 
                    duration: Math.random() * 2000 + 1000 
                });
            } else {
                steps.push({ 
                    step: `Importing ${item.type.toLowerCase()}...`, 
                    duration: Math.random() * 1500 + 500 
                });
            }
        });
        
        steps.push({ step: 'Updating database schema...', duration: 1500 });
        steps.push({ step: 'Rebuilding indexes...', duration: 2000 });
        steps.push({ step: 'Finalizing migration...', duration: 500 });
        
        return steps;
    },
    
    /**
     * Gets supported source platforms
     */
    getSupportedPlatforms() {
        return [
            { id: 'automatic1111', name: 'Automatic1111 WebUI', description: 'Stable Diffusion WebUI' },
            { id: 'comfyui', name: 'ComfyUI', description: 'Node-based UI for Stable Diffusion' },
            { id: 'invokeai', name: 'InvokeAI', description: 'Professional Stable Diffusion toolkit' },
            { id: 'lora-manager', name: 'LoRA Manager', description: 'Another LoRA Manager instance' }
        ];
    },
    
    /**
     * Gets available version pairs for migration
     */
    getVersionPairs() {
        return [
            { from: '1.0', to: '2.0', description: 'Major version upgrade' },
            { from: '2.0', to: '2.1', description: 'Minor version upgrade' },
            { from: '1.5', to: '2.1', description: 'Cross-version migration' }
        ];
    },
    
    /**
     * Formats file size in human readable format
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { migrationOperations };
} else if (typeof window !== 'undefined') {
    window.migrationOperations = migrationOperations;
}
