<template>
  <div class="import-export-container" v-if="isInitialized">
    <!-- Page Header -->
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">Import/Export</h1>
          <p class="page-subtitle">Manage data migration, backups, and bulk operations</p>
        </div>
        <div class="header-actions">
          <div class="flex items-center space-x-3">
            <!-- Quick Actions -->
            <button @click="quickExportAll" class="btn btn-primary btn-sm">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Quick Export All
            </button>
            
            <button @click="viewHistory" class="btn btn-secondary btn-sm">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              View History
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Tabs -->
    <div class="card">
      <div class="card-header">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8">
            <button @click="activeTab = 'export'" 
                    :class="activeTab === 'export' ? 'tab-button active' : 'tab-button'">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Export Data
            </button>
            
            <button @click="activeTab = 'import'" 
                    :class="activeTab === 'import' ? 'tab-button active' : 'tab-button'">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
              </svg>
              Import Data
            </button>
            
            <button @click="activeTab = 'backup'" 
                    :class="activeTab === 'backup' ? 'tab-button active' : 'tab-button'">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"></path>
              </svg>
              Backup/Restore
            </button>
            
            <button @click="activeTab = 'migration'" 
                    :class="activeTab === 'migration' ? 'tab-button active' : 'tab-button'">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path>
              </svg>
              Data Migration
            </button>
          </nav>
        </div>
      </div>
      
      <div class="card-body">
        
        <!-- Export Tab -->
        <div v-show="activeTab === 'export'" class="space-y-6">
          
          <!-- Export Selection -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <!-- Data Types to Export -->
            <div class="card">
              <div class="card-header">
                <h3 class="text-lg font-semibold">Select Data to Export</h3>
              </div>
              <div class="card-body space-y-4">
                
                <!-- LoRA Data -->
                <div>
                  <label class="flex items-center">
                    <input type="checkbox" 
                           v-model="exportConfig.loras" 
                           class="form-checkbox mr-3">
                    <div>
                      <div class="font-medium">LoRA Models</div>
                      <div class="text-sm text-gray-600">All LoRA files, metadata, and configurations</div>
                    </div>
                  </label>
                  
                  <div v-show="exportConfig.loras" 
                       class="ml-6 mt-3 space-y-2 transition-all duration-200">
                    <label class="flex items-center">
                      <input type="checkbox" 
                             v-model="exportConfig.lora_files" 
                             class="form-checkbox mr-2">
                      <span class="text-sm">Include model files</span>
                    </label>
                    <label class="flex items-center">
                      <input type="checkbox" 
                             v-model="exportConfig.lora_metadata" 
                             class="form-checkbox mr-2">
                      <span class="text-sm">Include metadata only</span>
                    </label>
                    <label class="flex items-center">
                      <input type="checkbox" 
                             v-model="exportConfig.lora_embeddings" 
                             class="form-checkbox mr-2">
                      <span class="text-sm">Include embeddings</span>
                    </label>
                  </div>
                </div>
                
                <!-- Generation Results -->
                <div>
                  <label class="flex items-center">
                    <input type="checkbox" 
                           v-model="exportConfig.generations" 
                           class="form-checkbox mr-3">
                    <div>
                      <div class="font-medium">Generation Results</div>
                      <div class="text-sm text-gray-600">Generated images and their parameters</div>
                    </div>
                  </label>
                  
                  <div v-show="exportConfig.generations" 
                       class="ml-6 mt-3 space-y-2 transition-all duration-200">
                    <div class="flex items-center space-x-4">
                      <label class="flex items-center">
                        <input type="radio" 
                               name="generation_range" 
                               value="all" 
                               v-model="exportConfig.generation_range" 
                               class="form-radio mr-2">
                        <span class="text-sm">All generations</span>
                      </label>
                      <label class="flex items-center">
                        <input type="radio" 
                               name="generation_range" 
                               value="date_range" 
                               v-model="exportConfig.generation_range" 
                               class="form-radio mr-2">
                        <span class="text-sm">Date range</span>
                      </label>
                    </div>
                    
                    <div v-show="exportConfig.generation_range === 'date_range'" 
                         class="grid grid-cols-2 gap-3 transition-all duration-200">
                      <div>
                        <label class="form-label text-xs">From Date</label>
                        <input type="date" 
                               v-model="exportConfig.date_from" 
                               class="form-input text-sm">
                      </div>
                      <div>
                        <label class="form-label text-xs">To Date</label>
                        <input type="date" 
                               v-model="exportConfig.date_to" 
                               class="form-input text-sm">
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Other data types -->
                <div>
                  <label class="flex items-center">
                    <input type="checkbox" 
                           v-model="exportConfig.user_data" 
                           class="form-checkbox mr-3">
                    <div>
                      <div class="font-medium">User Data</div>
                      <div class="text-sm text-gray-600">User preferences and settings</div>
                    </div>
                  </label>
                </div>
                
                <div>
                  <label class="flex items-center">
                    <input type="checkbox" 
                           v-model="exportConfig.system_config" 
                           class="form-checkbox mr-3">
                    <div>
                      <div class="font-medium">System Configuration</div>
                      <div class="text-sm text-gray-600">System settings and configurations</div>
                    </div>
                  </label>
                </div>
                
                <div>
                  <label class="flex items-center">
                    <input type="checkbox" 
                           v-model="exportConfig.analytics" 
                           class="form-checkbox mr-3">
                    <div>
                      <div class="font-medium">Analytics Data</div>
                      <div class="text-sm text-gray-600">Performance metrics and usage statistics</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
            
            <!-- Export Options -->
            <div class="card">
              <div class="card-header">
                <h3 class="text-lg font-semibold">Export Options</h3>
              </div>
              <div class="card-body space-y-4">
                
                <!-- Format Selection -->
                <div>
                  <label class="form-label">Export Format</label>
                  <select v-model="exportConfig.format" class="form-input">
                    <option value="zip">ZIP Archive</option>
                    <option value="tar.gz">TAR.GZ Archive</option>
                    <option value="folder">Folder Structure</option>
                  </select>
                </div>
                
                <!-- Compression Level -->
                <div>
                  <label class="form-label">Compression Level</label>
                  <select v-model="exportConfig.compression" class="form-input">
                    <option value="none">No Compression</option>
                    <option value="fast">Fast Compression</option>
                    <option value="balanced">Balanced</option>
                    <option value="maximum">Maximum Compression</option>
                  </select>
                </div>
                
                <!-- Split Archives -->
                <div>
                  <label class="flex items-center">
                    <input type="checkbox" 
                           v-model="exportConfig.split_archives" 
                           class="form-checkbox mr-2">
                    <span>Split large archives</span>
                  </label>
                  <div v-show="exportConfig.split_archives" 
                       class="mt-2 transition-all duration-200">
                    <label class="form-label text-sm">Max size per archive (MB)</label>
                    <input type="number" 
                           v-model="exportConfig.max_size_mb" 
                           min="100" 
                           max="4096" 
                           class="form-input text-sm">
                  </div>
                </div>
                
                <!-- Encryption -->
                <div>
                  <label class="flex items-center">
                    <input type="checkbox" 
                           v-model="exportConfig.encrypt" 
                           class="form-checkbox mr-2">
                    <span>Encrypt export</span>
                  </label>
                  <div v-show="exportConfig.encrypt" 
                       class="mt-2 transition-all duration-200">
                    <label class="form-label text-sm">Password</label>
                    <input type="password" 
                           v-model="exportConfig.password" 
                           class="form-input text-sm">
                  </div>
                </div>
                
                <!-- Estimated Size -->
                <div class="p-3 bg-gray-50 rounded">
                  <div class="text-sm font-medium">Estimated Export Size</div>
                  <div class="text-lg font-bold text-blue-600">{{ estimatedSize }}</div>
                  <div class="text-xs text-gray-600">
                    Processing time: ~{{ estimatedTime }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Export Actions -->
          <div class="flex justify-between items-center pt-6 border-t">
            <div class="flex items-center space-x-4">
              <button @click="validateExport" class="btn btn-secondary">
                Validate Selection
              </button>
              <button @click="previewExport" class="btn btn-secondary">
                Preview Contents
              </button>
            </div>
            <button @click="startExport" 
                    class="btn btn-primary"
                    :disabled="!canExport || isExporting">
              <template v-if="!isExporting">
                <span>Start Export</span>
              </template>
              <template v-else>
                <div class="flex items-center">
                  <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
                  </svg>
                  Exporting...
                </div>
              </template>
            </button>
          </div>
        </div>
        
        <!-- Import Tab -->
        <div v-show="activeTab === 'import'" class="space-y-6">
          
          <!-- Import Options -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <!-- File Upload -->
            <div class="card">
              <div class="card-header">
                <h3 class="text-lg font-semibold">Select Import Source</h3>
              </div>
              <div class="card-body">
                
                <!-- File Upload Area -->
                <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors"
                     @drop.prevent="handleFileDrop"
                     @dragover.prevent="handleDragOver"
                     @dragleave="handleDragLeave">
                  <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                  <div class="mt-4">
                    <label class="cursor-pointer">
                      <span class="mt-2 block text-sm font-medium text-gray-900">
                        Drop files here or click to upload
                      </span>
                      <input type="file" 
                             @change="handleFileSelect" 
                             multiple 
                             accept=".zip,.tar.gz,.json,.lora,.safetensors"
                             class="hidden">
                    </label>
                    <p class="mt-2 text-xs text-gray-500">
                      Supports ZIP, TAR.GZ, JSON, LoRA, SafeTensors files
                    </p>
                  </div>
                </div>
                
                <!-- Selected Files -->
                <div v-show="importFiles.length > 0" class="mt-4 transition-all duration-200">
                  <h4 class="text-sm font-medium mb-2">Selected Files</h4>
                  <div class="space-y-2">
                    <div v-for="file in importFiles" :key="file.name" class="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div class="flex items-center space-x-2">
                        <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        <span class="text-sm">{{ file.name }}</span>
                      </div>
                      <div class="flex items-center space-x-2">
                        <span class="text-xs text-gray-500">{{ formatFileSize(file.size) }}</span>
                        <button @click="removeFile(file)" class="text-red-500 hover:text-red-700">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Import Settings -->
            <div class="card">
              <div class="card-header">
                <h3 class="text-lg font-semibold">Import Settings</h3>
              </div>
              <div class="card-body space-y-4">
                
                <!-- Import Mode -->
                <div>
                  <label class="form-label">Import Mode</label>
                  <select v-model="importConfig.mode" class="form-input">
                    <option value="merge">Merge with existing data</option>
                    <option value="replace">Replace existing data</option>
                    <option value="skip">Skip conflicting items</option>
                  </select>
                </div>
                
                <!-- Conflict Resolution -->
                <div>
                  <label class="form-label">Conflict Resolution</label>
                  <select v-model="importConfig.conflict_resolution" class="form-input">
                    <option value="ask">Ask for each conflict</option>
                    <option value="keep_existing">Keep existing</option>
                    <option value="overwrite">Overwrite with imported</option>
                    <option value="rename">Rename imported items</option>
                  </select>
                </div>
                
                <!-- Validation -->
                <div>
                  <label class="flex items-center">
                    <input type="checkbox" 
                           v-model="importConfig.validate" 
                           class="form-checkbox mr-2">
                    <span>Validate data before import</span>
                  </label>
                </div>
                
                <!-- Backup Before Import -->
                <div>
                  <label class="flex items-center">
                    <input type="checkbox" 
                           v-model="importConfig.backup_before" 
                           class="form-checkbox mr-2">
                    <span>Create backup before import</span>
                  </label>
                </div>
                
                <!-- Encryption -->
                <div v-show="hasEncryptedFiles" class="transition-all duration-200">
                  <label class="form-label">Archive Password</label>
                  <input type="password" 
                         v-model="importConfig.password" 
                         placeholder="Enter password for encrypted archives"
                         class="form-input">
                </div>
              </div>
            </div>
          </div>
          
          <!-- Import Preview -->
          <div v-show="importPreview.length > 0" class="card transition-all duration-200">
            <div class="card-header">
              <h3 class="text-lg font-semibold">Import Preview</h3>
              <p class="text-sm text-gray-600">Review what will be imported</p>
            </div>
            <div class="card-body">
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-for="item in importPreview" :key="item.id">
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ item.type }}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ item.name }}</td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                              :class="getStatusClasses(item.status)">
                          {{ item.status }}
                        </span>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ item.action }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <!-- Import Actions -->
          <div class="flex justify-between items-center pt-6 border-t">
            <div class="flex items-center space-x-4">
              <button @click="analyzeFiles" 
                      class="btn btn-secondary"
                      :disabled="importFiles.length === 0">
                Analyze Files
              </button>
              <button @click="validateImport" 
                      class="btn btn-secondary"
                      :disabled="importFiles.length === 0">
                Validate Import
              </button>
            </div>
            <button @click="startImport" 
                    class="btn btn-primary"
                    :disabled="importFiles.length === 0 || isImporting">
              <template v-if="!isImporting">
                <span>Start Import</span>
              </template>
              <template v-else>
                <div class="flex items-center">
                  <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
                  </svg>
                  Importing...
                </div>
              </template>
            </button>
          </div>
        </div>
        
        <!-- Backup/Restore Tab -->
        <div v-show="activeTab === 'backup'" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button @click="createFullBackup" class="card card-interactive text-center p-6">
              <svg class="w-12 h-12 mx-auto mb-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"></path>
              </svg>
              <h3 class="text-lg font-semibold mb-2">Full System Backup</h3>
              <p class="text-sm text-gray-600">Complete backup of all data and settings</p>
            </button>
            
            <button @click="createQuickBackup" class="card card-interactive text-center p-6">
              <svg class="w-12 h-12 mx-auto mb-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
              <h3 class="text-lg font-semibold mb-2">Quick Backup</h3>
              <p class="text-sm text-gray-600">Essential data only for fast backup</p>
            </button>
            
            <button @click="scheduleBackup" class="card card-interactive text-center p-6">
              <svg class="w-12 h-12 mx-auto mb-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
              <h3 class="text-lg font-semibold mb-2">Schedule Backup</h3>
              <p class="text-sm text-gray-600">Automatic recurring backups</p>
            </button>
          </div>
          
          <!-- Backup History -->
          <div class="card">
            <div class="card-header">
              <h3 class="text-lg font-semibold">Backup History</h3>
              <p class="text-sm text-gray-600">Manage existing backups</p>
            </div>
            <div class="card-body">
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="bg-white divide-y divide-gray-200">
                    <tr v-for="backup in backupHistory" :key="backup.id">
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {{ formatDate(backup.created_at) }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ backup.type }}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {{ formatFileSize(backup.size) }}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full"
                              :class="backup.status === 'completed' ? 'bg-green-100 text-green-800' : 
                                      backup.status === 'failed' ? 'bg-red-100 text-red-800' : 
                                      'bg-yellow-100 text-yellow-800'">
                          {{ backup.status }}
                        </span>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div class="flex space-x-2">
                          <button @click="downloadBackup(backup.id)" class="text-blue-600 hover:text-blue-900">
                            Download
                          </button>
                          <button @click="restoreBackup(backup.id)" class="text-green-600 hover:text-green-900">
                            Restore
                          </button>
                          <button @click="deleteBackup(backup.id)" class="text-red-600 hover:text-red-900">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="backupHistory.length === 0">
                      <td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">
                        No backups found. Create your first backup above.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Migration Tab -->
        <div v-show="activeTab === 'migration'" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <!-- Version Migration -->
            <div class="card">
              <div class="card-header">
                <h3 class="text-lg font-semibold">Version Migration</h3>
                <p class="text-sm text-gray-600">Migrate data between software versions</p>
              </div>
              <div class="card-body space-y-4">
                <div>
                  <label class="form-label">From Version</label>
                  <select v-model="migrationConfig.from_version" class="form-input">
                    <option value="1.0">Version 1.0</option>
                    <option value="1.1">Version 1.1</option>
                    <option value="2.0">Version 2.0</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">To Version</label>
                  <select v-model="migrationConfig.to_version" class="form-input">
                    <option value="2.1">Version 2.1 (Current)</option>
                    <option value="3.0">Version 3.0 (Beta)</option>
                  </select>
                </div>
                <button @click="startVersionMigration" class="btn btn-primary w-full">
                  Start Version Migration
                </button>
              </div>
            </div>
            
            <!-- Platform Migration -->
            <div class="card">
              <div class="card-header">
                <h3 class="text-lg font-semibold">Platform Migration</h3>
                <p class="text-sm text-gray-600">Migrate from other LoRA management systems</p>
              </div>
              <div class="card-body space-y-4">
                <div>
                  <label class="form-label">Source Platform</label>
                  <select v-model="migrationConfig.source_platform" class="form-input">
                    <option value="automatic1111">Automatic1111</option>
                    <option value="invokeai">InvokeAI</option>
                    <option value="comfyui">ComfyUI</option>
                    <option value="fooocus">Fooocus</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Data Location</label>
                  <input type="text" 
                         v-model="migrationConfig.source_path" 
                         placeholder="/path/to/source/data"
                         class="form-input">
                </div>
                <button @click="startPlatformMigration" class="btn btn-primary w-full">
                  Start Platform Migration
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Progress Modal -->
    <div v-show="showProgress" 
         class="fixed inset-0 z-50 overflow-y-auto transition-opacity duration-300"
         :class="showProgress ? 'opacity-100' : 'opacity-0'"
         role="dialog"
         aria-modal="true"
         :aria-busy="showProgress"
         aria-labelledby="progress-title">
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75"></div>
        
        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 id="progress-title" class="text-lg leading-6 font-medium text-gray-900 mb-4">{{ progressTitle }}</h3>
            
            <div class="space-y-4">
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span>{{ currentStep }}</span>
                  <span>{{ progressValue }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-blue-600 h-2 rounded-full transition-all duration-500"
                       :style="`width: ${progressValue}%`"></div>
                </div>
              </div>
              
              <div class="max-h-40 overflow-y-auto text-xs font-mono bg-gray-100 p-3 rounded">
                <div v-for="message in progressMessages" :key="message.id">
                  {{ message.text }}
                </div>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button @click="cancelOperation" 
                    type="button" 
                    class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:ml-3 sm:w-auto sm:text-sm">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast Notifications -->
    <div v-show="showToast" 
         class="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg transition-all duration-300"
         :class="toastClasses">
      {{ toastMessage }}
    </div>
  </div>
  
  <!-- Loading state -->
  <div v-else class="py-12 text-center text-gray-500">
    <svg class="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25"></circle>
      <path d="M4 12a8 8 0 018-8" stroke-width="4" class="opacity-75"></path>
    </svg>
    <div>Preparing import/export...</div>
  </div>
</template>

<script>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useApi } from '@/composables/useApi';

