<template>
  <div
    class="rounded-xl border border-base-200 bg-base-100 p-6 shadow-sm"
    data-testid="import-export-loading"
    role="status"
    aria-live="polite"
  >
    <div class="animate-pulse space-y-6">
      <div class="h-7 w-48 rounded bg-base-200" />
      <div class="flex flex-wrap gap-3">
        <div class="h-9 w-32 rounded-full bg-base-200" />
        <div class="h-9 w-32 rounded-full bg-base-200" />
        <div class="h-9 w-32 rounded-full bg-base-200" />
        <div class="h-9 w-32 rounded-full bg-base-200" />
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-3">
          <div class="h-4 w-40 rounded bg-base-200" />
          <div class="h-20 rounded-lg bg-base-200" />
          <div class="h-4 w-28 rounded bg-base-200" />
        </div>
        <div class="space-y-3">
          <div class="h-4 w-40 rounded bg-base-200" />
          <div class="h-20 rounded-lg bg-base-200" />
          <div class="h-4 w-28 rounded bg-base-200" />
        </div>
      </div>
      <div class="h-24 rounded-lg bg-base-200" />
    </div>
  </div>
</template>
