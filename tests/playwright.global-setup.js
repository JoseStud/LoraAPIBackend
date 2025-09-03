/**
 * Playwright Global Setup
 * Runs once before all tests
 */

import { chromium } from '@playwright/test';

async function globalSetup() {
  console.log('🚀 Starting global test setup...');
  
  // Start test database if needed
  try {
    await setupTestDatabase();
    console.log('✅ Test database ready');
  } catch (error) {
    console.warn('⚠️ Test database setup failed:', error.message);
  }
  
  // Start test server if needed
  try {
    await setupTestServer();
    console.log('✅ Test server ready');
  } catch (error) {
    console.warn('⚠️ Test server setup failed:', error.message);
  }
  
  // Setup test data
  try {
    await setupTestData();
    console.log('✅ Test data ready');
  } catch (error) {
    console.warn('⚠️ Test data setup failed:', error.message);
  }
  
  // Verify application is accessible
  try {
    await verifyApplication();
    console.log('✅ Application verified');
  } catch (error) {
    console.error('❌ Application verification failed:', error.message);
    throw error;
  }
  
  console.log('🎉 Global test setup completed');
}

/**
 * Setup test database
 */
async function setupTestDatabase() {
  const { spawn } = await import('child_process');
  const { promisify } = await import('util');
  const exec = promisify(spawn);
  
  // Check if database is already running
  try {
    const response = await fetch('http://localhost:8000/api/v1/health');
    if (response.ok) {
      console.log('Database already running');
      return;
    }
  } catch (error) {
    // Database not running, continue with setup
  }
  
  // Start test database (if using Docker)
  if (process.env.USE_DOCKER_DB === 'true') {
    console.log('Starting test database container...');
    await exec('docker-compose', ['-f', 'docker-compose.test.yml', 'up', '-d', 'test-db']);
    
    // Wait for database to be ready
    await waitForService('postgresql://test:test@localhost:5433/lora_manager_test', 30000);
  }
  
  // Run database migrations
  console.log('Running database migrations...');
  await exec('alembic', ['upgrade', 'head']);
}

/**
 * Setup test server
 */
async function setupTestServer() {
  // Check if server is already running
  try {
    const response = await fetch('http://localhost:8000/api/v1/health');
    if (response.ok) {
      console.log('Test server already running');
      return;
    }
  } catch (error) {
    // Server not running, continue with setup
  }
  
  // Start test server in background
  if (process.env.START_TEST_SERVER === 'true') {
    console.log('Starting test server...');
    const { spawn } = await import('child_process');
    
    const server = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://test:test@localhost:5433/lora_manager_test'
      },
      detached: true,
      stdio: 'ignore'
    });
    
    server.unref();
    
    // Wait for server to be ready
    await waitForService('http://localhost:8000/api/v1/health', 30000);
  }
}

/**
 * Setup test data
 */
async function setupTestData() {
  const baseURL = 'http://localhost:8000/api/v1';
  
  // Create test users
  try {
    await fetch(`${baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testuser',
        email: 'test@example.com',
        password: 'test123'
      })
    });
    console.log('Test user created');
  } catch (error) {
    console.log('Test user may already exist');
  }
  
  // Create test admin user
  try {
    await fetch(`${baseURL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        email: 'admin@example.com',
        password: 'admin123',
        is_admin: true
      })
    });
    console.log('Test admin user created');
  } catch (error) {
    console.log('Test admin user may already exist');
  }
  
  // Create test LoRAs
  try {
    const testLoRAs = [
      {
        name: 'Test Character LoRA',
        description: 'A test character LoRA for E2E testing',
        type: 'character',
        tags: ['test', 'character', 'anime'],
        path: '/test/character.safetensors'
      },
      {
        name: 'Test Style LoRA',
        description: 'A test style LoRA for E2E testing',
        type: 'style',
        tags: ['test', 'style', 'artistic'],
        path: '/test/style.safetensors'
      }
    ];
    
    for (const lora of testLoRAs) {
      await fetch(`${baseURL}/loras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lora)
      });
    }
    console.log('Test LoRAs created');
  } catch (error) {
    console.log('Test LoRAs may already exist');
  }
}

/**
 * Verify application is working
 */
async function verifyApplication() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Check main page loads
    await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });
    
    // Check API is responding
    const response = await page.request.get('http://localhost:8000/api/v1/health');
    if (!response.ok()) {
      throw new Error(`API health check failed: ${response.status()}`);
    }
    
    // Check main navigation is present
    const nav = await page.locator('nav').count();
    if (nav === 0) {
      throw new Error('Main navigation not found');
    }
    
    console.log('Application verification successful');
  } finally {
    await browser.close();
  }
}

/**
 * Wait for service to be available
 */
async function waitForService(url, timeout = 30000) {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Service not ready yet, continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Service at ${url} not ready after ${timeout}ms`);
}

export default globalSetup;
