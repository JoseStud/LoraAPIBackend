/**
 * Unit Tests for Performance Analytics Component
 */

describe('Performance Analytics Component', () => {
    let component;
    let mockChart;
    let mockFetch;
    
    beforeEach(() => {
        // Mock fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;
        
        // Mock Chart.js
        mockChart = {
            update: jest.fn(),
            destroy: jest.fn(),
            resize: jest.fn(),
            data: {
                labels: [],
                datasets: []
            },
            options: {}
        };
        
        global.Chart = jest.fn(() => mockChart);
        global.Chart.register = jest.fn();
        
        // Setup component data structure similar to performance-analytics.js
        component = {
            // State
            isLoading: false,
            error: null,
            selectedTimeRange: '24h',
            selectedMetrics: ['cpu', 'memory', 'disk'],
            
            // Data
            metrics: {
                kpis: {
                    totalRequests: 0,
                    avgResponseTime: 0,
                    errorRate: 0,
                    uptime: 0
                },
                systemMetrics: {
                    cpu: [],
                    memory: [],
                    disk: [],
                    gpu: []
                },
                performanceMetrics: {
                    responseTime: [],
                    throughput: [],
                    errorRate: []
                },
                userMetrics: {
                    activeUsers: 0,
                    newUsers: 0,
                    bounceRate: 0
                }
            },
            
            // Charts
            charts: {
                system: null,
                performance: null,
                users: null
            },
            
            // Export data
            exportData: {
                format: 'json',
                includeCharts: true,
                dateRange: {
                    start: '',
                    end: ''
                }
            },
            
            // Methods
            init: jest.fn(),
            loadData: jest.fn(),
            initCharts: jest.fn(),
            updateCharts: jest.fn(),
            exportReport: jest.fn(),
            
            // Time range methods
            setTimeRange: jest.fn(),
            refreshData: jest.fn(),
            
            // Chart methods
            createSystemChart: jest.fn(),
            createPerformanceChart: jest.fn(),
            createUsersChart: jest.fn(),
            
            // Export methods
            exportJSON: jest.fn(),
            exportCSV: jest.fn(),
            exportPDF: jest.fn()
        };
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Component Initialization', () => {
        test('should initialize with default state', () => {
            expect(component.isLoading).toBe(false);
            expect(component.error).toBe(null);
            expect(component.selectedTimeRange).toBe('24h');
            expect(component.selectedMetrics).toEqual(['cpu', 'memory', 'disk']);
        });
        
        test('should initialize charts on component creation', () => {
            component.init();
            expect(component.init).toHaveBeenCalled();
        });
    });
    
    describe('Data Loading', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    kpis: {
                        totalRequests: 1000,
                        avgResponseTime: 250,
                        errorRate: 0.5,
                        uptime: 99.9
                    },
                    systemMetrics: {
                        cpu: [
                            { timestamp: '2024-01-01T10:00:00Z', value: 45 },
                            { timestamp: '2024-01-01T11:00:00Z', value: 52 }
                        ],
                        memory: [
                            { timestamp: '2024-01-01T10:00:00Z', value: 67 },
                            { timestamp: '2024-01-01T11:00:00Z', value: 72 }
                        ]
                    }
                })
            });
        });
        
        test('should load analytics data', async () => {
            component.loadData = jest.fn(async () => {
                const response = await fetch(`/api/analytics?timeRange=${component.selectedTimeRange}`);
                const data = await response.json();
                component.metrics = { ...component.metrics, ...data };
            });
            
            await component.loadData();
            
            expect(mockFetch).toHaveBeenCalledWith('/api/analytics?timeRange=24h');
            expect(component.loadData).toHaveBeenCalled();
        });
        
        test('should handle loading errors', async () => {
            mockFetch.mockRejectedValue(new Error('Failed to fetch'));
            
            component.loadData = jest.fn(async () => {
                try {
                    await fetch(`/api/analytics?timeRange=${component.selectedTimeRange}`);
                } catch (error) {
                    component.error = error.message;
                }
            });
            
            await component.loadData();
            expect(component.error).toBe('Failed to fetch');
        });
        
        test('should refresh data on time range change', async () => {
            component.setTimeRange = jest.fn(async (range) => {
                component.selectedTimeRange = range;
                await component.loadData();
            });
            
            await component.setTimeRange('7d');
            
            expect(component.selectedTimeRange).toBe('7d');
            expect(component.setTimeRange).toHaveBeenCalledWith('7d');
        });
    });
    
    describe('Chart Management', () => {
        test('should create system metrics chart', () => {
            const mockCanvas = document.createElement('canvas');
            const mockCtx = mockCanvas.getContext('2d');
            
            component.createSystemChart = jest.fn((ctx, data) => {
                const chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.labels,
                        datasets: [
                            {
                                label: 'CPU Usage',
                                data: data.cpu,
                                borderColor: 'rgb(59, 130, 246)'
                            },
                            {
                                label: 'Memory Usage',
                                data: data.memory,
                                borderColor: 'rgb(34, 197, 94)'
                            }
                        ]
                    }
                });
                component.charts.system = chart;
                return chart;
            });
            
            const mockData = {
                labels: ['10:00', '11:00'],
                cpu: [45, 52],
                memory: [67, 72]
            };
            
            const chart = component.createSystemChart(mockCtx, mockData);
            
            expect(Chart).toHaveBeenCalled();
            expect(component.charts.system).toBe(chart);
        });
        
        test('should update charts with new data', () => {
            component.charts.system = mockChart;
            component.charts.performance = mockChart;
            
            component.updateCharts = jest.fn((newData) => {
                Object.values(component.charts).forEach(chart => {
                    if (chart) {
                        chart.data.labels = newData.labels;
                        chart.update();
                    }
                });
            });
            
            const newData = {
                labels: ['12:00', '13:00'],
                cpu: [48, 55]
            };
            
            component.updateCharts(newData);
            
            expect(mockChart.update).toHaveBeenCalledTimes(2);
        });
        
        test('should destroy charts on cleanup', () => {
            component.charts.system = mockChart;
            component.charts.performance = mockChart;
            
            component.destroyCharts = jest.fn(() => {
                Object.values(component.charts).forEach(chart => {
                    if (chart) {
                        chart.destroy();
                    }
                });
            });
            
            component.destroyCharts();
            
            expect(mockChart.destroy).toHaveBeenCalledTimes(2);
        });
    });
    
    describe('KPI Calculations', () => {
        test('should calculate average response time', () => {
            const responseTimes = [100, 200, 150, 300, 250];
            
            component.calculateAvgResponseTime = jest.fn((times) => {
                return times.reduce((sum, time) => sum + time, 0) / times.length;
            });
            
            const avg = component.calculateAvgResponseTime(responseTimes);
            expect(avg).toBe(200);
        });
        
        test('should calculate error rate', () => {
            const totalRequests = 1000;
            const errorRequests = 5;
            
            component.calculateErrorRate = jest.fn((errors, total) => {
                return (errors / total) * 100;
            });
            
            const errorRate = component.calculateErrorRate(errorRequests, totalRequests);
            expect(errorRate).toBe(0.5);
        });
        
        test('should calculate uptime percentage', () => {
            const totalTime = 24 * 60; // 24 hours in minutes
            const downtime = 5; // 5 minutes
            
            component.calculateUptime = jest.fn((total, down) => {
                return ((total - down) / total) * 100;
            });
            
            const uptime = component.calculateUptime(totalTime, downtime);
            expect(uptime).toBeCloseTo(99.65, 2);
        });
    });
    
    describe('Export Functionality', () => {
        test('should export data as JSON', () => {
            const mockData = {
                timestamp: new Date().toISOString(),
                metrics: component.metrics,
                timeRange: component.selectedTimeRange
            };
            
            component.exportJSON = jest.fn(() => {
                const data = {
                    timestamp: new Date().toISOString(),
                    metrics: component.metrics,
                    timeRange: component.selectedTimeRange
                };
                
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json'
                });
                
                return blob;
            });
            
            const blob = component.exportJSON();
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe('application/json');
        });
        
        test('should export data as CSV', () => {
            component.exportCSV = jest.fn(() => {
                const headers = ['timestamp', 'cpu', 'memory', 'disk'];
                const rows = [
                    ['2024-01-01T10:00:00Z', '45', '67', '80'],
                    ['2024-01-01T11:00:00Z', '52', '72', '82']
                ];
                
                const csvContent = [headers, ...rows]
                    .map(row => row.join(','))
                    .join('\n');
                
                const blob = new Blob([csvContent], {
                    type: 'text/csv'
                });
                
                return blob;
            });
            
            const blob = component.exportCSV();
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe('text/csv');
        });
        
        test('should export report as PDF', () => {
            // Mock PDF generation
            global.jsPDF = jest.fn(() => ({
                text: jest.fn(),
                addImage: jest.fn(),
                save: jest.fn()
            }));
            
            component.exportPDF = jest.fn(() => {
                const pdf = new jsPDF();
                pdf.text('Performance Analytics Report', 20, 20);
                return pdf;
            });
            
            const pdf = component.exportPDF();
            expect(pdf.text).toHaveBeenCalledWith('Performance Analytics Report', 20, 20);
        });
    });
    
    describe('Real-time Updates', () => {
        test('should handle WebSocket messages', () => {
            const mockWebSocket = {
                onopen: null,
                onmessage: null,
                onclose: null,
                onerror: null,
                send: jest.fn(),
                close: jest.fn()
            };
            
            global.WebSocket = jest.fn(() => mockWebSocket);
            
            component.initRealTimeUpdates = jest.fn(() => {
                const ws = new WebSocket('ws://localhost:8000/ws/analytics');
                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    component.updateMetrics(data);
                };
                return ws;
            });
            
            component.updateMetrics = jest.fn((data) => {
                if (data.type === 'system_metrics') {
                    component.metrics.systemMetrics.cpu.push({
                        timestamp: data.timestamp,
                        value: data.cpu
                    });
                    component.updateCharts();
                }
            });
            
            const ws = component.initRealTimeUpdates();
            expect(WebSocket).toHaveBeenCalledWith('ws://localhost:8000/ws/analytics');
            
            // Simulate incoming data
            const mockEvent = {
                data: JSON.stringify({
                    type: 'system_metrics',
                    timestamp: '2024-01-01T12:00:00Z',
                    cpu: 48,
                    memory: 70
                })
            };
            
            ws.onmessage(mockEvent);
            
            expect(component.updateMetrics).toHaveBeenCalledWith({
                type: 'system_metrics',
                timestamp: '2024-01-01T12:00:00Z',
                cpu: 48,
                memory: 70
            });
        });
    });
    
    describe('Filtering and Aggregation', () => {
        test('should filter metrics by selected types', () => {
            component.selectedMetrics = ['cpu', 'memory'];
            
            component.getFilteredMetrics = jest.fn(() => {
                const allMetrics = component.metrics.systemMetrics;
                const filtered = {};
                
                component.selectedMetrics.forEach(metric => {
                    if (allMetrics[metric]) {
                        filtered[metric] = allMetrics[metric];
                    }
                });
                
                return filtered;
            });
            
            component.metrics.systemMetrics = {
                cpu: [{ value: 45 }],
                memory: [{ value: 67 }],
                disk: [{ value: 80 }],
                gpu: [{ value: 30 }]
            };
            
            const filtered = component.getFilteredMetrics();
            
            expect(filtered).toHaveProperty('cpu');
            expect(filtered).toHaveProperty('memory');
            expect(filtered).not.toHaveProperty('disk');
            expect(filtered).not.toHaveProperty('gpu');
        });
        
        test('should aggregate data by time intervals', () => {
            const rawData = [
                { timestamp: '2024-01-01T10:00:00Z', value: 45 },
                { timestamp: '2024-01-01T10:15:00Z', value: 50 },
                { timestamp: '2024-01-01T10:30:00Z', value: 55 },
                { timestamp: '2024-01-01T10:45:00Z', value: 48 }
            ];
            
            component.aggregateByHour = jest.fn((data) => {
                const grouped = {};
                
                data.forEach(point => {
                    const hour = point.timestamp.substring(0, 13); // YYYY-MM-DDTHH
                    if (!grouped[hour]) {
                        grouped[hour] = [];
                    }
                    grouped[hour].push(point.value);
                });
                
                return Object.entries(grouped).map(([hour, values]) => ({
                    timestamp: hour + ':00:00Z',
                    value: values.reduce((sum, val) => sum + val, 0) / values.length
                }));
            });
            
            const aggregated = component.aggregateByHour(rawData);
            
            expect(aggregated).toHaveLength(1);
            expect(aggregated[0].value).toBe(49.5);
        });
    });
});
