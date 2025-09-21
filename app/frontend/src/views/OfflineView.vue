<template>
  <div class="offline-page min-h-screen bg-slate-50 py-12">
    <div v-if="!isInitialized" class="py-12 text-center text-slate-500">
      <svg class="mx-auto mb-4 h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25" />
        <path d="M4 12a8 8 0 0 1 8-8" stroke-width="4" class="opacity-75" />
      </svg>
      <div>Preparing offline mode...</div>
    </div>

    <div v-else class="mx-auto flex w-full max-w-md flex-col items-center gap-8 px-4 text-center">
      <div>
        <svg class="mx-auto h-24 w-24 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M8.111 16.404a5.5 5.5 0 0 1 7.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
          />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 8L6 20" />
        </svg>
      </div>

      <div>
        <h1 class="mb-4 text-3xl font-bold text-slate-900">You're Offline</h1>
        <p class="text-base text-slate-600">
          No internet connection detected. You can continue working with cached content until connectivity is restored.
        </p>
      </div>

      <div class="w-full rounded-lg p-4" :class="statusBoxClass">
        <div class="flex items-center justify-center gap-2">
          <span class="inline-flex h-3 w-3 rounded-full" :class="statusIndicatorClass" />
          <span class="font-medium" :class="statusTextClass">{{ connectionStatusLabel }}</span>
        </div>
        <p class="mt-2 text-sm" :class="statusSubtextClass">{{ statusHelperText }}</p>
        <p v-if="lastCheckedLabel" class="mt-1 text-xs text-slate-500">Last checked {{ lastCheckedLabel }}.</p>
        <p v-if="offlineDurationLabel" class="mt-1 text-xs text-slate-500">Offline for {{ offlineDurationLabel }}.</p>
      </div>

      <div class="w-full space-y-3">
        <h2 class="text-left text-xl font-semibold text-slate-900">Available Offline</h2>
        <OfflineFeatureCard
          v-for="feature in offlineFeatures"
          :key="feature.title"
          :title="feature.title"
          :description="feature.description"
          :icon-path="feature.iconPath"
          :icon-color="feature.iconColor"
          :cta-label="feature.ctaLabel"
          @cta="feature.onClick()"
        />
      </div>

      <div class="w-full space-y-3">
        <button class="btn btn-primary w-full" type="button" :disabled="isChecking" @click="checkConnection">
          <template v-if="!isChecking">Check Connection</template>
          <template v-else>
            <span class="flex items-center justify-center gap-2">
              <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z" />
              </svg>
              Checking...
            </span>
          </template>
        </button>
        <button class="btn btn-secondary w-full" type="button" @click="goToPage('/')">Go to Dashboard</button>
      </div>

      <div class="w-full rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm text-blue-800">
        <h3 class="mb-2 font-medium text-blue-900">💡 Offline Tips</h3>
        <ul class="list-disc space-y-1 pl-4">
          <li>Your work is automatically saved locally.</li>
          <li>Changes will sync when you're back online.</li>
          <li>Install the app for better offline experience.</li>
          <li>Clear the browser cache if you run into issues.</li>
        </ul>
      </div>

      <div class="text-xs text-slate-500">
        Cached content: {{ cacheSizeLabel }} · Queued actions: {{ queuedActions }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import OfflineFeatureCard from '@/components/OfflineFeatureCard.vue';

interface OfflineStatusSnapshot {
  cacheSize?: number;
  queuedActions?: number;
  offlineSince?: string | number | Date;
}

const router = useRouter();

const isInitialized = ref(false);
const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
const isChecking = ref(false);
const lastChecked = ref<Date | null>(null);
const offlineSince = ref<Date | null>(isOnline.value ? null : new Date());
const queuedActions = ref(0);
const cacheSummary = ref({ bytes: 0, entries: 0 });
const now = ref(Date.now());

let timer: ReturnType<typeof setInterval> | null = null;

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'No cached content';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatRelative = (date: Date): string => {
  const diffMs = Math.max(0, now.value - date.getTime());
  const diffSeconds = Math.round(diffMs / 1000);
  if (diffSeconds < 30) return 'moments ago';
  if (diffSeconds < 90) return 'about a minute ago';
  if (diffSeconds < 3600) return `${Math.round(diffSeconds / 60)} minutes ago`;
  if (diffSeconds < 5400) return 'about an hour ago';
  if (diffSeconds < 86400) return `${Math.round(diffSeconds / 3600)} hours ago`;
  const days = Math.round(diffSeconds / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const cacheSizeLabel = computed(() => formatBytes(cacheSummary.value.bytes));

const lastCheckedLabel = computed(() => (lastChecked.value ? formatRelative(lastChecked.value) : ''));
const offlineDurationLabel = computed(() => (offlineSince.value ? formatRelative(offlineSince.value) : ''));

const statusBoxClass = computed(() =>
  isOnline.value ? 'border border-green-200 bg-green-100' : 'border border-yellow-200 bg-yellow-100'
);
const statusIndicatorClass = computed(() => (isOnline.value ? 'bg-green-500' : 'bg-yellow-500'));
const statusTextClass = computed(() => (isOnline.value ? 'text-green-800' : 'text-yellow-800'));
const statusSubtextClass = computed(() => (isOnline.value ? 'text-green-700' : 'text-yellow-700'));
const connectionStatusLabel = computed(() => (isOnline.value ? 'Online' : 'Offline'));
const statusHelperText = computed(() =>
  isOnline.value ? 'Back online. Synchronizing cached data…' : 'Working in offline mode with cached data.'
);

const offlineFeatures = computed(() => {
  const localDataDescription = `Approx. ${cacheSizeLabel.value} of cached content`;
  return [
    {
      title: 'Cached LoRAs',
      description: 'Browse previously loaded models',
      iconPath:
        'M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10',
      iconColor: 'text-blue-500',
      ctaLabel: 'View',
      onClick: () => goToPage('/loras'),
    },
    {
      title: 'Generated Images',
      description: 'View cached generation results',
      iconPath:
        'M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2 1.586-1.586a2 2 0 0 1 2.828 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
      iconColor: 'text-green-500',
      ctaLabel: 'View',
      onClick: () => goToPage('/generate'),
    },
    {
      title: 'Compositions',
      description: 'Access saved prompts and settings',
      iconPath: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 1 1 3.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
      iconColor: 'text-purple-500',
      ctaLabel: 'View',
      onClick: () => goToPage('/compose'),
    },
    {
      title: 'Local Data',
      description: localDataDescription,
      iconPath:
        'M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z',
      iconColor: 'text-orange-500',
      ctaLabel: 'Details',
      onClick: showCacheDetails,
    },
  ];
});

const updateOfflineStats = (snapshot?: OfflineStatusSnapshot) => {
  const offlineApi = (globalThis as typeof globalThis & {
    pwaOffline?: { getOfflineStatus?: () => OfflineStatusSnapshot };
  }).pwaOffline;

  const data = snapshot ?? offlineApi?.getOfflineStatus?.();
  if (!data) return;

  if (typeof data.cacheSize === 'number' && data.cacheSize >= 0) {
    cacheSummary.value = { ...cacheSummary.value, bytes: data.cacheSize };
  }
  if (typeof data.queuedActions === 'number' && data.queuedActions >= 0) {
    queuedActions.value = data.queuedActions;
  }
  if (data.offlineSince) {
    const parsed = new Date(data.offlineSince);
    if (!Number.isNaN(parsed.getTime())) {
      offlineSince.value = parsed;
    }
  }
};

const computeCacheUsage = async () => {
  if (typeof caches === 'undefined') {
    updateOfflineStats();
    return;
  }

  try {
    const names = await caches.keys();
    let bytes = 0;
    let entries = 0;

    await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        entries += requests.length;
        await Promise.all(
          requests.map(async (request) => {
            const response = await cache.match(request);
            if (response) {
              const buffer = await response.clone().arrayBuffer().catch(() => null);
              if (buffer) {
                bytes += buffer.byteLength;
              }
            }
          })
        );
      })
    );

    cacheSummary.value = { bytes, entries };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to inspect cache storage', error);
    }
  } finally {
    updateOfflineStats();
  }
};

