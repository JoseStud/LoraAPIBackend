/**
 * Performance Analytics Composable
 * 
 * Manages data fetching and state for performance analytics
 * following the useApi pattern from existing Vue islands.
 */

import { ref, computed } from 'vue';

export function usePerformanceAnalytics() {
  // Reactive state
  const timeRange = ref('24h');
  const autoRefresh = ref(false);
  const refreshInterval = ref(null);
  const isLoading = ref(false);
  
  // Data state
  const kpis = ref({
    total_generations: 0,
    generation_growth: 0,
    avg_generation_time: 0,
    time_improvement: 0,
    success_rate: 0,
    total_failed: 0,
    active_loras: 0,
    total_loras: 0
  });
  
  const topLoras = ref([]);
  const errorAnalysis = ref([]);
  const performanceInsights = ref([]);
  const chartData = ref({
    generationVolume: [],
    performance: [],
    loraUsage: [],
    resourceUsage: []
  });

  // Base URL for API calls
  const baseUrl = '';

  // Methods
  async function loadKPIs() {
    try {
      const response = await fetch('/api/v1/dashboard/stats', { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });
      
      if (!response.ok) throw new Error('Failed to load KPIs');
      const data = await response.json();
      const stats = data?.stats || {};
      kpis.value = {
        total_generations: 0,
        generation_growth: 0,
        avg_generation_time: 0,
        time_improvement: 0,
        success_rate: 0,
        total_failed: 0,
        active_loras: stats.active_loras || 0,
        total_loras: stats.total_loras || 0
      };
    } catch (error) {
      console.error('Error loading KPIs:', error);
      // Use fallback mock data for development only
      if (import.meta.env.DEV) {
        kpis.value = {
          total_generations: 1247,
          generation_growth: 12.5,
          avg_generation_time: 45.3,
          time_improvement: 8.2,
          success_rate: 94.3,
          total_failed: 71,
          active_loras: 34,
          total_loras: 127
        };
      }
    }
  }

  async function loadTopLoras() {
    try {
      const response = await fetch('/api/v1/adapters?per_page=10', { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });
      
      if (!response.ok) throw new Error('Failed to load top LoRAs');
      const data = await response.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      topLoras.value = items.map(i => ({ id: i.id, name: i.name, version: i.version, usage_count: 0, success_rate: 0, avg_time: 0 }));
    } catch (error) {
      console.error('Error loading top LoRAs:', error);
      // Use fallback mock data for development only
      if (import.meta.env.DEV) {
        topLoras.value = [
          {
            id: 1,
            name: "Anime Style v2.1",
            version: "v2.1",
            usage_count: 342,
            success_rate: 96.8,
            avg_time: 42.3
          },
          {
            id: 2,
            name: "Realistic Portrait",
            version: "v1.5",
            usage_count: 289,
            success_rate: 94.2,
            avg_time: 38.7
          },
          {
            id: 3,
            name: "Fantasy Art",
            version: "v3.0",
            usage_count: 267,
            success_rate: 92.1,
            avg_time: 51.2
          },
          {
            id: 4,
            name: "Cyberpunk Style",
            version: "v1.8",
            usage_count: 198,
            success_rate: 89.4,
            avg_time: 47.9
          },
          {
            id: 5,
            name: "Nature Photography",
            version: "v2.0",
            usage_count: 156,
            success_rate: 97.1,
            avg_time: 35.8
          }
        ];
      }
    }
  }

  async function loadErrorAnalysis() {
    // No analytics endpoint; use empty list or mock in dev
    errorAnalysis.value = [];
    if (import.meta.env.DEV) {
      errorAnalysis.value = [
        { type: 'GPU Memory Exhausted', count: 28, percentage: 39.4, description: 'Insufficient GPU memory' },
      ];
    }
  }

  async function loadPerformanceInsights() {
    performanceInsights.value = [];
    if (import.meta.env.DEV) {
      performanceInsights.value = [
        { id: 1, title: 'High GPU Memory Usage', description: 'GPU memory utilization averaging 87%.', severity: 'medium', recommendation: 'enable_memory_optimization' },
      ];
    }
  }

  async function loadChartData() {
    chartData.value = { generationVolume: [], performance: [], loraUsage: [], resourceUsage: [] };
    if (import.meta.env.DEV) {
      generateMockChartData();
    }
  }

  function generateMockChartData() {
    const hours = 24;
    const now = new Date();
    
    // Generation volume data
    chartData.value.generationVolume = Array.from({ length: hours }, (_, i) => {
      const time = new Date(now.getTime() - (hours - i - 1) * 60 * 60 * 1000);
      return {
        timestamp: time.toISOString(),
        count: Math.floor(Math.random() * 50) + 10
      };
    });
    
    // Performance data
    chartData.value.performance = Array.from({ length: hours }, (_, i) => {
      const time = new Date(now.getTime() - (hours - i - 1) * 60 * 60 * 1000);
      return {
        timestamp: time.toISOString(),
        avg_time: Math.random() * 30 + 30,
        success_rate: Math.random() * 10 + 90
      };
    });
    
    // LoRA usage data
    chartData.value.loraUsage = topLoras.value.slice(0, 10).map(lora => ({
      name: lora.name,
      usage_count: lora.usage_count
    }));
    
    // Resource usage data
    chartData.value.resourceUsage = Array.from({ length: hours }, (_, i) => {
      const time = new Date(now.getTime() - (hours - i - 1) * 60 * 60 * 1000);
      return {
        timestamp: time.toISOString(),
        cpu_percent: Math.random() * 40 + 30,
        memory_percent: Math.random() * 30 + 50,
        gpu_percent: Math.random() * 50 + 40
      };
    });
  }

  async function loadAllData() {
    // Load all data concurrently
    await Promise.all([
      loadKPIs(),
      loadTopLoras(),
      loadErrorAnalysis(),
      loadPerformanceInsights(),
      loadChartData()
    ]);
  }

  function toggleAutoRefresh() {
    if (autoRefresh.value) {
      refreshInterval.value = setInterval(() => {
        loadAllData();
      }, 30000); // Refresh every 30 seconds
    } else {
      if (refreshInterval.value) {
        clearInterval(refreshInterval.value);
        refreshInterval.value = null;
      }
    }
  }

  // Utility functions
  function formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingMinutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${remainingMinutes}m`;
    }
  }

  // Cleanup
  function cleanup() {
    if (refreshInterval.value) {
      clearInterval(refreshInterval.value);
      refreshInterval.value = null;
    }
  }

  return {
    // State
    timeRange,
    autoRefresh,
    kpis,
    topLoras,
    errorAnalysis,
    performanceInsights,
    chartData,
    
    // Computed
    isLoading,
    
    // Methods
    loadAllData,
    toggleAutoRefresh,
    formatDuration,
    cleanup
  };
}
