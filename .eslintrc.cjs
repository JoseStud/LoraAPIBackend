/* eslint-env node */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = __dirname;
const featuresRoot = path.join(repoRoot, 'app', 'frontend', 'src', 'features');

const listFeatureDirectories = () => {
  try {
    return fs
      .readdirSync(featuresRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    console.warn('[eslint] Failed to enumerate feature directories', error);
    return [];
  }
};

const generationStoreRestriction = {
  group: ['@/features/generation/stores/**'],
  message:
    'Generation stores are internal. Import `useGenerationOrchestratorFacade` from "@/features/generation/orchestrator" instead.',
};

const featureUiRestriction = {
  group: ['@/features/*/ui', '@/features/*/ui/**'],
  message:
    'Import feature UI modules via the public surface, e.g. "@/features/<feature>/public".',
};

const featurePublicRestriction = {
  group: ['@/features/*/**', '!@/features/*/public', '!@/features/*/public/**'],
  message: 'Feature internals are private. Import from "@/features/<feature>/public" instead.',
};

const backendClientRestriction = {
  name: '@/services/backendClient',
  message:
    'The legacy BackendClient surface is deprecated. Route HTTP access through the API client or shared helpers instead.',
};

const requestConfiguredJsonRestriction = {
  name: '@/services/apiClient',
  importNames: ['requestConfiguredJson'],
  message:
    'requestConfiguredJson is deprecated. Use performConfiguredRequest or the composable API helpers instead.',
};

const restrictedImportRuleConfig = {
  paths: [
    {
      name: '@/components/compose',
      message:
        'Import compose helpers from the prompt composer feature barrels instead of the legacy components path.',
    },
    {
      name: '@/stores/generationQueue',
      message:
        'Route generation queue access through the orchestrator facade instead of the legacy store entry.',
    },
    {
      name: '@/stores/generationResults',
      message:
        'Route generation result access through the orchestrator facade instead of the legacy store entry.',
    },
    {
      name: '@/components/import-export',
      message:
        'Import the import/export feature through "@/features/import-export/public" instead of the legacy components path.',
    },
    backendClientRestriction,
    requestConfiguredJsonRestriction,
  ],
  patterns: [
    {
      group: ['@/composables/*/*', '@/composables/*/**'],
      message: "Import composables via the feature barrel, e.g. '@/composables/<feature>'.",
    },
    {
      group: ['@/services/generation/*'],
      message: "Import from the generation services barrel: '@/services/generation'.",
    },
    {
      group: [
        '@/services/generation',
        '@/services/system',
        '@/services/lora',
        '@/services/history',
      ],
      message: "Prefer the root services barrel: '@/services'.",
    },
    {
      group: ['@/services/systemService'],
      message: "Import from the system services barrel: '@/services/system'.",
    },
    {
      group: ['@/services/loraService'],
      message: "Import from the lora services barrel: '@/services/lora'.",
    },
    {
      group: ['@/services/historyService'],
      message: "Import from the history services barrel: '@/services/history'.",
    },
    {
      group: [
        '@/stores/adminMetrics',
        '@/stores/settings',
        '@/stores/app',
      ],
      message: "Import stores from the root barrel: '@/stores'.",
    },
    {
      group: ['@/stores/generation/*'],
      message:
        'Generation stores are internal modules. Import the orchestrator facade from "@/features/generation/orchestrator".',
    },
    {
      group: ['@/components/import-export/**'],
      message:
        'Import the import/export feature through "@/features/import-export/public" instead of the legacy components path.',
    },
    generationStoreRestriction,
    featureUiRestriction,
    featurePublicRestriction,
  ],
};

const createRestrictedImportConfig = ({ excludePatterns = [], excludePaths = [] } = {}) => ({
  ...restrictedImportRuleConfig,
  paths: restrictedImportRuleConfig.paths.filter((entry) => !excludePaths.includes(entry)),
  patterns: restrictedImportRuleConfig.patterns.filter((entry) => !excludePatterns.includes(entry)),
});

const featureDirectories = listFeatureDirectories();

const createFeatureOverride = (feature) => {
  const files = [`app/frontend/src/features/${feature}/**/*.{ts,tsx,js,vue}`];
  const excludePatterns = [featurePublicRestriction];

  if (feature === 'generation') {
    excludePatterns.push(generationStoreRestriction);
  }

  return {
    files,
    rules: {
      'no-restricted-imports': ['error', createRestrictedImportConfig({ excludePatterns })],
    },
  };
};

const backendClientAllowedFiles = [
  'app/frontend/src/components/dashboard/DashboardGenerationSummary.vue',
  'app/frontend/src/composables/import-export/useBackupWorkflow.ts',
  'app/frontend/src/composables/import-export/useExportWorkflow.ts',
  'app/frontend/src/composables/import-export/useImportWorkflow.ts',
  'app/frontend/src/features/analytics/services/analyticsService.ts',
  'app/frontend/src/features/analytics/stores/performanceAnalytics.ts',
  'app/frontend/src/features/generation/services/generationBackendClient.ts',
  'app/frontend/src/features/generation/stores/systemStatusController.ts',
  'app/frontend/src/features/history/composables/useGenerationHistory.ts',
  'app/frontend/src/features/history/composables/useHistoryActions.ts',
  'app/frontend/src/features/history/services/historyService.ts',
  'app/frontend/src/features/lora/composables/lora-gallery/useLoraCardActions.ts',
  'app/frontend/src/features/lora/services/lora/loraService.ts',
  'app/frontend/src/features/lora/stores/adapterCatalog.ts',
  'app/frontend/src/services/shared/backendHelpers.ts',
  'app/frontend/src/services/system/systemService.ts',
];

const createBackendClientOverride = (file) => {
  const excludePatterns = [];

  const relativeToFeatures = path.relative(path.join(repoRoot, 'app/frontend/src/features'), path.join(repoRoot, file));
  if (!relativeToFeatures.startsWith('..')) {
    excludePatterns.push(featurePublicRestriction);

    if (relativeToFeatures.startsWith(`generation${path.sep}`)) {
      excludePatterns.push(generationStoreRestriction);
    }
  }

  return {
    files: [file],
    rules: {
      'no-restricted-imports': [
        'error',
        createRestrictedImportConfig({
          excludePatterns,
          excludePaths: [backendClientRestriction],
        }),
      ],
    },
  };
};

module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-essential',
    '@vue/eslint-config-typescript',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'no-debugger': 'error',
    'prefer-const': 'warn',
    'no-var': 'error',
    'vue/multi-word-component-names': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    // Enforce barrel imports for composables and generation services
    // Prefer: '@/composables/<feature>' and '@/services/generation'
    // Avoid: '@/composables/<feature>/SomeFile' and '@/services/generation/<file>'
    'no-restricted-imports': ['error', restrictedImportRuleConfig],
  },
  overrides: [
    {
      files: ['app/frontend/static/js/**/*.js'],
      env: {
        browser: true,
        es2021: true,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
    {
      files: ['app/frontend/static/**/*.js'],
      env: {
        browser: true,
        es2021: true,
        serviceworker: true,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
    ...featureDirectories.map(createFeatureOverride),
    ...backendClientAllowedFiles.map(createBackendClientOverride),
    {
      files: ['app/frontend/src/utils/freezeDeep.ts'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'dist/',
    'vendor/',
    '*.min.js',
    'tests/',
    'tmp_copytest.js',
    'tmp_copytest2.js',
  ],
};
