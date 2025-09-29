<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Dashboard Overview"
      subtitle="Monitor system health, track jobs, and explore LoRA insights at a glance."
    >
      <template #actions>
        <div class="flex gap-2">
          <RouterLink class="btn btn-secondary btn-sm" to="/loras">
            Browse LoRAs
          </RouterLink>
          <RouterLink class="btn btn-primary btn-sm" to="/generate">
            Open Generation Studio
          </RouterLink>
        </div>
      </template>
    </PageHeader>

    <section class="grid gap-6 lg:grid-cols-2">
      <SystemStatusCard variant="detailed" />
      <SystemAdminStatusCard />
    </section>

    <section class="grid gap-6 lg:grid-cols-2">
      <JobQueue :show-clear-completed="true" />
      <RecommendationsPanel />
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <DashboardLoraSummary />
      <DashboardGenerationSummary />
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <template v-for="panel in panels" :key="panel.key">
        <DashboardLazyModuleCard
          :title="panel.title"
          :description="panel.description"
          :route="panel.route"
          :cta-label="panel.ctaLabel"
          :is-active="panelStates[panel.key].active"
          :is-loading="panelStates[panel.key].loading"
          @toggle="handlePanelToggle(panel.key)"
        >
          <template #placeholder>
            {{ panel.placeholder }}
          </template>
          <Suspense
            @pending="() => setPanelState(panel.key, { loading: true })"
            @resolve="() => setPanelState(panel.key, { loading: false, hasEverLoaded: true })"
          >
            <template #default>
              <component :is="panel.component" v-bind="panel.componentProps" />
            </template>
            <template #fallback>
              <div class="flex items-center justify-center py-6 text-sm text-gray-500">
                <span class="loading loading-spinner loading-sm mr-2"></span>
                {{ panel.fallback }}
              </div>
            </template>
          </Suspense>
        </DashboardLazyModuleCard>
        <SystemStatusPanel v-if="panel.key === 'analytics'" key="system-status-panel" />
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, reactive } from 'vue';
import type { AsyncComponentLoader, Component } from 'vue';
import { RouterLink } from 'vue-router';

import DashboardGenerationSummary from '@/components/dashboard/DashboardGenerationSummary.vue';
import DashboardLazyModuleCard from '@/components/dashboard/DashboardLazyModuleCard.vue';
import DashboardLoraSummary from '@/components/dashboard/DashboardLoraSummary.vue';
import JobQueue from '@/components/shared/JobQueue.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import RecommendationsPanel from '@/components/recommendations/RecommendationsPanel.vue';
import SystemAdminStatusCard from '@/components/system/SystemAdminStatusCard.vue';
import SystemStatusCard from '@/components/system/SystemStatusCard.vue';
import SystemStatusPanel from '@/components/system/SystemStatusPanel.vue';

type PanelKey = 'analytics' | 'composer' | 'studio' | 'gallery' | 'history' | 'importExport';

type PanelState = { active: boolean; loading: boolean; hasEverLoaded: boolean };

type PanelConfig = {
  key: PanelKey;
  title: string;
  description: string;
  route: string;
  ctaLabel: string;
  placeholder: string;
  fallback: string;
  loader: AsyncComponentLoader<Component>;
  componentProps?: Record<string, unknown>;
};

const panelConfigs = [
  {
    key: 'analytics',
    title: 'Performance analytics',
    description: 'Visualize trends and KPI insights from the analytics suite.',
    route: '/analytics',
    ctaLabel: 'Open analytics',
    placeholder:
      'Load the analytics module inline or open the dedicated analytics page for the complete dashboard.',
    fallback: 'Loading analytics…',
    loader: () => import('@/views/analytics/PerformanceAnalyticsPage.vue').then((module) => module.default),
    componentProps: { showPageHeader: false, showSystemStatus: false },
  },
  {
    key: 'composer',
    title: 'Prompt composer',
    description: 'Draft prompts and queue presets without leaving this page.',
    route: '/compose',
    ctaLabel: 'Open composer',
    placeholder:
      'Activate the composer inline to reuse saved prompts or jump directly to the full composition workspace.',
    fallback: 'Loading prompt composer…',
    loader: () => import('@/components/compose/PromptComposer.vue').then((module) => module.default),
  },
  {
    key: 'studio',
    title: 'Generation studio',
    description: 'Run complex jobs with live queue monitoring and inline previews.',
    route: '/generate',
    ctaLabel: 'Open studio',
    placeholder:
      'Use the inline studio for quick jobs or switch to the dedicated page for the full orchestrator experience.',
    fallback: 'Loading generation studio…',
    loader: () => import('@/components/generation/GenerationStudio.vue').then((module) => module.default),
  },
  {
    key: 'gallery',
    title: 'LoRA gallery',
    description: 'Review adapters, apply tags, and launch bulk operations.',
    route: '/loras',
    ctaLabel: 'Open gallery',
    placeholder:
      'Quickly browse the gallery inline or open the dedicated gallery for the full management toolkit.',
    fallback: 'Loading LoRA gallery…',
    loader: () => import('@/components/lora-gallery/LoraGallery.vue').then((module) => module.default),
  },
  {
    key: 'history',
    title: 'Generation history',
    description: 'Audit completed jobs, manage favorites, and export images.',
    route: '/history',
    ctaLabel: 'Open history',
    placeholder:
      'Load a lightweight history viewer inline or head to the history page for advanced filtering and exports.',
    fallback: 'Loading generation history…',
    loader: () => import('@/components/history/GenerationHistory.vue').then((module) => module.default),
  },
  {
    key: 'importExport',
    title: 'Import & export',
    description: 'Manage backups and move adapters between environments.',
    route: '/import-export',
    ctaLabel: 'Open tools',
    placeholder:
      'Bring the import/export utilities inline for quick actions or open the dedicated workspace for bulk jobs.',
    fallback: 'Loading import/export tools…',
    loader: () => import('@/components/import-export/ImportExportContainer.vue').then((module) => module.default),
  },
] satisfies PanelConfig[];

const panels = panelConfigs.map((panel) => ({
  ...panel,
  component: defineAsyncComponent(panel.loader),
}));

const panelStates = reactive<Record<PanelKey, PanelState>>(
  panels.reduce((state, panel) => {
    state[panel.key] = { active: false, loading: false, hasEverLoaded: false };
    return state;
  }, {} as Record<PanelKey, PanelState>),
);

const setPanelState = (key: PanelKey, updates: Partial<PanelState>) => {
  const state = panelStates[key];
  if (!state) {
    return;
  }
  Object.assign(state, updates);
};

const handlePanelToggle = (key: PanelKey) => {
  const state = panelStates[key];
  if (!state) {
    return;
  }

  if (state.active) {
    setPanelState(key, { active: false, loading: false });
    return;
  }

  setPanelState(key, { active: true, loading: !state.hasEverLoaded });
};
</script>
