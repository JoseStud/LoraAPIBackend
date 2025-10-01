/* eslint-env node */
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
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@/components/compose',
            message:
              'Import compose helpers from the prompt composer feature barrels instead of the legacy components path.',
          },
          {
            name: '@/stores/generationQueue',
            message:
              'Import generation queue state via the orchestrator manager barrels rather than the legacy store entry.',
          },
          {
            name: '@/stores/generationResults',
            message:
              'Import generation results state via the orchestrator manager barrels rather than the legacy store entry.',
          },
        ],
        patterns: [
          {
            group: ['@/composables/*/*', '@/composables/*/**'],
            message: 'Import composables via the feature barrel, e.g. \'@/composables/<feature>\'.',
          },
          {
            group: ['@/services/generation/*'],
            message: 'Import from the generation services barrel: \'@/services/generation\'.',
          },
          {
            group: [
              '@/services/generation',
              '@/services/system',
              '@/services/lora',
              '@/services/history',
            ],
            message: 'Prefer the root services barrel: \'@/services\'.',
          },
          {
            group: ['@/services/systemService'],
            message: 'Import from the system services barrel: \'@/services/system\'.',
          },
          {
            group: ['@/services/loraService'],
            message: 'Import from the lora services barrel: \'@/services/lora\'.',
          },
          {
            group: ['@/services/historyService'],
            message: 'Import from the history services barrel: \'@/services/history\'.',
          },
          {
            group: [
              '@/stores/adminMetrics',
              '@/stores/settings',
              '@/stores/app',
            ],
            message: 'Import stores from the root barrel: \'@/stores\'.',
          },
          {
            group: ['@/stores/generation/*'],
            message: 'Import generation stores via the barrel: \'@/stores/generation\'.',
          },
        ],
      },
    ],
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
