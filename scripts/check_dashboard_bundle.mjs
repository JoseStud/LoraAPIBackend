#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const distDir = path.join(projectRoot, 'app', 'dist');
const bundleReportFilename = 'bundle-inspector.json';

const runBuild = () => {
  const buildEnv = {
    ...process.env,
    VITE_ENABLE_BUNDLE_REPORT: '1',
  };

  const result = spawnSync('npx', ['vite', 'build'], {
    cwd: projectRoot,
    env: buildEnv,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    const code = typeof result.status === 'number' ? result.status : 1;
    process.exit(code);
  }
};

const normalize = (value) => value.replace(/\\/g, '/');

const findChunkByFacade = (summary, facadeSuffix) => {
  const normalizedSuffix = normalize(facadeSuffix);

  for (const [fileName, chunk] of Object.entries(summary)) {
    if (!chunk || typeof chunk !== 'object') {
      continue;
    }

    const facadeModuleId = chunk.facadeModuleId;
    if (typeof facadeModuleId !== 'string') {
      continue;
    }

    if (normalize(facadeModuleId).endsWith(normalizedSuffix)) {
      return { fileName, chunk };
    }
  }

  return null;
};

const findChunkContainingModule = (summary, moduleSuffix) => {
  const normalizedSuffix = normalize(moduleSuffix);

  for (const [fileName, chunk] of Object.entries(summary)) {
    if (!chunk || typeof chunk !== 'object') {
      continue;
    }

    const modules = Array.isArray(chunk.modules) ? chunk.modules : [];
    if (modules.some((moduleId) => normalize(moduleId).endsWith(normalizedSuffix))) {
      return { fileName, chunk };
    }
  }

  return null;
};

const collectStaticSize = (summary, fileName, seen = new Set()) => {
  if (seen.has(fileName)) {
    return 0;
  }

  seen.add(fileName);
  const chunk = summary[fileName];
  if (!chunk || typeof chunk !== 'object') {
    return 0;
  }

  const codeSize = typeof chunk.codeSize === 'number' ? chunk.codeSize : 0;
  const imports = Array.isArray(chunk.imports) ? chunk.imports : [];

  return imports.reduce((total, importFile) => total + collectStaticSize(summary, importFile, seen), codeSize);
};

try {
  runBuild();

  const summaryPath = path.join(distDir, bundleReportFilename);
  const summaryRaw = await readFile(summaryPath, 'utf8');
  const summary = JSON.parse(summaryRaw);

  const dashboardChunkEntry = findChunkByFacade(summary, 'app/frontend/src/views/DashboardView.vue');
  if (!dashboardChunkEntry) {
    throw new Error('Failed to locate the dashboard chunk in the bundle summary.');
  }

  const jobQueueChunkEntry =
    findChunkContainingModule(summary, 'app/frontend/src/features/generation/public/jobQueueWidget.ts') ??
    findChunkContainingModule(summary, 'app/frontend/src/features/generation/components/JobQueue.vue');
  if (!jobQueueChunkEntry) {
    throw new Error('Failed to locate the JobQueue widget chunk in the bundle summary.');
  }

  if (jobQueueChunkEntry.fileName === dashboardChunkEntry.fileName) {
    throw new Error('JobQueue widget is bundled with the dashboard entry and is not code-split.');
  }

  const toNormalizedModules = (chunk) =>
    (Array.isArray(chunk.modules) ? chunk.modules : []).map((moduleId) => normalize(moduleId));

  const dashboardModules = toNormalizedModules(dashboardChunkEntry.chunk);
  const jobQueueModules = toNormalizedModules(jobQueueChunkEntry.chunk);

  const forbiddenDashboardMatches = dashboardModules.filter((moduleId) =>
    moduleId.includes('/features/generation/ui/GenerationShell') ||
    moduleId.includes('/features/generation/composables/useGenerationStudioController'),
  );

  if (forbiddenDashboardMatches.length > 0) {
    throw new Error(
      `Dashboard bundle should not include studio controller modules, but found: ${forbiddenDashboardMatches.join(', ')}`,
    );
  }

  if (
    dashboardModules.some(
      (moduleId) =>
        moduleId.endsWith('/components/JobQueue.vue') ||
        moduleId.endsWith('/public/jobQueueWidget.ts'),
    )
  ) {
    throw new Error('Dashboard entry should dynamically import JobQueue widget, but it is included directly.');
  }

  const forbiddenJobQueueMatches = jobQueueModules.filter(
    (moduleId) =>
      moduleId.includes('/features/generation/ui/GenerationShell') ||
      moduleId.includes('/features/generation/composables/useGenerationStudioController'),
  );

  if (forbiddenJobQueueMatches.length > 0) {
    throw new Error(
      `JobQueue widget chunk should not include studio modules, but found: ${forbiddenJobQueueMatches.join(', ')}`,
    );
  }

  const dynamicImports = new Set(
    Array.isArray(dashboardChunkEntry.chunk.dynamicImports) ? dashboardChunkEntry.chunk.dynamicImports : [],
  );

  if (!dynamicImports.has(jobQueueChunkEntry.fileName)) {
    throw new Error('Dashboard chunk does not declare the JobQueue widget chunk as a dynamic import.');
  }

  const initialBudgetKb = Number(process.env.DASHBOARD_INITIAL_BUDGET_KB ?? '550');
  const initialBudgetBytes = initialBudgetKb * 1024;
  const initialBytes = collectStaticSize(summary, dashboardChunkEntry.fileName);

  if (initialBytes > initialBudgetBytes) {
    const sizeKb = (initialBytes / 1024).toFixed(2);
    throw new Error(
      `Dashboard initial JS size ${sizeKb}kb exceeds budget of ${initialBudgetKb}kb. Consider splitting more code.`,
    );
  }

  const toKb = (bytes) => (bytes / 1024).toFixed(2);

  console.log(
    `✅ Dashboard initial JS size: ${toKb(initialBytes)}kb (budget ${initialBudgetKb}kb).`,
  );
  console.log(
    `✅ Job queue chunk size: ${toKb(jobQueueChunkEntry.chunk.codeSize ?? 0)}kb emitted as ${jobQueueChunkEntry.fileName}.`,
  );
} catch (error) {
  console.error('❌ Bundle verification failed.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