const updateOnlineState = (value: boolean) => {
  isOnline.value = value;
  if (!value) {
    offlineSince.value = offlineSince.value ?? new Date();
  } else {
    offlineSince.value = null;
  }
  updateOfflineStats();
};

const onOnline = () => updateOnlineState(true);
const onOffline = () => updateOnlineState(false);

const goToPage = (path: string) => {
  router.push(path).catch(() => undefined);
};

const showCacheDetails = () => {
  if (typeof window === 'undefined') return;
  const summary = cacheSummary.value;
  const message = [
    `Cached content: ${cacheSizeLabel.value}`,
    `Stored entries: ${summary.entries}`,
    `Queued actions: ${queuedActions.value}`,
  ].join('\n');
  window.alert?.(message);
};

const checkConnection = async () => {
  if (isChecking.value) return;
  isChecking.value = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/v1/health', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    updateOnlineState(response.ok ? true : typeof navigator !== 'undefined' ? navigator.onLine : isOnline.value);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Connection check failed', error);
    }
    updateOnlineState(typeof navigator !== 'undefined' ? navigator.onLine : false);
  } finally {
    clearTimeout(timeout);
    isChecking.value = false;
    lastChecked.value = new Date();
    updateOfflineStats();
  }
};

onMounted(() => {
  updateOfflineStats();
  void computeCacheUsage();

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    timer = setInterval(() => {
      now.value = Date.now();
    }, 30000);
  }

  setTimeout(() => {
    isInitialized.value = true;
  }, 250);
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  }
  if (timer) {
    clearInterval(timer);
  }
});
</script>
