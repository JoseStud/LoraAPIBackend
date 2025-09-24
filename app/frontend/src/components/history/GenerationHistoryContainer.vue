<template>
  <GenerationHistoryController v-slot="{ state, actions, modal, formatDate }">
    <GenerationHistoryView
      :is-initialized="state.isInitialized.value"
      :view-mode="state.viewMode.value"
      :sort-by="state.sortBy.value"
      :selected-count="state.selectedCount.value"
      :search-term="state.searchTerm.value"
      :date-filter="state.dateFilter.value"
      :rating-filter="state.ratingFilter.value"
      :dimension-filter="state.dimensionFilter.value"
      :stats="state.stats"
      :results="state.filteredResults.value"
      :selected-set="state.selectedSet.value"
      :is-loading="state.isLoading.value"
      :has-more="state.hasMore.value"
      :format-date="formatDate"
      @update:viewMode="actions.updateViewMode($event)"
      @update:sortBy="actions.updateSortBy($event)"
      @update:searchTerm="actions.updateSearchTerm($event)"
      @update:dateFilter="actions.updateDateFilter($event)"
      @update:ratingFilter="actions.updateRatingFilter($event)"
      @update:dimensionFilter="actions.updateDimensionFilter($event)"
      @sort-change="actions.applyFilters()"
      @search="actions.debouncedApplyFilters()"
      @filters-change="actions.applyFilters()"
      @clear-filters="actions.clearFilters()"
      @selection-change="actions.onSelectionChange($event)"
      @view-result="actions.showImageModal"
      @download-result="actions.downloadImage"
      @toggle-favorite="actions.toggleFavorite"
      @reuse="actions.reuseParameters"
      @rate="actions.onRate"
      @delete-selected="actions.deleteSelected()"
      @favorite-selected="actions.favoriteSelected()"
      @export-selected="actions.exportSelected()"
      @clear-selection="actions.clearSelection()"
      @load-more="actions.loadMore()"
    />

    <HistoryModalController
      :modal-visible="modal.modalVisible.value"
      :active-result="modal.activeResult.value"
      :toast-visible="modal.toastVisible.value"
      :toast-message="modal.toastMessage.value"
      :toast-type="modal.toastType.value"
      :format-date="formatDate"
      @close="modal.closeModal()"
      @reuse="actions.handleModalReuse"
      @download="actions.handleModalDownload"
      @delete="actions.handleModalDelete"
    />
  </GenerationHistoryController>
</template>

<script setup lang="ts">
import GenerationHistoryController from './GenerationHistoryController.vue';
import GenerationHistoryView from './GenerationHistoryView.vue';
import HistoryModalController from './HistoryModalController.vue';
</script>
