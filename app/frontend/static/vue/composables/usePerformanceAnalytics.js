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
  const baseUrl = window?.BACKEND_URL || '';

  // Methods
  async function loadKPIs() {
    try {
      const url = `${baseUrl}/analytics/kpis?timeRange=${timeRange.value}`;
      const response = await fetch(url, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });
      
      if (!response.ok) throw new Error('Failed to load KPIs');
      const data = await response.json();
      kpis.value = data;
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
      const url = `${baseUrl}/analytics/top-loras?timeRange=${timeRange.value}`;
      const response = await fetch(url, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });
      
      if (!response.ok) throw new Error('Failed to load top LoRAs');
      const data = await response.json();
      topLoras.value = data;
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
    try {
      const url = `${baseUrl}/analytics/errors?timeRange=${timeRange.value}`;
      const response = await fetch(url, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });
      
      if (!response.ok) throw new Error('Failed to load error analysis');
      const data = await response.json();
      errorAnalysis.value = data;
    } catch (error) {
      console.error('Error loading error analysis:', error);
      // Use fallback mock data for development only
      if (import.meta.env.DEV) {
        errorAnalysis.value = [
          {
            type: "GPU Memory Exhausted",
            count: 28,
            percentage: 39.4,
            description: "Generation failed due to insufficient GPU memory. Consider reducing batch size or image resolution."
          },
          {
            type: "Network Timeout",
            count: 15,
            percentage: 21.1,
            description: "Request timed out waiting for generation completion. Check network connectivity and worker status."
          },
          {
            type: "Invalid LoRA Combination",
            count: 12,
            percentage: 16.9,
            description: "Incompatible LoRA models used together. Review LoRA compatibility matrix."
          },
          {
            type: "Prompt Validation Error",
            count: 8,
            percentage: 11.3,
            description: "Prompt contains invalid or unsafe content. Review content filtering policies."
          },
          {
            type: "Worker Crash",
            count: 8,
            percentage: 11.3,
            description: "Generation worker crashed during processing. Check worker logs for details."
          }
        ];
      }
    }
  }

  async function loadPerformanceInsights() {
    try {
      const url = `${baseUrl}/analytics/insights?timeRange=${timeRange.value}`;
      const response = await fetch(url, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });
      
      if (!response.ok) throw new Error('Failed to load performance insights');
      const data = await response.json();
      performanceInsights.value = data;
    } catch (error) {
      console.error('Error loading performance insights:', error);
      // Use fallback mock data for development only
      if (import.meta.env.DEV) {
        performanceInsights.value = [
          {
            id: 1,
            title: "High GPU Memory Usage",
            description: "GPU memory utilization averaging 87%. Consider optimizing memory management or adding additional GPU capacity.",
            severity: "medium",
            recommendation: "enable_memory_optimization"
          },
          {
            id: 2,
            title: "Queue Backup During Peak Hours",
            description: "Generation queue backing up 14:00-18:00 daily. Consider auto-scaling workers during peak periods.",
            severity: "high",
            recommendation: "configure_auto_scaling"
          },
          {
            id: 3,
            title: "Unused LoRAs Taking Space",
            description: "42 LoRAs haven't been used in 30+ days. Archive unused models to free up storage space.",
            severity: "low",
            recommendation: "archive_unused_loras"
          }
        ];
      }
    }
  }

  async function loadChartData() {
    try {
      const url = `${baseUrl}/analytics/charts?timeRange=${timeRange.value}`;
      const response = await fetch(url, { 
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        credentials: 'same-origin'
      });
      
      if (!response.ok) throw new Error('Failed to load chart data');
      const data = await response.json();
      chartData.value = data;
    } catch (error) {
      console.error('Error loading chart data:', error);
      // Generate fallback mock data for development only
      if (import.meta.env.DEV) {
        generateMockChartData();
      }
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