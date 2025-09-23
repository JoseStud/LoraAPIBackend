import { test, expect } from '@playwright/test';

import { waitForImportExportHydration, waitForJobQueueBootstrap } from './utils/waits.js';

test.describe('Cross-view workflows', () => {
  test('generation studio exposes queue, status, and recommendations', async ({ page }) => {
    await page.goto('/generate');

    await expect(page.getByRole('heading', { name: 'Generation Studio' })).toBeVisible();
    await expect(page.getByText('Generation Queue', { exact: false })).toBeVisible();
    await expect(page.getByText('No active generations', { exact: false })).toBeVisible();
    await expect(page.getByText('System Status', { exact: false })).toBeVisible();
    await expect(page.getByText('Recommendations', { exact: false })).toBeVisible();
  });

  test('import/export console coordinates quick actions and tabs', async ({ page }) => {
    await page.goto('/import-export');
    await waitForImportExportHydration(page);
    await waitForJobQueueBootstrap(page);

    await expect(page.getByRole('heading', { name: 'Import & Export' })).toBeVisible();

    const quickExportButton = page.getByRole('button', { name: /Quick Export All/i });
    await expect(quickExportButton).toBeVisible();
    await quickExportButton.click();

    const loraCheckbox = page.locator('label:has-text("LoRA Models") input[type="checkbox"]');
    await expect(loraCheckbox).toBeChecked();
    const generationsCheckbox = page.locator('label:has-text("Generation Results") input[type="checkbox"]');
    await expect(generationsCheckbox).toBeChecked();

    await page.getByRole('button', { name: /Import Data/i }).click();
    await expect(page.getByText('Drop files here or click to upload', { exact: false })).toBeVisible();

    await page.getByRole('button', { name: /Backup\/Restore/i }).click();
    await expect(page.getByText('No backups found. Create your first backup above.', { exact: false })).toBeVisible();

    await expect(page.getByText('Generation Queue', { exact: false })).toBeVisible();
  });
});
