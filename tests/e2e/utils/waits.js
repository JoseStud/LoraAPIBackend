import { expect, test } from '@playwright/test';

const isJobEndpoint = (url) => url.includes('/generation/jobs/active');

const importExportLoadingSelector = '[data-testid="import-export-loading"]';

export const waitForJobQueueBootstrap = async (page) => {
    await test.step('Synchronize with job queue status endpoints', async () => {
        let websocketListener;

        const websocketHandshake = new Promise((resolve) => {
            websocketListener = (ws) => {
                const url = ws.url();
                if (isJobEndpoint(url) || url.includes('/generation')) {
                    page.off('websocket', websocketListener);
                    resolve(true);
                }
            };

            page.on('websocket', websocketListener);
        });

        const statusPoll = page
            .waitForResponse(
                (response) => {
                    const url = response.url();
                    const method = response.request().method();
                    return method === 'GET' && isJobEndpoint(url);
                },
                { timeout: 5000 },
            )
            .then(() => true)
            .catch(() => false);

        try {
            await Promise.race([websocketHandshake, statusPoll]);
        } finally {
            if (websocketListener) {
                page.off('websocket', websocketListener);
            }
        }
    });
};

export const waitForImportExportHydration = async (page) => {
    await test.step('Wait for import/export console hydration', async () => {
        await page.waitForSelector(importExportLoadingSelector, { state: 'attached' });
        await expect(page.locator(importExportLoadingSelector)).toBeVisible();
        await page.waitForSelector(importExportLoadingSelector, { state: 'detached' });
    });
};
