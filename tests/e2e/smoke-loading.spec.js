// Playwright smoke test: check for ReferenceError related to loading flags
// Requires Playwright installed (npm i -D @playwright/test) and the app running locally

const { test, expect } = require('@playwright/test');

// Update the URL to where your dev server runs
const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/';

test.describe('Smoke: loading flags and console errors', () => {
  test('no ReferenceError for loading during page load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (/ReferenceError: loading is not defined|loading is not defined|ReferenceError: isLoading is not defined/i.test(text)) {
          errors.push(text);
        }
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Visit a few pages that historically used loading flags
    await page.goto(new URL('/dashboard', BASE_URL).toString(), { waitUntil: 'networkidle' });
    await page.goto(new URL('/analytics', BASE_URL).toString(), { waitUntil: 'networkidle' });
    await page.goto(new URL('/history', BASE_URL).toString(), { waitUntil: 'networkidle' });

    expect(errors, 'No loading ReferenceError in console').toHaveLength(0);
  });
});
