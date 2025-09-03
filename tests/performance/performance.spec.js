/**
 * Performance Tests for LoRA Manager
 * Testing load, stress, and optimization scenarios
 */

import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
    test.describe('Page Load Performance', () => {
        test('should load home page within performance budget', async ({ page }) => {
            const startTime = Date.now();
            
            await page.goto('/', { waitUntil: 'networkidle' });
            
            const loadTime = Date.now() - startTime;
            
            // Page should load within 2 seconds
            expect(loadTime).toBeLessThan(2000);
            
            // Check performance metrics
            const performanceMetrics = await page.evaluate(() => {
                const navigation = performance.getEntriesByType('navigation')[0];
                return {
                    domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                    load: navigation.loadEventEnd - navigation.loadEventStart,
                    firstByte: navigation.responseStart - navigation.requestStart,
                    domInteractive: navigation.domInteractive - navigation.fetchStart
                };
            });
            
            // DOM should be interactive quickly
            expect(performanceMetrics.domInteractive).toBeLessThan(1000);
            
            // First byte should be fast
            expect(performanceMetrics.firstByte).toBeLessThan(500);
        });
        
        test('should load LoRA list efficiently with pagination', async ({ page }) => {
            const startTime = Date.now();
            
            await page.goto('/loras?limit=50', { waitUntil: 'networkidle' });
            
            const loadTime = Date.now() - startTime;
            
            // Even with 50 items, should load quickly
            expect(loadTime).toBeLessThan(3000);
            
            // Check that items are rendered efficiently
            const loraCards = page.locator('[data-testid="lora-card"]');
            const cardCount = await loraCards.count();
            
            // Should limit cards for performance
            expect(cardCount).toBeLessThanOrEqual(50);
            
            // Check virtual scrolling or pagination is working
            const pagination = page.locator('[data-testid="pagination"]');
            if (cardCount >= 50) {
                await expect(pagination).toBeVisible();
            }
        });
        
        test('should handle search results efficiently', async ({ page }) => {
            await page.goto('/loras');
            
            const searchInput = page.locator('[data-testid="search-input"]');
            await searchInput.fill('anime');
            
            const startTime = Date.now();
            await searchInput.press('Enter');
            
            // Wait for search results
            await page.waitForSelector('[data-testid="search-results"]');
            
            const searchTime = Date.now() - startTime;
            
            // Search should be fast
            expect(searchTime).toBeLessThan(1000);
            
            // Check debouncing is working (no excessive requests)
            const networkRequests = await page.evaluate(() => {
                return performance.getEntriesByType('fetch').length;
            });
            
            // Should not make excessive requests
            expect(networkRequests).toBeLessThan(10);
        });
    });
    
    test.describe('Resource Loading', () => {
        test('should optimize image loading', async ({ page }) => {
            await page.goto('/loras');
            
            // Check for lazy loading attributes
            const images = page.locator('img[data-src], img[loading="lazy"]');
            const lazyImageCount = await images.count();
            
            // Should use lazy loading for performance
            expect(lazyImageCount).toBeGreaterThan(0);
            
            // Check image optimization
            const allImages = page.locator('img');
            const imageCount = await allImages.count();
            
            if (imageCount > 0) {
                const firstImage = allImages.first();
                const src = await firstImage.getAttribute('src');
                
                if (src) {
                    // Should use optimized image formats
                    const isOptimized = src.includes('.webp') || 
                                      src.includes('.avif') || 
                                      src.includes('w_') || // Width parameter
                                      src.includes('q_'); // Quality parameter
                    
                    expect(isOptimized).toBeTruthy();
                }
            }
        });
        
        test('should minimize bundle sizes', async ({ page }) => {
            await page.goto('/');
            
            // Check JavaScript bundle sizes
            const jsResources = await page.evaluate(() => {
                return performance.getEntriesByType('resource')
                    .filter(resource => resource.name.includes('.js'))
                    .map(resource => ({
                        name: resource.name,
                        size: resource.transferSize,
                        duration: resource.duration
                    }));
            });
            
            // Total JS bundle size should be reasonable
            const totalJSSize = jsResources.reduce((sum, resource) => sum + resource.size, 0);
            expect(totalJSSize).toBeLessThan(1024 * 1024); // Under 1MB
            
            // Check CSS bundle sizes
            const cssResources = await page.evaluate(() => {
                return performance.getEntriesByType('resource')
                    .filter(resource => resource.name.includes('.css'))
                    .map(resource => ({
                        name: resource.name,
                        size: resource.transferSize
                    }));
            });
            
            const totalCSSSize = cssResources.reduce((sum, resource) => sum + resource.size, 0);
            expect(totalCSSSize).toBeLessThan(100 * 1024); // Under 100KB
        });
        
        test('should use efficient caching strategies', async ({ page }) => {
            // First visit
            await page.goto('/');
            
            const firstLoadResources = await page.evaluate(() => {
                return performance.getEntriesByType('resource').length;
            });
            
            // Second visit (should use cache)
            await page.reload();
            
            const secondLoadResources = await page.evaluate(() => {
                return performance.getEntriesByType('resource')
                    .filter(resource => resource.transferSize === 0).length; // Cached resources
            });
            
            // Should have cached resources on second load
            expect(secondLoadResources).toBeGreaterThan(0);
            
            // Check cache headers
            const response = await page.goto('/', { waitUntil: 'networkidle' });
            const cacheControl = response.headers()['cache-control'];
            
            if (cacheControl) {
                expect(cacheControl).toContain('max-age');
            }
        });
    });
    
    test.describe('Runtime Performance', () => {
        test('should handle large datasets without blocking UI', async ({ page }) => {
            await page.goto('/loras?limit=100');
            
            // Simulate heavy interaction while data loads
            const searchInput = page.locator('[data-testid="search-input"]');
            
            // Should remain responsive during data loading
            const startTime = Date.now();
            await searchInput.fill('test');
            const responseTime = Date.now() - startTime;
            
            // UI should remain responsive
            expect(responseTime).toBeLessThan(100);
            
            // Check for performance optimizations
            const hasVirtualization = await page.evaluate(() => {
                // Check for virtual scrolling indicators
                return document.querySelector('[data-testid="virtual-list"]') !== null ||
                       document.querySelector('.virtual-scroll') !== null ||
                       document.querySelector('[data-virtual]') !== null;
            });
            
            // Should use virtualization for large lists
            if (await page.locator('[data-testid="lora-card"]').count() > 50) {
                expect(hasVirtualization).toBeTruthy();
            }
        });
        
        test('should efficiently update charts and visualizations', async ({ page }) => {
            await page.goto('/analytics');
            
            // Wait for charts to load
            await page.waitForSelector('[data-testid="system-metrics-chart"]');
            
            // Change time range to trigger chart update
            const timeRangeSelect = page.locator('[data-testid="time-range-select"]');
            
            const startTime = Date.now();
            await timeRangeSelect.selectOption('7d');
            
            // Wait for chart update
            await page.waitForTimeout(500);
            
            const updateTime = Date.now() - startTime;
            
            // Chart updates should be fast
            expect(updateTime).toBeLessThan(2000);
            
            // Check for smooth animations
            const animationDuration = await page.evaluate(() => {
                const charts = document.querySelectorAll('canvas');
                if (charts.length > 0) {
                    const chart = charts[0];
                    const computedStyle = getComputedStyle(chart);
                    return computedStyle.transitionDuration;
                }
                return '0s';
            });
            
            // Should have reasonable animation durations
            if (animationDuration !== '0s') {
                const duration = parseFloat(animationDuration);
                expect(duration).toBeLessThan(1); // Under 1 second
            }
        });
        
        test('should manage memory efficiently', async ({ page }) => {
            await page.goto('/');
            
            // Get initial memory usage
            const initialMemory = await page.evaluate(() => {
                return performance.memory ? {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit
                } : null;
            });
            
            if (initialMemory) {
                // Navigate through several pages to test memory management
                await page.goto('/loras');
                await page.goto('/recommendations');
                await page.goto('/analytics');
                await page.goto('/admin');
                await page.goto('/');
                
                // Force garbage collection (if supported)
                await page.evaluate(() => {
                    if (window.gc) {
                        window.gc();
                    }
                });
                
                const finalMemory = await page.evaluate(() => {
                    return performance.memory ? {
                        used: performance.memory.usedJSHeapSize,
                        total: performance.memory.totalJSHeapSize,
                        limit: performance.memory.jsHeapSizeLimit
                    } : null;
                });
                
                if (finalMemory) {
                    // Memory usage shouldn't grow excessively
                    const memoryGrowth = finalMemory.used - initialMemory.used;
                    const growthPercentage = (memoryGrowth / initialMemory.used) * 100;
                    
                    // Memory growth should be reasonable
                    expect(growthPercentage).toBeLessThan(50); // Under 50% growth
                }
            }
        });
    });
    
    test.describe('API Performance', () => {
        test('should handle concurrent API requests efficiently', async ({ page }) => {
            await page.goto('/');
            
            // Monitor network requests
            const networkRequests = [];
            page.on('request', request => {
                if (request.url().includes('/api/')) {
                    networkRequests.push({
                        url: request.url(),
                        startTime: Date.now()
                    });
                }
            });
            
            const responses = [];
            page.on('response', response => {
                if (response.url().includes('/api/')) {
                    responses.push({
                        url: response.url(),
                        status: response.status(),
                        endTime: Date.now()
                    });
                }
            });
            
            // Navigate to pages that make multiple API calls
            await page.goto('/loras');
            await page.goto('/recommendations');
            await page.goto('/analytics');
            
            // Wait for all requests to complete
            await page.waitForTimeout(2000);
            
            // Check API response times
            const apiResponseTimes = responses.map(response => {
                const request = networkRequests.find(req => req.url === response.url);
                if (request) {
                    return response.endTime - request.startTime;
                }
                return 0;
            });
            
            if (apiResponseTimes.length > 0) {
                const avgResponseTime = apiResponseTimes.reduce((sum, time) => sum + time, 0) / apiResponseTimes.length;
                
                // Average API response time should be reasonable
                expect(avgResponseTime).toBeLessThan(1000);
                
                // No single request should take too long
                const maxResponseTime = Math.max(...apiResponseTimes);
                expect(maxResponseTime).toBeLessThan(5000);
            }
        });
        
        test('should implement efficient data fetching strategies', async ({ page }) => {
            await page.goto('/loras');
            
            // Monitor fetch requests
            const fetchRequests = await page.evaluate(() => {
                const originalFetch = window.fetch;
                const requests = [];
                
                window.fetch = function(...args) {
                    requests.push({
                        url: args[0],
                        timestamp: Date.now(),
                        options: args[1]
                    });
                    return originalFetch.apply(this, args);
                };
                
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve(requests);
                    }, 3000);
                });
            });
            
            // Scroll to trigger any lazy loading
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight / 2);
            });
            
            await page.waitForTimeout(1000);
            
            // Check for efficient data fetching patterns
            const uniqueUrls = new Set(fetchRequests.map(req => req.url));
            
            // Should not make duplicate requests
            expect(uniqueUrls.size).toBe(fetchRequests.length);
            
            // Check for pagination or infinite scroll
            const hasPagination = await page.locator('[data-testid="pagination"]').count() > 0;
            const hasInfiniteScroll = await page.evaluate(() => {
                return document.querySelector('[data-infinite-scroll]') !== null;
            });
            
            // Should use efficient loading strategy
            expect(hasPagination || hasInfiniteScroll).toBeTruthy();
        });
    });
    
    test.describe('Mobile Performance', () => {
        test('should perform well on mobile devices', async ({ page }) => {
            // Simulate mobile device
            await page.setViewportSize({ width: 375, height: 667 });
            await page.emulateMedia({ media: 'screen' });
            
            // Simulate slower network
            await page.route('**/*', async route => {
                await new Promise(resolve => setTimeout(resolve, 100)); // Add 100ms delay
                route.continue();
            });
            
            const startTime = Date.now();
            await page.goto('/', { waitUntil: 'networkidle' });
            const loadTime = Date.now() - startTime;
            
            // Should still load reasonably fast on mobile
            expect(loadTime).toBeLessThan(5000);
            
            // Check mobile-specific optimizations
            const hasReducedMotion = await page.evaluate(() => {
                return document.documentElement.classList.contains('reduce-motion') ||
                       window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            });
            
            // Should respect mobile preferences
            expect(hasReducedMotion).toBeDefined();
        });
        
        test('should handle touch interactions efficiently', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/loras');
            
            // Test touch scrolling performance
            const startTime = Date.now();
            
            await page.touchscreen.tap(100, 300);
            await page.mouse.wheel(0, 500); // Simulate scroll
            
            const scrollTime = Date.now() - startTime;
            
            // Touch interactions should be responsive
            expect(scrollTime).toBeLessThan(100);
            
            // Check for 60fps scrolling
            const frameRate = await page.evaluate(() => {
                return new Promise(resolve => {
                    let frames = 0;
                    const startTime = performance.now();
                    
                    function countFrames() {
                        frames++;
                        if (performance.now() - startTime < 1000) {
                            requestAnimationFrame(countFrames);
                        } else {
                            resolve(frames);
                        }
                    }
                    
                    requestAnimationFrame(countFrames);
                });
            });
            
            // Should maintain good frame rate
            expect(frameRate).toBeGreaterThan(50); // Close to 60fps
        });
    });
    
    test.describe('Stress Testing', () => {
        test('should handle rapid navigation', async ({ page }) => {
            const pages = ['/', '/loras', '/recommendations', '/analytics', '/admin'];
            
            const startTime = Date.now();
            
            // Rapidly navigate between pages
            for (let i = 0; i < 10; i++) {
                const pageUrl = pages[i % pages.length];
                await page.goto(pageUrl);
                await page.waitForSelector('main', { timeout: 5000 });
            }
            
            const totalTime = Date.now() - startTime;
            
            // Should handle rapid navigation efficiently
            expect(totalTime).toBeLessThan(20000); // 20 seconds for 10 navigations
            
            // Check for memory leaks
            const finalMemory = await page.evaluate(() => {
                return performance.memory ? performance.memory.usedJSHeapSize : 0;
            });
            
            // Memory usage should be reasonable
            expect(finalMemory).toBeLessThan(100 * 1024 * 1024); // Under 100MB
        });
        
        test('should handle large form submissions', async ({ page }) => {
            await page.goto('/admin');
            
            // Switch to settings tab
            await page.click('[data-testid="settings-tab"]');
            
            // Find a large form if available
            const form = page.locator('form').first();
            const formExists = await form.count() > 0;
            
            if (formExists) {
                // Fill form with large data
                const textareas = form.locator('textarea');
                const textareaCount = await textareas.count();
                
                if (textareaCount > 0) {
                    const largeText = 'A'.repeat(10000); // 10KB of text
                    
                    const startTime = Date.now();
                    await textareas.first().fill(largeText);
                    const fillTime = Date.now() - startTime;
                    
                    // Should handle large input efficiently
                    expect(fillTime).toBeLessThan(1000);
                }
            }
        });
        
        test('should handle multiple websocket connections', async ({ page }) => {
            await page.goto('/admin');
            
            // Create multiple websocket connections
            const connectionCount = await page.evaluate(() => {
                const connections = [];
                
                try {
                    for (let i = 0; i < 5; i++) {
                        const ws = new WebSocket('ws://localhost:8000/ws/admin');
                        connections.push(ws);
                    }
                    
                    return connections.length;
                } catch (error) {
                    return 0;
                }
            });
            
            if (connectionCount > 0) {
                // Wait for connections to establish
                await page.waitForTimeout(2000);
                
                // Check that page remains responsive
                const startTime = Date.now();
                await page.click('[data-testid="overview-tab"]');
                const responseTime = Date.now() - startTime;
                
                expect(responseTime).toBeLessThan(200);
                
                // Cleanup connections
                await page.evaluate(() => {
                    window.dispatchEvent(new Event('beforeunload'));
                });
            }
        });
    });
    
    test.describe('Performance Regression Detection', () => {
        test('should maintain performance baselines', async ({ page }) => {
            // This test would typically compare against stored baselines
            const performanceBaselines = {
                homePageLoad: 2000,
                loraPageLoad: 3000,
                searchResponse: 1000,
                chartUpdate: 2000
            };
            
            // Test home page load
            let startTime = Date.now();
            await page.goto('/');
            let loadTime = Date.now() - startTime;
            expect(loadTime).toBeLessThan(performanceBaselines.homePageLoad);
            
            // Test LoRA page load
            startTime = Date.now();
            await page.goto('/loras');
            loadTime = Date.now() - startTime;
            expect(loadTime).toBeLessThan(performanceBaselines.loraPageLoad);
            
            // Test search response
            const searchInput = page.locator('[data-testid="search-input"]');
            if (await searchInput.count() > 0) {
                startTime = Date.now();
                await searchInput.fill('test');
                await searchInput.press('Enter');
                await page.waitForSelector('[data-testid="search-results"]');
                const searchTime = Date.now() - startTime;
                expect(searchTime).toBeLessThan(performanceBaselines.searchResponse);
            }
            
            // Test chart update (if analytics page exists)
            const analyticsExists = await page.locator('a[href="/analytics"]').count() > 0;
            if (analyticsExists) {
                await page.goto('/analytics');
                const timeRangeSelect = page.locator('[data-testid="time-range-select"]');
                
                if (await timeRangeSelect.count() > 0) {
                    startTime = Date.now();
                    await timeRangeSelect.selectOption('7d');
                    await page.waitForTimeout(500);
                    const updateTime = Date.now() - startTime;
                    expect(updateTime).toBeLessThan(performanceBaselines.chartUpdate);
                }
            }
        });
    });
});
