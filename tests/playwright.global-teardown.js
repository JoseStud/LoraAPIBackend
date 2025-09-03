/**
 * Playwright Global Teardown
 * Runs once after all tests
 */

async function globalTeardown() {
  console.log('🧹 Starting global test teardown...');
  
  // Cleanup test data
  try {
    await cleanupTestData();
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.warn('⚠️ Test data cleanup failed:', error.message);
  }
  
  // Stop test server if we started it
  try {
    await stopTestServer();
    console.log('✅ Test server stopped');
  } catch (error) {
    console.warn('⚠️ Test server stop failed:', error.message);
  }
  
  // Stop test database if we started it
  try {
    await stopTestDatabase();
    console.log('✅ Test database stopped');
  } catch (error) {
    console.warn('⚠️ Test database stop failed:', error.message);
  }
  
  // Generate test reports
  try {
    await generateTestReports();
    console.log('✅ Test reports generated');
  } catch (error) {
    console.warn('⚠️ Test report generation failed:', error.message);
  }
  
  console.log('🎉 Global test teardown completed');
}

/**
 * Cleanup test data
 */
async function cleanupTestData() {
  const baseURL = 'http://localhost:8000/api/v1';
  
  try {
    // Only cleanup if we're in test environment
    if (process.env.NODE_ENV !== 'test') {
      console.log('Skipping test data cleanup (not in test environment)');
      return;
    }
    
    // Delete test LoRAs
    const lorasResponse = await fetch(`${baseURL}/loras?tags=test`);
    if (lorasResponse.ok) {
      const loras = await lorasResponse.json();
      
      for (const lora of loras.loras || []) {
        await fetch(`${baseURL}/loras/${lora.id}`, {
          method: 'DELETE'
        });
      }
      console.log('Test LoRAs deleted');
    }
    
    // Delete test users
    try {
      await fetch(`${baseURL}/admin/users/testuser`, {
        method: 'DELETE'
      });
      await fetch(`${baseURL}/admin/users/admin`, {
        method: 'DELETE'
      });
      console.log('Test users deleted');
    } catch (error) {
      console.log('Test users may not exist or deletion not implemented');
    }
    
  } catch (error) {
    console.warn('Could not cleanup test data:', error.message);
  }
}

/**
 * Stop test server
 */
async function stopTestServer() {
  if (process.env.START_TEST_SERVER !== 'true') {
    console.log('Test server was not started by this process');
    return;
  }
  
  // Try to gracefully stop the server
  try {
    await fetch('http://localhost:8000/api/v1/admin/shutdown', {
      method: 'POST'
    });
    console.log('Server shutdown signal sent');
  } catch (error) {
    console.log('Could not send shutdown signal, server may already be stopped');
  }
  
  // Kill any remaining processes
  try {
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(spawn);
    
    // Kill processes using port 8000
    if (process.platform === 'win32') {
      await exec('netstat', ['-ano']).then(result => {
        const lines = result.stdout.toString().split('\n');
        const port8000Lines = lines.filter(line => line.includes(':8000'));
        
        port8000Lines.forEach(async line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid)) {
            try {
              await exec('taskkill', ['/F', '/PID', pid]);
            } catch (error) {
              // Process may already be dead
            }
          }
        });
      });
    } else {
      await exec('pkill', ['-f', 'uvicorn.*8000']);
    }
    
  } catch (error) {
    console.log('Could not kill server processes:', error.message);
  }
}

/**
 * Stop test database
 */
async function stopTestDatabase() {
  if (process.env.USE_DOCKER_DB !== 'true') {
    console.log('Test database was not started by this process');
    return;
  }
  
  try {
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(spawn);
    
    // Stop Docker containers
    console.log('Stopping test database container...');
    await exec('docker-compose', ['-f', 'docker-compose.test.yml', 'down']);
    
    // Remove test volumes if specified
    if (process.env.CLEANUP_TEST_VOLUMES === 'true') {
      await exec('docker-compose', ['-f', 'docker-compose.test.yml', 'down', '-v']);
      console.log('Test database volumes removed');
    }
    
  } catch (error) {
    console.warn('Could not stop test database:', error.message);
  }
}

/**
 * Generate test reports
 */
async function generateTestReports() {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    // Ensure reports directory exists
    const reportsDir = path.join(process.cwd(), 'tests', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    // Generate test summary
    const summary = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV,
        baseUrl: process.env.TEST_BASE_URL || 'http://localhost:8000',
        testDatabase: process.env.USE_DOCKER_DB === 'true',
        testServer: process.env.START_TEST_SERVER === 'true'
      },
      cleanup: {
        testDataCleanup: true,
        serverStopped: process.env.START_TEST_SERVER === 'true',
        databaseStopped: process.env.USE_DOCKER_DB === 'true'
      }
    };
    
    const summaryPath = path.join(reportsDir, 'test-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log(`Test summary written to ${summaryPath}`);
    
  } catch (error) {
    console.warn('Could not generate test reports:', error.message);
  }
}

/**
 * Emergency cleanup function
 */
async function emergencyCleanup() {
  console.log('🚨 Performing emergency cleanup...');
  
  try {
    const { spawn } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(spawn);
    
    // Kill all test-related processes
    if (process.platform === 'win32') {
      await exec('taskkill', ['/F', '/IM', 'python.exe']);
      await exec('taskkill', ['/F', '/IM', 'uvicorn.exe']);
    } else {
      await exec('pkill', ['-f', 'uvicorn']);
      await exec('pkill', ['-f', 'python.*app.main']);
    }
    
    // Stop all Docker containers
    await exec('docker', ['stop', '$(docker ps -q)']).catch(() => {
      // Ignore errors if no containers are running
    });
    
    console.log('Emergency cleanup completed');
  } catch (error) {
    console.error('Emergency cleanup failed:', error.message);
  }
}

// Handle process termination
process.on('SIGTERM', emergencyCleanup);
process.on('SIGINT', emergencyCleanup);
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception during teardown:', error);
  emergencyCleanup().then(() => process.exit(1));
});

export default globalTeardown;
