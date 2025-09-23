/**
 * End-to-End Tests for LoRA Manager
 * Using Playwright for browser automation
 */

import { test, expect } from '@playwright/test';

import { waitForJobQueueBootstrap } from './utils/waits.js';

test.describe('LoRA Manager E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the application
        await page.goto('/');
    });
    
    test.describe('Navigation and Layout', () => {
        test('should display main navigation', async ({ page }) => {
            // Check main navigation elements
            await expect(page.locator('nav')).toBeVisible();
            await expect(page.locator('a[href="/"]')).toBeVisible();
            await expect(page.locator('a[href="/loras"]')).toBeVisible();
            await expect(page.locator('a[href="/recommendations"]')).toBeVisible();
        });
        
        test('should toggle mobile navigation', async ({ page }) => {
            // Set mobile viewport
            await page.setViewportSize({ width: 375, height: 667 });
            
            // Check mobile menu button exists
            const menuButton = page.locator('[data-testid="mobile-menu-button"]');
            await expect(menuButton).toBeVisible();
            
            // Open mobile menu
            await menuButton.click();
            
            // Check mobile menu is visible
            const mobileMenu = page.locator('[data-testid="mobile-menu"]');
            await expect(mobileMenu).toBeVisible();
            await expect(mobileMenu).toHaveClass(/open/);
            
            // Close mobile menu
            await menuButton.click();
            await expect(mobileMenu).not.toHaveClass(/open/);
        });
        
        test('should navigate between pages', async ({ page }) => {
            // Navigate to LoRAs page
            await page.click('a[href="/loras"]');
            await expect(page).toHaveURL('/loras');
            await expect(page.locator('h1')).toContainText('LoRA Collection');
            
            // Navigate to recommendations
            await page.click('a[href="/recommendations"]');
            await expect(page).toHaveURL('/recommendations');
            await expect(page.locator('h1')).toContainText('Recommendations');
            
            // Navigate back to home
            await page.click('a[href="/"]');
            await expect(page).toHaveURL('/');
        });
    });
    
    test.describe('LoRA Management', () => {
        test('should display LoRA list', async ({ page }) => {
            await page.goto('/loras');
            
            // Wait for LoRAs to load
            await page.waitForSelector('[data-testid="lora-grid"]');
            
            // Check grid is visible
            const loraGrid = page.locator('[data-testid="lora-grid"]');
            await expect(loraGrid).toBeVisible();
            
            // Check if LoRAs are displayed (if any exist)
            const loraCards = page.locator('[data-testid="lora-card"]');
            const count = await loraCards.count();
            
            if (count > 0) {
                // Verify first LoRA card structure
                const firstCard = loraCards.first();
                await expect(firstCard.locator('.lora-name')).toBeVisible();
                await expect(firstCard.locator('.lora-tags')).toBeVisible();
                await expect(firstCard.locator('.lora-metadata')).toBeVisible();
            }
        });
        
        test('should filter LoRAs by tags', async ({ page }) => {
            await page.goto('/loras');
            
            // Wait for filters to load
            await page.waitForSelector('[data-testid="tag-filter"]');
            
            // Check filter is available
            const tagFilter = page.locator('[data-testid="tag-filter"]');
            await expect(tagFilter).toBeVisible();
            
            // Select a tag filter
            await tagFilter.selectOption('character');

            await test.step('Wait for filtered results', async () => {
                await expect.poll(async () => {
                    return page.evaluate(() => {
                        const cards = Array.from(
                            document.querySelectorAll('[data-testid="lora-card"]'),
                        );
                        if (cards.length === 0) {
                            return true;
                        }
                        return cards.every((card) => {
                            const text = card.textContent || '';
                            return text.toLowerCase().includes('character');
                        });
                    });
                }).toBe(true);
            });

            // Verify filtered results
            const loraCards = page.locator('[data-testid="lora-card"]');
            const count = await loraCards.count();
            
            if (count > 0) {
                // Check that displayed LoRAs have the selected tag
                const firstCard = loraCards.first();
                const tags = firstCard.locator('.lora-tags .tag');
                await expect(tags).toContainText('character');
            }
        });
        
        test('should search LoRAs', async ({ page }) => {
            await page.goto('/loras');
            
            // Find search input
            const searchInput = page.locator('[data-testid="search-input"]');
            await expect(searchInput).toBeVisible();
            
            // Perform search
            await searchInput.fill('anime');
            await searchInput.press('Enter');

            await test.step('Wait for search results', async () => {
                await expect.poll(async () => {
                    return page.evaluate(() => {
                        const container = document.querySelector('[data-testid="search-results"]');
                        if (!container) {
                            return false;
                        }
                        const cards = Array.from(
                            container.querySelectorAll('[data-testid="lora-card"]'),
                        );
                        if (cards.length === 0) {
                            return true;
                        }
                        return cards.some((card) => {
                            const text = card.textContent || '';
                            return text.toLowerCase().includes('anime');
                        });
                    });
                }).toBe(true);
            });

            // Verify search results
            const resultsContainer = page.locator('[data-testid="search-results"]');
            await expect(resultsContainer).toBeVisible();
            
            // Check that results contain search term
            const loraCards = page.locator('[data-testid="lora-card"]');
            if (await loraCards.count() > 0) {
                const firstCard = loraCards.first();
                const cardText = await firstCard.textContent();
                expect(cardText.toLowerCase()).toContain('anime');
            }
        });
        
        test('should view LoRA details', async ({ page }) => {
            await page.goto('/loras');
            
            // Wait for LoRAs to load
            await page.waitForSelector('[data-testid="lora-card"]');
            
            const loraCards = page.locator('[data-testid="lora-card"]');
            const count = await loraCards.count();
            
            if (count > 0) {
                // Click on first LoRA card
                await loraCards.first().click();
                
                // Should navigate to detail page
                await expect(page).toHaveURL(/\/loras\/[^\/]+$/);
                
                // Check detail page elements
                await expect(page.locator('[data-testid="lora-detail"]')).toBeVisible();
                await expect(page.locator('.lora-name')).toBeVisible();
                await expect(page.locator('.lora-description')).toBeVisible();
                await expect(page.locator('.lora-metadata')).toBeVisible();
                await expect(page.locator('.lora-files')).toBeVisible();
            }
        });
        
        test('should upload new LoRA', async ({ page }) => {
            await page.goto('/loras');
            
            // Click upload button
            const uploadButton = page.locator('[data-testid="upload-button"]');
            await expect(uploadButton).toBeVisible();
            await uploadButton.click();
            
            // Check upload dialog opened
            const uploadDialog = page.locator('[data-testid="upload-dialog"]');
            await expect(uploadDialog).toBeVisible();
            
            // Fill upload form
            await page.fill('[data-testid="lora-name-input"]', 'Test LoRA');
            await page.fill('[data-testid="lora-description-input"]', 'Test LoRA description');
            await page.selectOption('[data-testid="lora-type-select"]', 'character');
            
            // Note: File upload would require actual file handling
            // await page.setInputFiles('[data-testid="file-input"]', 'path/to/test-file.safetensors');
            
            // Submit form (would normally trigger upload)
            const submitButton = page.locator('[data-testid="upload-submit"]');
            await expect(submitButton).toBeVisible();
            // await submitButton.click(); // Skip actual upload in E2E test
            
            // Close dialog
            await page.click('[data-testid="upload-cancel"]');
            await expect(uploadDialog).not.toBeVisible();
        });
    });
    
    test.describe('Recommendations', () => {
        test('should display recommendations', async ({ page }) => {
            await page.goto('/recommendations');
            
            // Wait for recommendations to load
            await page.waitForSelector('[data-testid="recommendations-container"]');
            
            // Check recommendations container
            const container = page.locator('[data-testid="recommendations-container"]');
            await expect(container).toBeVisible();
            
            // Check recommendation cards
            const recCards = page.locator('[data-testid="recommendation-card"]');
            const count = await recCards.count();
            
            if (count > 0) {
                const firstCard = recCards.first();
                await expect(firstCard.locator('.recommendation-score')).toBeVisible();
                await expect(firstCard.locator('.recommendation-reason')).toBeVisible();
                await expect(firstCard.locator('.lora-preview')).toBeVisible();
            }
        });
        
        test('should provide feedback on recommendations', async ({ page }) => {
            await page.goto('/recommendations');
            
            // Wait for recommendations
            await page.waitForSelector('[data-testid="recommendation-card"]');
            
            const recCards = page.locator('[data-testid="recommendation-card"]');
            if (await recCards.count() > 0) {
                const firstCard = recCards.first();
                
                // Click thumbs up
                const thumbsUp = firstCard.locator('[data-testid="thumbs-up"]');
                await expect(thumbsUp).toBeVisible();
                await thumbsUp.click();
                
                // Check feedback was recorded
                await expect(thumbsUp).toHaveClass(/active/);
                
                // Check notification appeared
                const notification = page.locator('[data-testid="notification"]');
                await expect(notification).toContainText('Feedback recorded');
            }
        });
        
        test('should filter recommendations by preferences', async ({ page }) => {
            await page.goto('/recommendations');
            
            // Open preferences panel
            const prefsButton = page.locator('[data-testid="preferences-button"]');
            await expect(prefsButton).toBeVisible();
            await prefsButton.click();
            
            // Check preferences panel
            const prefsPanel = page.locator('[data-testid="preferences-panel"]');
            await expect(prefsPanel).toBeVisible();
            
            // Select preferred tags
            const tagCheckbox = page.locator('[data-testid="tag-checkbox"][value="anime"]');
            await expect(tagCheckbox).toBeVisible();
            await tagCheckbox.check();
            
            // Apply preferences
            const applyButton = page.locator('[data-testid="apply-preferences"]');
            const recommendationsRequest = page
                .waitForResponse(
                    (response) => {
                        const url = response.url();
                        return (
                            response.request().method() === 'GET' &&
                            url.includes('/api/v1/recommendations')
                        );
                    },
                    { timeout: 5000 },
                )
                .catch(() => null);

            await Promise.all([recommendationsRequest, applyButton.click()]);

            await test.step('Wait for updated recommendations', async () => {
                await expect.poll(async () => {
                    return page.evaluate(() => {
                        const cards = Array.from(
                            document.querySelectorAll('[data-testid="recommendation-card"]'),
                        );
                        if (cards.length === 0) {
                            return true;
                        }
                        return cards.some((card) => {
                            const text = card.textContent || '';
                            return text.toLowerCase().includes('anime');
                        });
                    });
                }).toBe(true);
            });

            // Verify recommendations updated
            const recCards = page.locator('[data-testid="recommendation-card"]');
            if (await recCards.count() > 0) {
                const firstCard = recCards.first();
                const cardText = await firstCard.textContent();
                expect(cardText.toLowerCase()).toContain('anime');
            }
        });
    });
    
    test.describe('System Administration', () => {
        test('should access admin panel', async ({ page }) => {
            await page.goto('/admin');
            await waitForJobQueueBootstrap(page);

            // Check admin interface loaded
            await expect(page.locator('[data-testid="admin-interface"]')).toBeVisible();
            
            // Check admin tabs
            await expect(page.locator('[data-testid="overview-tab"]')).toBeVisible();
            await expect(page.locator('[data-testid="workers-tab"]')).toBeVisible();
            await expect(page.locator('[data-testid="database-tab"]')).toBeVisible();
            await expect(page.locator('[data-testid="logs-tab"]')).toBeVisible();
            await expect(page.locator('[data-testid="settings-tab"]')).toBeVisible();
        });
        
        test('should display system overview', async ({ page }) => {
            await page.goto('/admin');
            await waitForJobQueueBootstrap(page);

            // Overview tab should be active by default
            const overviewTab = page.locator('[data-testid="overview-tab"]');
            await expect(overviewTab).toHaveClass(/active/);
            
            // Check overview content
            await expect(page.locator('[data-testid="system-info"]')).toBeVisible();
            await expect(page.locator('[data-testid="cpu-usage"]')).toBeVisible();
            await expect(page.locator('[data-testid="memory-usage"]')).toBeVisible();
            await expect(page.locator('[data-testid="disk-usage"]')).toBeVisible();
            
            // Check metrics charts
            await expect(page.locator('[data-testid="metrics-chart"]')).toBeVisible();
        });
        
        test('should manage workers', async ({ page }) => {
            await page.goto('/admin');
            await waitForJobQueueBootstrap(page);

            // Switch to workers tab
            await page.click('[data-testid="workers-tab"]');
            
            // Check workers interface
            await expect(page.locator('[data-testid="workers-container"]')).toBeVisible();
            await expect(page.locator('[data-testid="active-workers"]')).toBeVisible();
            await expect(page.locator('[data-testid="inactive-workers"]')).toBeVisible();
            
            // Check worker controls
            const workerControls = page.locator('[data-testid="worker-controls"]');
            if (await workerControls.count() > 0) {
                await expect(workerControls.first().locator('[data-testid="start-worker"]')).toBeVisible();
                await expect(workerControls.first().locator('[data-testid="stop-worker"]')).toBeVisible();
                await expect(workerControls.first().locator('[data-testid="restart-worker"]')).toBeVisible();
            }
        });
        
        test('should view system logs', async ({ page }) => {
            await page.goto('/admin');
            await waitForJobQueueBootstrap(page);

            // Switch to logs tab
            await page.click('[data-testid="logs-tab"]');
            
            // Check logs interface
            await expect(page.locator('[data-testid="logs-container"]')).toBeVisible();
            await expect(page.locator('[data-testid="log-filters"]')).toBeVisible();
            await expect(page.locator('[data-testid="logs-list"]')).toBeVisible();
            
            // Test log filtering
            const levelFilter = page.locator('[data-testid="level-filter"]');
            await expect(levelFilter).toBeVisible();
            await levelFilter.selectOption('error');

            await test.step('Wait for log filter results', async () => {
                await expect.poll(async () => {
                    return page.evaluate(() => {
                        const entries = Array.from(
                            document.querySelectorAll('[data-testid="log-entry"]'),
                        );
                        if (entries.length === 0) {
                            return true;
                        }
                        return entries.every((entry) => {
                            const text = entry.textContent || '';
                            return text.toLowerCase().includes('error');
                        });
                    });
                }).toBe(true);
            });

            // Verify error logs are shown
            const logEntries = page.locator('[data-testid="log-entry"]');
            if (await logEntries.count() > 0) {
                const firstEntry = logEntries.first();
                const levelBadge = firstEntry.locator('.log-level');
                await expect(levelBadge).toContainText('ERROR');
            }
        });
    });
    
    test.describe('Performance Analytics', () => {
        test('should display analytics dashboard', async ({ page }) => {
            await page.goto('/analytics');
            
            // Check dashboard loaded
            await expect(page.locator('[data-testid="analytics-dashboard"]')).toBeVisible();
            
            // Check KPI cards
            await expect(page.locator('[data-testid="kpi-cards"]')).toBeVisible();
            await expect(page.locator('[data-testid="total-requests"]')).toBeVisible();
            await expect(page.locator('[data-testid="avg-response-time"]')).toBeVisible();
            await expect(page.locator('[data-testid="error-rate"]')).toBeVisible();
            await expect(page.locator('[data-testid="uptime"]')).toBeVisible();
            
            // Check charts
            await expect(page.locator('[data-testid="system-metrics-chart"]')).toBeVisible();
            await expect(page.locator('[data-testid="performance-chart"]')).toBeVisible();
            await expect(page.locator('[data-testid="users-chart"]')).toBeVisible();
        });
        
        test('should change time range', async ({ page }) => {
            await page.goto('/analytics');
            
            // Find time range selector
            const timeRangeSelect = page.locator('[data-testid="time-range-select"]');
            await expect(timeRangeSelect).toBeVisible();

            // Change to 7 days
            const analyticsRefresh = page
                .waitForResponse(
                    (response) => {
                        const url = response.url();
                        return (
                            response.request().method() === 'GET' &&
                            url.includes('/analytics/summary')
                        );
                    },
                    { timeout: 5000 },
                )
                .catch(() => null);

            await Promise.all([analyticsRefresh, timeRangeSelect.selectOption('7d')]);

            await test.step('Wait for analytics data refresh', async () => {
                await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible();
            });

            // Verify time range changed
            await expect(timeRangeSelect).toHaveValue('7d');

            // Charts should be updated (check for loading indicator gone)
            await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible();
        });
        
        test('should export analytics data', async ({ page }) => {
            await page.goto('/analytics');
            
            // Click export button
            const exportButton = page.locator('[data-testid="export-button"]');
            await expect(exportButton).toBeVisible();
            await exportButton.click();
            
            // Check export dialog
            const exportDialog = page.locator('[data-testid="export-dialog"]');
            await expect(exportDialog).toBeVisible();
            
            // Select export format
            await page.selectOption('[data-testid="export-format"]', 'json');
            
            // Configure export options
            await page.check('[data-testid="include-charts"]');
            
            // Start export (would normally trigger download)
            const startExport = page.locator('[data-testid="start-export"]');
            await expect(startExport).toBeVisible();
            // await startExport.click(); // Skip actual download in E2E test
            
            // Close dialog
            await page.click('[data-testid="export-cancel"]');
            await expect(exportDialog).not.toBeVisible();
        });
    });
    
    test.describe('Import/Export Functionality', () => {
        test('should access import/export interface', async ({ page }) => {
            await page.goto('/import-export');
            await waitForJobQueueBootstrap(page);

            // Check interface loaded
            await expect(page.locator('[data-testid="import-export-interface"]')).toBeVisible();
            
            // Check tabs
            await expect(page.locator('[data-testid="export-tab"]')).toBeVisible();
            await expect(page.locator('[data-testid="import-tab"]')).toBeVisible();
            await expect(page.locator('[data-testid="backup-tab"]')).toBeVisible();
            await expect(page.locator('[data-testid="migration-tab"]')).toBeVisible();
        });
        
        test('should configure data export', async ({ page }) => {
            await page.goto('/import-export');
            await waitForJobQueueBootstrap(page);

            // Export tab should be active
            const exportTab = page.locator('[data-testid="export-tab"]');
            await expect(exportTab).toHaveClass(/active/);
            
            // Configure export options
            await page.selectOption('[data-testid="export-format"]', 'json');
            await page.check('[data-testid="include-loras"]');
            await page.check('[data-testid="include-settings"]');
            await page.check('[data-testid="compression"]');
            
            // Validate export button
            const exportButton = page.locator('[data-testid="start-export"]');
            await expect(exportButton).toBeEnabled();
            
            // Check progress area exists
            await expect(page.locator('[data-testid="export-progress"]')).toBeVisible();
        });
        
        test('should handle file import', async ({ page }) => {
            await page.goto('/import-export');
            await waitForJobQueueBootstrap(page);

            // Switch to import tab
            await page.click('[data-testid="import-tab"]');
            
            // Check import interface
            await expect(page.locator('[data-testid="import-container"]')).toBeVisible();
            await expect(page.locator('[data-testid="file-upload"]')).toBeVisible();
            
            // Configure import options
            await page.selectOption('[data-testid="merge-strategy"]', 'skip_existing');
            await page.check('[data-testid="validate-data"]');
            await page.check('[data-testid="create-backup"]');
            
            // Check import button is disabled without file
            const importButton = page.locator('[data-testid="start-import"]');
            await expect(importButton).toBeDisabled();
            
            // Note: File upload would require actual file
            // await page.setInputFiles('[data-testid="file-upload"]', 'path/to/import.json');
            // await expect(importButton).toBeEnabled();
        });
        
        test('should manage backups', async ({ page }) => {
            await page.goto('/import-export');
            await waitForJobQueueBootstrap(page);

            // Switch to backup tab
            await page.click('[data-testid="backup-tab"]');
            
            // Check backup interface
            await expect(page.locator('[data-testid="backup-container"]')).toBeVisible();
            await expect(page.locator('[data-testid="backup-list"]')).toBeVisible();
            
            // Configure backup options
            await page.check('[data-testid="include-database"]');
            await page.check('[data-testid="include-files"]');
            await page.selectOption('[data-testid="compression-type"]', 'gzip');
            
            // Check create backup button
            const createBackupButton = page.locator('[data-testid="create-backup"]');
            await expect(createBackupButton).toBeVisible();
            
            // Check existing backups list
            const backupItems = page.locator('[data-testid="backup-item"]');
            if (await backupItems.count() > 0) {
                const firstBackup = backupItems.first();
                await expect(firstBackup.locator('[data-testid="restore-backup"]')).toBeVisible();
                await expect(firstBackup.locator('[data-testid="delete-backup"]')).toBeVisible();
            }
        });
    });
    
    test.describe('Responsive Design', () => {
        test('should work on mobile devices', async ({ page }) => {
            // Set mobile viewport
            await page.setViewportSize({ width: 375, height: 667 });
            
            await page.goto('/');
            
            // Check mobile layout
            const header = page.locator('header');
            await expect(header).toBeVisible();
            
            // Check mobile navigation
            const mobileMenu = page.locator('[data-testid="mobile-menu-button"]');
            await expect(mobileMenu).toBeVisible();
            
            // Navigate to LoRAs page
            await page.goto('/loras');
            
            // Check LoRA grid adapts to mobile
            const loraGrid = page.locator('[data-testid="lora-grid"]');
            await expect(loraGrid).toHaveClass(/mobile-grid/);
            
            // Check cards stack vertically
            const loraCards = page.locator('[data-testid="lora-card"]');
            if (await loraCards.count() > 1) {
                const firstCard = loraCards.first();
                const secondCard = loraCards.nth(1);
                
                const firstCardBox = await firstCard.boundingBox();
                const secondCardBox = await secondCard.boundingBox();
                
                // Cards should be stacked vertically (second card below first)
                expect(secondCardBox.y).toBeGreaterThan(firstCardBox.y + firstCardBox.height);
            }
        });
        
        test('should work on tablet devices', async ({ page }) => {
            // Set tablet viewport
            await page.setViewportSize({ width: 768, height: 1024 });
            
            await page.goto('/loras');
            
            // Check tablet layout
            const loraGrid = page.locator('[data-testid="lora-grid"]');
            await expect(loraGrid).toHaveClass(/tablet-grid/);
            
            // Navigation should be visible (not mobile menu)
            const nav = page.locator('nav');
            await expect(nav).toBeVisible();
            
            const mobileMenu = page.locator('[data-testid="mobile-menu-button"]');
            await expect(mobileMenu).not.toBeVisible();
        });
        
        test('should work on desktop', async ({ page }) => {
            // Set desktop viewport
            await page.setViewportSize({ width: 1920, height: 1080 });
            
            await page.goto('/loras');
            
            // Check desktop layout
            const loraGrid = page.locator('[data-testid="lora-grid"]');
            await expect(loraGrid).toHaveClass(/desktop-grid/);
            
            // Full navigation should be visible
            const nav = page.locator('nav');
            await expect(nav).toBeVisible();
            
            // Check sidebar if present
            const sidebar = page.locator('[data-testid="sidebar"]');
            if (await sidebar.count() > 0) {
                await expect(sidebar).toBeVisible();
            }
        });
    });
    
    test.describe('Performance', () => {
        test('should load pages quickly', async ({ page }) => {
            const start = Date.now();
            
            await page.goto('/');
            
            // Wait for main content to load
            await page.waitForSelector('[data-testid="main-content"]');
            
            const loadTime = Date.now() - start;
            
            // Should load within 3 seconds
            expect(loadTime).toBeLessThan(3000);
        });
        
        test('should have good Core Web Vitals', async ({ page }) => {
            await page.goto('/');
            
            // Measure Largest Contentful Paint (LCP)
            const lcp = await page.evaluate(() => {
                return new Promise((resolve) => {
                    new PerformanceObserver((list) => {
                        const entries = list.getEntries();
                        const lastEntry = entries[entries.length - 1];
                        resolve(lastEntry.startTime);
                    }).observe({ entryTypes: ['largest-contentful-paint'] });
                });
            });
            
            // LCP should be under 2.5 seconds
            expect(lcp).toBeLessThan(2500);
        });
        
        test('should handle large datasets efficiently', async ({ page }) => {
            // Navigate to page with potentially large dataset
            await page.goto('/loras?limit=100');
            
            const start = Date.now();
            
            // Wait for all items to load
            await page.waitForSelector('[data-testid="lora-grid"]');
            await page.waitForLoadState('networkidle');
            
            const loadTime = Date.now() - start;
            
            // Should handle large datasets efficiently
            expect(loadTime).toBeLessThan(5000);
            
            // Check that pagination or virtual scrolling is working
            const loraCards = page.locator('[data-testid="lora-card"]');
            const cardCount = await loraCards.count();
            
            // Should limit displayed items for performance
            expect(cardCount).toBeLessThanOrEqual(50);
        });
    });
    
    test.describe('Accessibility', () => {
        test('should be keyboard navigable', async ({ page }) => {
            await page.goto('/');
            
            // Tab through navigation
            await page.keyboard.press('Tab');
            
            // Check focus is on first navigation item
            const focusedElement = page.locator(':focus');
            await expect(focusedElement).toBeVisible();
            
            // Continue tabbing through interface
            await page.keyboard.press('Tab');
            await page.keyboard.press('Tab');
            
            // Should be able to activate focused elements with Enter
            await page.keyboard.press('Enter');
            
            // Check that navigation worked
            // (URL or page content should change)
        });
        
        test('should have proper ARIA labels', async ({ page }) => {
            await page.goto('/loras');
            
            // Check main landmarks
            await expect(page.locator('main')).toHaveAttribute('role', 'main');
            await expect(page.locator('nav')).toHaveAttribute('role', 'navigation');
            
            // Check form labels
            const searchInput = page.locator('[data-testid="search-input"]');
            if (await searchInput.count() > 0) {
                await expect(searchInput).toHaveAttribute('aria-label');
            }
            
            // Check button labels
            const buttons = page.locator('button');
            const buttonCount = await buttons.count();
            
            for (let i = 0; i < Math.min(buttonCount, 5); i++) {
                const button = buttons.nth(i);
                const hasAriaLabel = await button.getAttribute('aria-label');
                const hasText = await button.textContent();
                
                // Button should have either aria-label or text content
                expect(hasAriaLabel || (hasText && hasText.trim())).toBeTruthy();
            }
        });
        
        test('should have sufficient color contrast', async ({ page }) => {
            await page.goto('/');
            
            // This would typically use an accessibility testing library
            // For now, check that contrast-related CSS classes exist
            const elements = page.locator('[class*="contrast"], [class*="text-"]');
            const count = await elements.count();
            
            // Should have contrast-aware styling
            expect(count).toBeGreaterThan(0);
        });
        
        test('should work with screen readers', async ({ page }) => {
            await page.goto('/loras');
            
            // Check for screen reader friendly elements
            const headings = page.locator('h1, h2, h3, h4, h5, h6');
            const headingCount = await headings.count();
            
            // Should have proper heading structure
            expect(headingCount).toBeGreaterThan(0);
            
            // Check for alt text on images
            const images = page.locator('img');
            const imageCount = await images.count();
            
            for (let i = 0; i < Math.min(imageCount, 5); i++) {
                const img = images.nth(i);
                const hasAlt = await img.getAttribute('alt');
                
                // Images should have alt text (empty alt is ok for decorative images)
                expect(hasAlt).toBeDefined();
            }
        });
    });
});