export default {
  name: 'ImportExport',
  setup() {
    // Component state
    const isInitialized = ref(false);
    const activeTab = ref('export');
    
    // Operation states
    const isExporting = ref(false);
    const isImporting = ref(false);
    const isMigrating = ref(false);
    
    // Progress tracking
    const showProgress = ref(false);
    const progressValue = ref(0);
    const currentStep = ref('');
    const progressMessages = ref([]);
    const progressTitle = computed(() => {
      if (isExporting.value) return 'Export Progress';
      if (isImporting.value) return 'Import Progress';
      if (isMigrating.value) return 'Migration Progress';
      return 'Progress';
    });
    
    // Toast notifications
    const showToast = ref(false);
    const toastMessage = ref('');
    const toastType = ref('info');
    const toastClasses = computed(() => {
      const baseClasses = 'px-4 py-2 rounded-lg shadow-lg';
      switch (toastType.value) {
        case 'success': return `${baseClasses} bg-green-500 text-white`;
        case 'error': return `${baseClasses} bg-red-500 text-white`;
        case 'warning': return `${baseClasses} bg-yellow-500 text-white`;
        default: return `${baseClasses} bg-blue-500 text-white`;
      }
    });
    
    // Export configuration
    const exportConfig = reactive({
      loras: true,
      lora_files: true,
      lora_metadata: true,
      lora_embeddings: false,
      generations: false,
      generation_range: 'all',
      date_from: '',
      date_to: '',
      user_data: false,
      system_config: false,
      analytics: false,
      format: 'zip',
      compression: 'balanced',
      split_archives: false,
      max_size_mb: 1024,
      encrypt: false,
      password: ''
    });
    
    // Import configuration
    const importConfig = reactive({
      mode: 'merge',
      conflict_resolution: 'ask',
      validate: true,
      backup_before: true,
      password: ''
    });
    
    // Migration configuration
    const migrationConfig = reactive({
      from_version: '2.0',
      to_version: '2.1',
      source_platform: 'automatic1111',
      source_path: ''
    });
    
    // Import state
    const importFiles = ref([]);
    const importPreview = ref([]);
    const hasEncryptedFiles = computed(() => 
      importFiles.value.some(file => 
        file.name.includes('encrypted') || 
        file.name.includes('password') || 
        file.name.includes('.enc')
      )
    );
    
    // Backup state
    const backupHistory = ref([]);
    
    // Export estimates
    const estimatedSize = ref('0 MB');
    const estimatedTime = ref('0 minutes');
    
    // Computed properties
    const canExport = computed(() => 
      exportConfig.loras || 
      exportConfig.generations || 
      exportConfig.user_data || 
      exportConfig.system_config || 
      exportConfig.analytics
    );
    
    // Watch for config changes to update estimates
    watch(exportConfig, async () => {
      await updateEstimates();
    }, { deep: true });
    
    // Utility functions
    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };
    
    const showToastMessage = (message, type = 'info') => {
      toastMessage.value = message;
      toastType.value = type;
      showToast.value = true;
      
      setTimeout(() => {
        showToast.value = false;
      }, 3000);
    };
    
    const getStatusClasses = (status) => {
      const statusClasses = {
        'new': 'bg-green-100 text-green-800',
        'conflict': 'bg-yellow-100 text-yellow-800',
        'existing': 'bg-gray-100 text-gray-800',
        'error': 'bg-red-100 text-red-800'
      };
      return statusClasses[status] || 'bg-gray-100 text-gray-800';
    };
    
    const updateProgressDisplay = (progress) => {
      if (progress.value !== undefined) progressValue.value = progress.value;
      if (progress.step !== undefined) currentStep.value = progress.step;
      if (progress.message !== undefined) {
        progressMessages.value.push({
          id: Date.now(),
          text: `[${new Date().toLocaleTimeString()}] ${progress.message}`
        });
      }
    };
    
    // Export functions
    const updateEstimates = async () => {
      try {
        const response = await fetch('/api/v1/export/estimate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify(exportConfig)
        });
        
        if (response.ok) {
          const estimates = await response.json();
          estimatedSize.value = estimates.size;
          estimatedTime.value = estimates.time;
        } else {
          // Fallback to local calculation
          updateEstimatesLocal();
        }
      } catch (error) {
        // Fallback to local calculation
        updateEstimatesLocal();
      }
    };
    
    const updateEstimatesLocal = () => {
      let sizeBytes = 0;
      let timeMinutes = 0;
      
      if (exportConfig.loras) {
        sizeBytes += 10 * 1024 * 1024; // 10MB for metadata
        timeMinutes += 2;
        
        if (exportConfig.lora_files) {
          sizeBytes += 500 * 1024 * 1024; // 500MB for model files
          timeMinutes += 10;
        }
        
        if (exportConfig.lora_embeddings) {
          sizeBytes += 100 * 1024 * 1024; // 100MB for embeddings
          timeMinutes += 3;
        }
      }
      
      if (exportConfig.generations) {
        if (exportConfig.generation_range === 'all') {
          sizeBytes += 200 * 1024 * 1024; // 200MB
          timeMinutes += 5;
        } else {
          sizeBytes += 50 * 1024 * 1024; // 50MB for date range
          timeMinutes += 2;
        }
      }
      
      if (exportConfig.user_data) {
        sizeBytes += 5 * 1024 * 1024; // 5MB
        timeMinutes += 1;
      }
      
      if (exportConfig.system_config) {
        sizeBytes += 1 * 1024 * 1024; // 1MB
        timeMinutes += 1;
      }
      
      if (exportConfig.analytics) {
        sizeBytes += 20 * 1024 * 1024; // 20MB
        timeMinutes += 2;
      }
      
      // Apply compression
      const compressionRatio = {
        'none': 1.0,
        'fast': 0.7,
        'balanced': 0.5,
        'maximum': 0.3
      }[exportConfig.compression];
      
      sizeBytes *= compressionRatio;
      
      estimatedSize.value = formatFileSize(sizeBytes);
      estimatedTime.value = Math.max(1, Math.ceil(timeMinutes)) + ' minutes';
    };
    
    const validateExport = () => {
      const issues = [];
      
      if (!canExport.value) {
        issues.push('No data types selected for export');
      }
      
      if (exportConfig.generations && 
          exportConfig.generation_range === 'date_range' &&
          (!exportConfig.date_from || !exportConfig.date_to)) {
        issues.push('Date range required for generation export');
      }
      
      if (exportConfig.split_archives && exportConfig.max_size_mb < 10) {
        issues.push('Maximum archive size too small for split archives');
      }
      
      if (exportConfig.encrypt && !exportConfig.password) {
        issues.push('Password required for encrypted export');
      }
      
      if (issues.length > 0) {
        showToastMessage(`Validation failed: ${issues.join(', ')}`, 'error');
      } else {
        showToastMessage('Export configuration is valid', 'success');
      }
    };
    
    const previewExport = () => {
      showToastMessage('Preview functionality coming soon', 'info');
    };
    
    const startExport = async () => {
      try {
        isExporting.value = true;
        showProgress.value = true;
        progressValue.value = 0;
        progressMessages.value = [];
        
        updateProgressDisplay({
          value: 10,
          step: 'Preparing export...',
          message: 'Validating configuration'
        });
        
        // Call the real export API
        const response = await fetch('/api/v1/export', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify(exportConfig)
        });
        
        updateProgressDisplay({
          value: 50,
          step: 'Generating export...',
          message: 'Creating archive'
        });
        
        if (!response.ok) {
          throw new Error(`Export failed: ${response.status}`);
        }
        
        updateProgressDisplay({
          value: 90,
          step: 'Finalizing export...',
          message: 'Preparing download'
        });
        
        // Get the blob and trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        // Extract filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `lora_export_${new Date().toISOString().slice(0, 10)}.${exportConfig.format}`;
        
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }
        
        // Trigger download
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        updateProgressDisplay({
          value: 100,
          step: 'Export completed',
          message: 'Download started'
        });
        
        showToastMessage('Export completed successfully', 'success');
        
      } catch (error) {
        showToastMessage(`Export failed: ${error.message}`, 'error');
      } finally {
        isExporting.value = false;
        showProgress.value = false;
      }
    };
    
    const quickExportAll = () => {
      exportConfig.loras = true;
      exportConfig.lora_files = true;
      exportConfig.generations = true;
      exportConfig.user_data = true;
      exportConfig.system_config = true;
      startExport();
    };
    
    // Import functions
    const handleFileDrop = (event) => {
      const droppedFiles = Array.from(event.dataTransfer.files);
      const validFiles = validateImportFiles(droppedFiles);
      importFiles.value = [...importFiles.value, ...validFiles];
      
      if (validFiles.length < droppedFiles.length) {
        showToastMessage('Some files were skipped (unsupported format)', 'warning');
      }
    };
    
    const handleFileSelect = (event) => {
      const selectedFiles = Array.from(event.target.files);
      const validFiles = validateImportFiles(selectedFiles);
      importFiles.value = [...importFiles.value, ...validFiles];
      
      if (validFiles.length < selectedFiles.length) {
        showToastMessage('Some files were skipped (unsupported format)', 'warning');
      }
    };
    
    const validateImportFiles = (files) => {
      const validExtensions = ['.zip', '.tar.gz', '.json', '.lora', '.safetensors'];
      return files.filter(file => {
        const extension = getFileExtension(file.name);
        return validExtensions.includes(extension);
      });
    };
    
    const getFileExtension = (filename) => {
      if (filename.endsWith('.tar.gz')) return '.tar.gz';
      const lastDot = filename.lastIndexOf('.');
      return lastDot !== -1 ? filename.substring(lastDot) : '';
    };
    
    const removeFile = (fileToRemove) => {
      importFiles.value = importFiles.value.filter(file => file !== fileToRemove);
      if (importFiles.value.length === 0) {
        importPreview.value = [];
      }
    };
    
    const handleDragOver = (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      event.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
    };
    
    const handleDragLeave = (event) => {
      event.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
    };
    
    const analyzeFiles = async () => {
      if (importFiles.value.length === 0) return;
      
      try {
        showToastMessage('Analyzing import files...', 'info');
        
        // Simulate file analysis
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Generate preview data
        const preview = [];
        const types = ['LoRA', 'Generation', 'Config', 'User Data'];
        const statuses = ['new', 'conflict', 'existing'];
        const actions = ['Import', 'Skip', 'Overwrite', 'Rename'];
        
        importFiles.value.forEach((file, fileIndex) => {
          const itemsPerFile = Math.floor(Math.random() * 5) + 1;
          
          for (let i = 0; i < itemsPerFile; i++) {
            const type = types[Math.floor(Math.random() * types.length)];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            
            preview.push({
              id: `${fileIndex}_${i}`,
              type: type,
              name: `${type.toLowerCase()}_${file.name}_${i + 1}`,
              status: status,
              action: status === 'conflict' ? 'Ask' : actions[Math.floor(Math.random() * actions.length)]
            });
          }
        });
        
        importPreview.value = preview;
        showToastMessage('File analysis completed', 'success');
        
      } catch (error) {
        showToastMessage(`Analysis failed: ${error.message}`, 'error');
      }
    };
    
    const validateImport = () => {
      const issues = [];
      
      if (importFiles.value.length === 0) {
        issues.push('No files selected for import');
      }
      
      if (importConfig.mode === 'replace' && !importConfig.backup_before) {
        issues.push('Backup recommended when using replace mode');
      }
      
      if (issues.length > 0) {
        showToastMessage(`Validation failed: ${issues.join(', ')}`, 'error');
      } else {
        showToastMessage('Import configuration is valid', 'success');
      }
    };
    
    const startImport = async () => {
      if (importFiles.value.length === 0) {
        showToastMessage('No files selected for import', 'error');
        return;
      }
      
      try {
        isImporting.value = true;
        showProgress.value = true;
        progressValue.value = 0;
        progressMessages.value = [];
        
        updateProgressDisplay({
          value: 10,
          step: 'Preparing import...',
          message: 'Validating files'
        });
        
        // Create FormData for multipart upload
        const formData = new FormData();
        
        // Add files
        importFiles.value.forEach(file => {
          formData.append('files', file);
        });
        
        // Add configuration as JSON string
        formData.append('config', JSON.stringify(importConfig));
        
        updateProgressDisplay({
          value: 30,
          step: 'Uploading files...',
          message: 'Sending files to server'
        });
        
        // Call the real import API
        const response = await fetch('/api/v1/import', {
          method: 'POST',
          credentials: 'same-origin',
          body: formData
          // Do not set Content-Type header manually for FormData
        });
        
        updateProgressDisplay({
          value: 70,
          step: 'Processing import...',
          message: 'Server is processing files'
        });
        
        if (!response.ok) {
          throw new Error(`Import failed: ${response.status}`);
        }
        
        const result = await response.json();
        
        updateProgressDisplay({
          value: 100,
          step: 'Import completed',
          message: `Processed ${result.processed_files} of ${result.total_files} files`
        });
        
        showToastMessage(`Import completed: ${result.processed_files} files processed`, 'success');
        importFiles.value = [];
        importPreview.value = [];
        
      } catch (error) {
        showToastMessage(`Import failed: ${error.message}`, 'error');
      } finally {
        isImporting.value = false;
        showProgress.value = false;
      }
    };
    
    // Backup functions
    const loadBackupHistory = async () => {
      try {
        const response = await fetch('/api/v1/backups/history', {
          credentials: 'same-origin'
        });
        
        if (response.ok) {
          backupHistory.value = await response.json();
        }
      } catch (error) {
        console.error('Failed to load backup history:', error);
      }
    };
    
    const createFullBackup = async () => {
      try {
        const response = await fetch('/api/v1/backup/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({ backup_type: 'full' })
        });
        
        if (response.ok) {
          const result = await response.json();
          showToastMessage(`Full backup initiated: ${result.backup_id}`, 'success');
          await loadBackupHistory(); // Refresh history
        } else {
          throw new Error(`Backup failed: ${response.status}`);
        }
      } catch (error) {
        showToastMessage(`Backup failed: ${error.message}`, 'error');
      }
    };
    
    const createQuickBackup = async () => {
      try {
        const response = await fetch('/api/v1/backup/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({ backup_type: 'quick' })
        });
        
        if (response.ok) {
          const result = await response.json();
          showToastMessage(`Quick backup initiated: ${result.backup_id}`, 'success');
          await loadBackupHistory(); // Refresh history
        } else {
          throw new Error(`Backup failed: ${response.status}`);
        }
      } catch (error) {
        showToastMessage(`Backup failed: ${error.message}`, 'error');
      }
    };
    
    const scheduleBackup = () => {
      showToastMessage('Schedule backup functionality coming soon', 'info');
    };
    
    const downloadBackup = (backupId) => {
      showToastMessage(`Download backup ${backupId} functionality coming soon`, 'info');
    };
    
    const restoreBackup = (backupId) => {
      showToastMessage(`Restore backup ${backupId} functionality coming soon`, 'info');
    };
    
    const deleteBackup = (backupId) => {
      showToastMessage(`Delete backup ${backupId} functionality coming soon`, 'info');
    };
    
    // Migration functions
    const startVersionMigration = () => {
      showToastMessage('Version migration functionality coming soon', 'info');
    };
    
    const startPlatformMigration = () => {
      showToastMessage('Platform migration functionality coming soon', 'info');
    };
    
    // General functions
    const viewHistory = () => {
      activeTab.value = 'backup';
    };
    
    const cancelOperation = () => {
      isExporting.value = false;
      isImporting.value = false;
      isMigrating.value = false;
      showProgress.value = false;
      showToastMessage('Operation cancelled', 'warning');
    };
    
    // Initialize component
    onMounted(async () => {
      await updateEstimates();
      await loadBackupHistory();
      
      // Set up auto-hide for toast messages
      watch(showToast, (value) => {
        if (value) {
          setTimeout(() => {
            showToast.value = false;
          }, 3000);
        }
      });
      
      isInitialized.value = true;
    });
    
    return {
      // State
      isInitialized,
      activeTab,
      isExporting,
      isImporting,
      isMigrating,
      
      // Progress
      showProgress,
      progressValue,
      currentStep,
      progressMessages,
      progressTitle,
      
      // Toast
      showToast,
      toastMessage,
      toastType,
      toastClasses,
      
      // Configuration
      exportConfig,
      importConfig,
      migrationConfig,
      
      // Import state
      importFiles,
      importPreview,
      hasEncryptedFiles,
      
      // Backup state
      backupHistory,
      
      // Computed
      canExport,
      estimatedSize,
      estimatedTime,
      
      // Utility functions
      formatFileSize,
      formatDate,
      getStatusClasses,
      
      // Export functions
      validateExport,
      previewExport,
      startExport,
      quickExportAll,
      
      // Import functions
      handleFileDrop,
      handleFileSelect,
      removeFile,
      handleDragOver,
      handleDragLeave,
      analyzeFiles,
      validateImport,
      startImport,
      
      // Backup functions
      createFullBackup,
      createQuickBackup,
      scheduleBackup,
      downloadBackup,
      restoreBackup,
      deleteBackup,
      
      // Migration functions
      startVersionMigration,
      startPlatformMigration,
      
      // General functions
      viewHistory,
      cancelOperation
    };
  }
};
</script>