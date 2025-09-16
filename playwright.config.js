/**
 * Playwright Configuration for E2E and Performance Testing
 */

import { defineConfig, devices } from '@playwright/test';
import process from 'node:process'; // <-- added to ensure 'process' is defined in ESM environments

export default defineConfig({
  // Test directory
  testDir: './tests',
  
  // Test matching patterns
  testMatch: [
    '**/e2e/**/*.spec.js',
    '**/performance/**/*.spec.js'
  ],
  
  // Global test timeout
  timeout: 30000,
  
  // Expect timeout for assertions
  expect: {
    timeout: 5000
  },
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Opt out of parallel tests on CI
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'tests/reports/playwright-html' }],
    ['json', { outputFile: 'tests/reports/playwright-results.json' }],
    ['junit', { outputFile: 'tests/reports/playwright-junit.xml' }],
    ...(process.env.CI ? [] : [['list']])
  ],
  
  // Global test setup (disabled for now to simplify configuration)
  // globalSetup: './tests/playwright.global-setup.js',
  // globalTeardown: './tests/playwright.global-teardown.js',
  
  // Shared settings for all projects
  use: {
    // Base URL for tests
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:8000',
    
    // Browser context options
    viewport: { width: 1280, height: 720 },
    
    // Collect trace on failure
    trace: 'retain-on-failure',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video recording
    video: 'retain-on-failure',
    
    // Navigation timeout
    navigationTimeout: 15000,
    
    // Action timeout
    actionTimeout: 10000,
    
    // Ignore HTTPS errors
    ignoreHTTPSErrors: true,
    
    // User agent
    userAgent: 'LoRA-Manager-E2E-Tests'
  },
  
  // Configure projects for major browsers
  projects: [
    // Desktop browsers
    {
      name: 'Desktop Chrome',
      use: { 
        ...devices['Desktop Chrome'],
        // Chrome-specific settings
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ]
        }
      },
      testMatch: '**/e2e/**/*.spec.js'
    },
    
    {
      name: 'Desktop Firefox',
      use: { 
        ...devices['Desktop Firefox'],
        // Firefox-specific settings
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true
          }
        }
      },
      testMatch: '**/e2e/**/*.spec.js'
    },
    
    {
      name: 'Desktop Safari',
      use: { 
        ...devices['Desktop Safari'],
        // Safari-specific settings
      },
      testMatch: '**/e2e/**/*.spec.js'
    },
    
    // Mobile devices
    {
      name: 'Mobile Chrome',
      use: { 
        ...devices['Pixel 5'],
        // Mobile Chrome settings
        hasTouch: true,
        isMobile: true
      },
      testMatch: '**/e2e/**/*.spec.js'
    },
    
    {
      name: 'Mobile Safari',
      use: { 
        ...devices['iPhone 12'],
        // Mobile Safari settings
        hasTouch: true,
        isMobile: true
      },
      testMatch: '**/e2e/**/*.spec.js'
    },
    
    // Tablet devices
    {
      name: 'Tablet',
      use: { 
        ...devices['iPad Pro'],
        // Tablet settings
        hasTouch: true
      },
      testMatch: '**/e2e/**/*.spec.js'
    },
    
    // Performance testing project
    {
      name: 'Performance Tests',
      use: { 
        ...devices['Desktop Chrome'],
        // Performance testing specific settings
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-web-security',
            '--enable-precise-memory-info',
            '--js-flags=--expose-gc'
          ]
        }
      },
      testMatch: '**/performance/**/*.spec.js',
      timeout: 60000, // Longer timeout for performance tests
      retries: 0 // No retries for performance tests
    },
    
    // Accessibility testing
    {
      name: 'Accessibility Tests',
      use: { 
        ...devices['Desktop Chrome'],
        // Accessibility testing settings
        reducedMotion: 'reduce',
        forcedColors: 'none'
      },
      testMatch: '**/accessibility/**/*.spec.js'
    },
    
    // Visual regression testing
    {
      name: 'Visual Tests',
      use: { 
        ...devices['Desktop Chrome'],
        // Visual testing settings
        viewport: { width: 1280, height: 720 }
      },
      testMatch: '**/visual/**/*.spec.js'
    }
  ],
  
  // Configure test output directories
  outputDir: 'tests/results',
  
  // Web server configuration for local development
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    port: 8000,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      NODE_ENV: 'test'
    }
  },
  
  // Test fixtures and utilities
  testOptions: {
    // Custom test options
    slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
    
    // Test data configuration
    testData: {
      users: {
        admin: {
          username: 'admin',
          password: 'admin123'
        },
        user: {
          username: 'testuser',
          password: 'test123'
        }
      },
      
      api: {
        baseURL: process.env.API_BASE_URL || 'http://localhost:8000/api',
        timeout: 10000
      }
    }
  }
});
