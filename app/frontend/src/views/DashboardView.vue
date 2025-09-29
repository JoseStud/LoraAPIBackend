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
            Launch Studio
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
      <DashboardLazyModuleCard
        title="Performance analytics"
        description="Visualize trends and KPI insights from the analytics suite."
        route="/analytics"
        cta-label="Open analytics"
        :is-active="panels.analytics.active"
        :is-loading="panels.analytics.loading"
        @toggle="togglePanel('analytics')"
      >
        <template #placeholder>
          Load the analytics module inline or open the dedicated analytics page for the complete dashboard.
        </template>
        <Suspense @pending="markPending('analytics')" @resolve="markResolved('analytics')">
          <template #default>
            <PerformanceAnalytics :show-page-header="false" :show-system-status="false" />
          </template>
          <template #fallback>
            <div class="flex items-center justify-center py-6 text-sm text-gray-500">
              <span class="loading loading-spinner loading-sm mr-2"></span>
              Loading analytics…
            </div>
          </template>
        </Suspense>
      </DashboardLazyModuleCard>
      <SystemStatusPanel />
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <DashboardLazyModuleCard
        title="Prompt composer"
        description="Draft prompts and queue presets without leaving this page."
        route="/compose"
        cta-label="Open composer"
        :is-active="panels.composer.active"
        :is-loading="panels.composer.loading"
        @toggle="togglePanel('composer')"
      >
        <template #placeholder>
          Activate the composer inline to reuse saved prompts or jump directly to the full composition workspace.
        </template>
        <Suspense @pending="markPending('composer')" @resolve="markResolved('composer')">
          <template #default>
            <PromptComposer />
          </template>
          <template #fallback>
            <div class="flex items-center justify-center py-6 text-sm text-gray-500">
              <span class="loading loading-spinner loading-sm mr-2"></span>
              Loading prompt composer…
            </div>
          </template>
        </Suspense>
      </DashboardLazyModuleCard>

      <DashboardLazyModuleCard
        title="Generation studio"
        description="Run complex jobs with live queue monitoring and inline previews."
        route="/generate"
        cta-label="Open studio"
        :is-active="panels.studio.active"
        :is-loading="panels.studio.loading"
        @toggle="togglePanel('studio')"
      >
        <template #placeholder>
          Use the inline studio for quick jobs or switch to the dedicated page for the full orchestrator experience.
        </template>
        <Suspense @pending="markPending('studio')" @resolve="markResolved('studio')">
          <template #default>
            <GenerationStudio />
          </template>
          <template #fallback>
            <div class="flex items-center justify-center py-6 text-sm text-gray-500">
              <span class="loading loading-spinner loading-sm mr-2"></span>
              Loading generation studio…
            </div>
          </template>
        </Suspense>
      </DashboardLazyModuleCard>
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <DashboardLazyModuleCard
        title="LoRA gallery"
        description="Review adapters, apply tags, and launch bulk operations."
        route="/loras"
        cta-label="Open gallery"
        :is-active="panels.gallery.active"
        :is-loading="panels.gallery.loading"
        @toggle="togglePanel('gallery')"
      >
        <template #placeholder>
          Quickly browse the gallery inline or open the dedicated gallery for the full management toolkit.
        </template>
        <Suspense @pending="markPending('gallery')" @resolve="markResolved('gallery')">
          <template #default>
            <LoraGallery />
          </template>
          <template #fallback>
            <div class="flex items-center justify-center py-6 text-sm text-gray-500">
              <span class="loading loading-spinner loading-sm mr-2"></span>
              Loading LoRA gallery…
            </div>
          </template>
        </Suspense>
      </DashboardLazyModuleCard>

      <DashboardLazyModuleCard
        title="Generation history"
        description="Audit completed jobs, manage favorites, and export images."
        route="/history"
        cta-label="Open history"
        :is-active="panels.history.active"
        :is-loading="panels.history.loading"
        @toggle="togglePanel('history')"
      >
        <template #placeholder>
          Load a lightweight history viewer inline or head to the history page for advanced filtering and exports.
        </template>
        <Suspense @pending="markPending('history')" @resolve="markResolved('history')">
          <template #default>
            <GenerationHistory />
          </template>
          <template #fallback>
            <div class="flex items-center justify-center py-6 text-sm text-gray-500">
              <span class="loading loading-spinner loading-sm mr-2"></span>
              Loading generation history…
            </div>
          </template>
        </Suspense>
      </DashboardLazyModuleCard>
    </section>

    <section class="grid gap-6">
      <DashboardLazyModuleCard
        title="Import & export"
        description="Manage backups and move adapters between environments."
        route="/import-export"
        cta-label="Open tools"
        :is-active="panels.importExport.active"
        :is-loading="panels.importExport.loading"
        @toggle="togglePanel('importExport')"
      >
        <template #placeholder>
          Bring the import/export utilities inline for quick actions or open the dedicated workspace for bulk jobs.
        </template>
        <Suspense @pending="markPending('importExport')" @resolve="markResolved('importExport')">
          <template #default>
            <ImportExportContainer />
          </template>
          <template #fallback>
            <div class="flex items-center justify-center py-6 text-sm text-gray-500">
              <span class="loading loading-spinner loading-sm mr-2"></span>
              Loading import/export tools…
            </div>
          </template>
        </Suspense>
      </DashboardLazyModuleCard>
    </section>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, reactive } from 'vue';
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

const PerformanceAnalytics = defineAsyncComponent(() =>
  import('@/views/analytics/PerformanceAnalyticsPage.vue'),
);
const PromptComposer = defineAsyncComponent(() => import('@/components/compose/PromptComposer.vue'));
const GenerationStudio = defineAsyncComponent(() => import('@/components/generation/GenerationStudio.vue'));
const LoraGallery = defineAsyncComponent(() => import('@/components/lora-gallery/LoraGallery.vue'));
const GenerationHistory = defineAsyncComponent(() => import('@/components/history/GenerationHistory.vue'));
const ImportExportContainer = defineAsyncComponent(
  () => import('@/components/import-export/ImportExportContainer.vue'),
);

type PanelKey = 'analytics' | 'composer' | 'studio' | 'gallery' | 'history' | 'importExport';

const panels = reactive<Record<PanelKey, { active: boolean; loading: boolean; hasEverLoaded: boolean }>>({
  analytics: { active: false, loading: false, hasEverLoaded: false },
  composer: { active: false, loading: false, hasEverLoaded: false },
  studio: { active: false, loading: false, hasEverLoaded: false },
  gallery: { active: false, loading: false, hasEverLoaded: false },
  history: { active: false, loading: false, hasEverLoaded: false },
  importExport: { active: false, loading: false, hasEverLoaded: false },
});

const togglePanel = (key: PanelKey) => {
  const panel = panels[key];
  if (!panel) {
    return;
  }
  if (panel.active) {
    panel.active = false;
    panel.loading = false;
    return;
  }
  panel.active = true;
  panel.loading = !panel.hasEverLoaded;
};

const markPending = (key: PanelKey) => {
  const panel = panels[key];
  if (!panel) {
    return;
  }
  panel.loading = true;
};

const markResolved = (key: PanelKey) => {
  const panel = panels[key];
  if (!panel) {
    return;
  }
  panel.loading = false;
  panel.hasEverLoaded = true;
};
</script>
