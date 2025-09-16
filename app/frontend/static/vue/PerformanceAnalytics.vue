<template>
  <div class="analytics-container">
    <!-- Loading state -->
    <div v-if="!isInitialized" class="py-12 text-center text-gray-500">
      <svg class="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25"></circle>
        <path d="M4 12a8 8 0 018-8" stroke-width="4" class="opacity-75"></path>
      </svg>
      <div>Loading analytics...</div>
    </div>

    <!-- Main analytics content -->
    <div v-show="isInitialized">
      <!-- Page Header -->
      <div class="page-header">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="page-title">Performance Analytics</h1>
            <p class="page-subtitle">Monitor and analyze system performance metrics</p>
          </div>
          <div class="header-actions">
            <div class="flex items-center space-x-3">
              <!-- Time Range Selector -->
              <select v-model="timeRange" @change="handleTimeRangeChange" class="form-input text-sm">
                <option value="1h">Last Hour</option>
                <option value="6h">Last 6 Hours</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
              
              <!-- Auto-refresh Toggle -->
              <label class="flex items-center text-sm">
                <input 
                  type="checkbox" 
                  v-model="autoRefresh" 
                  @change="handleAutoRefreshToggle"
                  class="form-checkbox mr-2"
                >
                Auto-refresh
              </label>
              
              <!-- Refresh Button -->
              <button 
                @click="refreshData" 
                class="btn btn-secondary btn-sm"
                :disabled="isLoading"
              >
                <svg class="w-4 h-4 mr-2" :class="{ 'animate-spin': isLoading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Key Performance Indicators -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <!-- Total Generations -->
        <div class="card">
          <div class="card-body text-center">
            <div class="flex justify-center mb-2">
              <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
            </div>
            <div class="text-2xl font-bold text-blue-600">{{ kpis.total_generations }}</div>
            <div class="text-sm text-gray-600">Total Generations</div>
            <div class="text-xs mt-1" :class="kpis.generation_growth >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ kpis.generation_growth >= 0 ? '+' : '' }}{{ kpis.generation_growth }}% vs last period
            </div>
          </div>
        </div>
        
        <!-- Average Generation Time -->
        <div class="card">
          <div class="card-body text-center">
            <div class="flex justify-center mb-2">
              <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div class="text-2xl font-bold text-green-600">{{ formatDuration(kpis.avg_generation_time) }}</div>
            <div class="text-sm text-gray-600">Average Generation Time</div>
            <div class="text-xs mt-1" :class="kpis.time_improvement >= 0 ? 'text-green-600' : 'text-red-600'">
              {{ kpis.time_improvement >= 0 ? '-' : '+' }}{{ Math.abs(kpis.time_improvement) }}% vs last period
            </div>
          </div>
        </div>
        
        <!-- Success Rate -->
        <div class="card">
          <div class="card-body text-center">
            <div class="flex justify-center mb-2">
              <svg class="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div class="text-2xl font-bold text-purple-600">{{ kpis.success_rate }}%</div>
            <div class="text-sm text-gray-600">Success Rate</div>
            <div class="text-xs mt-1">
              <span class="text-gray-500">{{ kpis.total_failed }}</span> failures
            </div>
          </div>
        </div>
        
        <!-- Active LoRAs -->
        <div class="card">
          <div class="card-body text-center">
            <div class="flex justify-center mb-2">
              <svg class="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
              </svg>
            </div>
            <div class="text-2xl font-bold text-orange-600">{{ kpis.active_loras }}</div>
            <div class="text-sm text-gray-600">Active LoRAs</div>
            <div class="text-xs mt-1">
              <span class="text-gray-500">{{ kpis.total_loras }}</span> total
            </div>
          </div>
        </div>
      </div>

      <!-- Charts Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- Generation Volume Over Time -->
        <div class="card">
          <div class="card-header">
            <h3 class="text-lg font-semibold">Generation Volume</h3>
            <p class="text-sm text-gray-600">Number of generations over time</p>
          </div>
          <div class="card-body">
            <canvas ref="generationVolumeChart" width="400" height="200"></canvas>
          </div>
        </div>
        
        <!-- Generation Performance -->
        <div class="card">
          <div class="card-header">
            <h3 class="text-lg font-semibold">Generation Performance</h3>
            <p class="text-sm text-gray-600">Average generation time trends</p>
          </div>
          <div class="card-body">
            <canvas ref="performanceChart" width="400" height="200"></canvas>
          </div>
        </div>
        
        <!-- LoRA Usage Distribution -->
        <div class="card">
          <div class="card-header">
            <h3 class="text-lg font-semibold">LoRA Usage Distribution</h3>
            <p class="text-sm text-gray-600">Most frequently used LoRAs</p>
          </div>
          <div class="card-body">
            <canvas ref="loraUsageChart" width="400" height="200"></canvas>
          </div>
        </div>
        
        <!-- System Resource Usage -->
        <div class="card">
          <div class="card-header">
            <h3 class="text-lg font-semibold">System Resources</h3>
            <p class="text-sm text-gray-600">CPU, Memory, and GPU utilization</p>
          </div>
          <div class="card-body">
            <canvas ref="resourceUsageChart" width="400" height="200"></canvas>
          </div>
        </div>
      </div>

      <!-- Detailed Analytics Tables -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- Top Performing LoRAs -->
        <div class="card">
          <div class="card-header">
            <h3 class="text-lg font-semibold">Top Performing LoRAs</h3>
            <p class="text-sm text-gray-600">Most used LoRAs in selected time period</p>
          </div>
          <div class="card-body">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LoRA</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage Count</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Success Rate</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Time</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="lora in topLoras" :key="lora.id">
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="text-sm font-medium text-gray-900">{{ lora.name }}</div>
                      <div class="text-sm text-gray-500">{{ lora.version }}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ lora.usage_count }}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                      <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full" :class="getSuccessRateClass(lora.success_rate)">
                        {{ lora.success_rate }}%
                      </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ formatDuration(lora.avg_time) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <!-- Error Analysis -->
        <div class="card">
          <div class="card-header">
            <h3 class="text-lg font-semibold">Error Analysis</h3>
            <p class="text-sm text-gray-600">Common errors and failure patterns</p>
          </div>
          <div class="card-body">
            <div class="space-y-4" v-if="errorAnalysis.length > 0">
              <div v-for="error in errorAnalysis" :key="error.type" class="border-l-4 border-red-400 bg-red-50 p-4">
                <div class="flex">
                  <div class="flex-shrink-0">
                    <svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                  </div>
                  <div class="ml-3">
                    <h4 class="text-sm font-medium text-red-800">{{ error.type }}</h4>
                    <div class="mt-1 text-sm text-red-700">
                      <p>{{ error.count }} occurrences ({{ error.percentage }}% of failures)</p>
                      <p class="text-xs mt-1">{{ error.description }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div v-else class="text-center py-8 text-gray-500">
              <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <p>No errors in selected time period</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Insights -->
      <div class="card mb-8">
        <div class="card-header">
          <h3 class="text-lg font-semibold">Performance Insights</h3>
          <p class="text-sm text-gray-600">AI-powered recommendations for system optimization</p>
        </div>
        <div class="card-body">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" v-if="performanceInsights.length > 0">
            <div v-for="insight in performanceInsights" :key="insight.id" class="border rounded-lg p-4" :class="getInsightClass(insight.severity)">
              <div class="flex items-start">
                <div class="flex-shrink-0">
                  <svg class="w-5 h-5" :class="getInsightIconClass(insight.severity)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <div class="ml-3">
                  <h4 class="text-sm font-medium" :class="getInsightTextClass(insight.severity)">{{ insight.title }}</h4>
                  <p class="mt-1 text-sm" :class="getInsightDescClass(insight.severity)">{{ insight.description }}</p>
                  <div class="mt-2">
                    <button class="text-xs font-medium hover:underline" :class="getInsightTextClass(insight.severity)" @click="applyRecommendation(insight)">
                      Apply Recommendation →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div v-else class="text-center py-8 text-gray-500">
            <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
            <p>System is performing optimally!</p>
            <p class="text-sm">No performance recommendations at this time.</p>
          </div>
        </div>
      </div>

      <!-- Export Options -->
      <div class="card">
        <div class="card-header">
          <h3 class="text-lg font-semibold">Export Analytics</h3>
          <p class="text-sm text-gray-600">Download performance data for external analysis</p>
        </div>
        <div class="card-body">
          <div class="flex flex-wrap gap-3">
            <button @click="exportData('csv')" class="btn btn-secondary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Export CSV
            </button>
            <button @click="exportData('json')" class="btn btn-secondary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Export JSON
            </button>
            <button @click="exportData('pdf')" class="btn btn-secondary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Export PDF Report
            </button>
            <button @click="scheduleReport()" class="btn btn-primary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
              </svg>
              Schedule Report
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading Overlay -->
    <div v-if="isLoading" class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 flex items-center space-x-4">
        <svg class="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
        </svg>
        <span>Loading analytics data...</span>
      </div>
    </div>

    <!-- Toast Notifications -->
    <div v-if="showToast" class="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg" :class="getToastClass()">
      <span>{{ toastMessage }}</span>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { usePerformanceAnalytics } from './composables/usePerformanceAnalytics.js';

export default {
  name: 'PerformanceAnalytics',
  setup() {
    // Use the performance analytics composable
    const {
      timeRange,
      autoRefresh,
      kpis,
      topLoras,
      errorAnalysis,
      performanceInsights,
      chartData,
      isLoading,
      loadAllData,
      toggleAutoRefresh,
      formatDuration,
      cleanup
    } = usePerformanceAnalytics();

    // Component state
    const isInitialized = ref(false);
    const charts = ref({});
    const showToast = ref(false);
    const toastMessage = ref('');
    const toastType = ref('success');

    // Template refs for chart canvases
    const generationVolumeChart = ref(null);
    const performanceChart = ref(null);
    const loraUsageChart = ref(null);
    const resourceUsageChart = ref(null);

    // Initialize component
    async function init() {
      try {
        await loadAllData();
        await nextTick(); // Wait for DOM to update
        initializeCharts();
        isInitialized.value = true;
      } catch (error) {
        console.error('Failed to initialize performance analytics:', error);
        showToastMessage('Failed to load analytics data', 'error');
      }
    }

    // Chart initialization using global Chart.js
    function initializeCharts() {
      if (typeof window.Chart === 'undefined') {
        console.warn('Chart.js not available');
        return;
      }

      try {
        // Generation Volume Chart
        if (generationVolumeChart.value) {
          charts.value.volume = new window.Chart(generationVolumeChart.value, {
            type: 'line',
            data: {
              labels: [],
              datasets: [{
                label: 'Generations',
                data: [],
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.1,
                fill: true
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                }
              },
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });
        }

        // Performance Chart
        if (performanceChart.value) {
          charts.value.performance = new window.Chart(performanceChart.value, {
            type: 'line',
            data: {
              labels: [],
              datasets: [
                {
                  label: 'Avg Time (s)',
                  data: [],
                  borderColor: 'rgb(16, 185, 129)',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  tension: 0.1,
                  yAxisID: 'y'
                },
                {
                  label: 'Success Rate (%)',
                  data: [],
                  borderColor: 'rgb(139, 92, 246)',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  tension: 0.1,
                  yAxisID: 'y1'
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  type: 'linear',
                  display: true,
                  position: 'left'
                },
                y1: {
                  type: 'linear',
                  display: true,
                  position: 'right',
                  grid: {
                    drawOnChartArea: false
                  }
                }
              }
            }
          });
        }

        // LoRA Usage Chart
        if (loraUsageChart.value) {
          charts.value.loraUsage = new window.Chart(loraUsageChart.value, {
            type: 'doughnut',
            data: {
              labels: [],
              datasets: [{
                data: [],
                backgroundColor: [
                  'rgb(59, 130, 246)',
                  'rgb(16, 185, 129)',
                  'rgb(139, 92, 246)',
                  'rgb(245, 158, 11)',
                  'rgb(239, 68, 68)',
                  'rgb(156, 163, 175)',
                  'rgb(34, 197, 94)',
                  'rgb(168, 85, 247)',
                  'rgb(251, 146, 60)',
                  'rgb(14, 165, 233)'
                ]
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: 'right'
                }
              }
            }
          });
        }

        // Resource Usage Chart
        if (resourceUsageChart.value) {
          charts.value.resourceUsage = new window.Chart(resourceUsageChart.value, {
            type: 'line',
            data: {
              labels: [],
              datasets: [
                {
                  label: 'CPU %',
                  data: [],
                  borderColor: 'rgb(59, 130, 246)',
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  tension: 0.1
                },
                {
                  label: 'Memory %',
                  data: [],
                  borderColor: 'rgb(16, 185, 129)',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  tension: 0.1
                },
                {
                  label: 'GPU %',
                  data: [],
                  borderColor: 'rgb(239, 68, 68)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  tension: 0.1
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100
                }
              }
            }
          });
        }

        // Update charts with current data
        updateCharts();
      } catch (error) {
        console.error('Error initializing charts:', error);
      }
    }

    // Update charts with data
    function updateCharts() {
      // Update generation volume chart
      if (charts.value.volume && chartData.value.generationVolume) {
        const labels = chartData.value.generationVolume.map(item => 
          new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        const data = chartData.value.generationVolume.map(item => item.count);
        
        charts.value.volume.data.labels = labels;
        charts.value.volume.data.datasets[0].data = data;
        charts.value.volume.update();
      }

      // Update performance chart
      if (charts.value.performance && chartData.value.performance) {
        const labels = chartData.value.performance.map(item => 
          new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        const timeData = chartData.value.performance.map(item => item.avg_time);
        const successData = chartData.value.performance.map(item => item.success_rate);
        
        charts.value.performance.data.labels = labels;
        if (charts.value.performance?.data?.datasets?.[0]) {
          charts.value.performance.data.datasets[0].data = timeData;
        }
        if (charts.value.performance?.data?.datasets?.[1]) {
          charts.value.performance.data.datasets[1].data = successData;
        }
        charts.value.performance.update();
      }

      // Update LoRA usage chart
      if (charts.value.loraUsage && chartData.value.loraUsage) {
        const labels = chartData.value.loraUsage.map(item => item.name);
        const data = chartData.value.loraUsage.map(item => item.usage_count);
        
        charts.value.loraUsage.data.labels = labels;
        charts.value.loraUsage.data.datasets[0].data = data;
        charts.value.loraUsage.update();
      }

      // Update resource usage chart
      if (charts.value.resourceUsage && chartData.value.resourceUsage) {
        const labels = chartData.value.resourceUsage.map(item => 
          new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        const cpuData = chartData.value.resourceUsage.map(item => item.cpu_percent);
        const memoryData = chartData.value.resourceUsage.map(item => item.memory_percent);
        const gpuData = chartData.value.resourceUsage.map(item => item.gpu_percent);
        
        charts.value.resourceUsage.data.labels = labels;
        if (charts.value.resourceUsage?.data?.datasets?.[0]) {
          charts.value.resourceUsage.data.datasets[0].data = cpuData;
        }
        if (charts.value.resourceUsage?.data?.datasets?.[1]) {
          charts.value.resourceUsage.data.datasets[1].data = memoryData;
        }
        if (charts.value.resourceUsage?.data?.datasets?.[2]) {
          charts.value.resourceUsage.data.datasets[2].data = gpuData;
        }
        charts.value.resourceUsage.update();
      }
    }

    // Event handlers
    async function handleTimeRangeChange() {
      await loadAllData();
      updateCharts();
    }

    function handleAutoRefreshToggle() {
      toggleAutoRefresh();
    }

    async function refreshData() {
      await loadAllData();
      updateCharts();
      showToastMessage('Data refreshed successfully');
    }

    // Export functions
    async function exportData(format) {
      try {
        const baseUrl = window?.BACKEND_URL || '';
        const response = await fetch(`${baseUrl}/analytics/export?format=${format}&timeRange=${timeRange.value}`, {
          credentials: 'same-origin'
        });
        
        if (!response.ok) throw new Error('Failed to export data');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${timeRange.value}-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToastMessage(`${format.toUpperCase()} export completed successfully`);
      } catch (error) {
        console.error('Error exporting data:', error);
        showToastMessage('Failed to export data', 'error');
      }
    }

    function scheduleReport() {
      showToastMessage('Report scheduling feature coming soon', 'info');
    }

    async function applyRecommendation(insight) {
      try {
        const baseUrl = window?.BACKEND_URL || '';
        const response = await fetch(`${baseUrl}/analytics/apply-recommendation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({ 
            recommendation: insight.recommendation,
            insight_id: insight.id 
          })
        });
        
        if (!response.ok) throw new Error('Failed to apply recommendation');
        
        showToastMessage('Recommendation applied successfully');
        await loadAllData();
      } catch (error) {
        console.error('Error applying recommendation:', error);
        showToastMessage('Failed to apply recommendation', 'error');
      }
    }

    // Utility functions
    function getSuccessRateClass(rate) {
      if (rate >= 95) return 'bg-green-100 text-green-800';
      if (rate >= 90) return 'bg-yellow-100 text-yellow-800';
      return 'bg-red-100 text-red-800';
    }

    function getInsightClass(severity) {
      switch (severity) {
        case 'high': return 'border-red-200 bg-red-50';
        case 'medium': return 'border-yellow-200 bg-yellow-50';
        default: return 'border-blue-200 bg-blue-50';
      }
    }

    function getInsightIconClass(severity) {
      switch (severity) {
        case 'high': return 'text-red-500';
        case 'medium': return 'text-yellow-500';
        default: return 'text-blue-500';
      }
    }

    function getInsightTextClass(severity) {
      switch (severity) {
        case 'high': return 'text-red-800';
        case 'medium': return 'text-yellow-800';
        default: return 'text-blue-800';
      }
    }

    function getInsightDescClass(severity) {
      switch (severity) {
        case 'high': return 'text-red-700';
        case 'medium': return 'text-yellow-700';
        default: return 'text-blue-700';
      }
    }

    function getToastClass() {
      switch (toastType.value) {
        case 'error': return 'bg-red-500 text-white';
        case 'info': return 'bg-blue-500 text-white';
        default: return 'bg-green-500 text-white';
      }
    }

    function showToastMessage(message, type = 'success') {
      toastMessage.value = message;
      toastType.value = type;
      showToast.value = true;
      
      setTimeout(() => {
        showToast.value = false;
      }, 4000);
    }

    // Lifecycle
    onMounted(() => {
      init();
    });

    onUnmounted(() => {
      cleanup();
      // Destroy charts
      Object.values(charts.value).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
          chart.destroy();
        }
      });
    });

    return {
      // State
      isInitialized,
      timeRange,
      autoRefresh,
      kpis,
      topLoras,
      errorAnalysis,
      performanceInsights,
      chartData,
      isLoading,
      showToast,
      toastMessage,
      toastType,
      
      // Template refs
      generationVolumeChart,
      performanceChart,
      loraUsageChart,
      resourceUsageChart,
      
      // Methods
      handleTimeRangeChange,
      handleAutoRefreshToggle,
      refreshData,
      exportData,
      scheduleReport,
      applyRecommendation,
      formatDuration,
      getSuccessRateClass,
      getInsightClass,
      getInsightIconClass,
      getInsightTextClass,
      getInsightDescClass,
      getToastClass
    };
  }
};
</script>