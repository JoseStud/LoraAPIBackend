import { onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue';

type Identifier = string | number;

export interface UseHistoryShortcutsOptions {
  isModalOpen: Ref<boolean>;
  selectedItems: Ref<Identifier[]>;
  selectableIds: ComputedRef<Identifier[]>;
  onDeleteSelected: () => void | Promise<void>;
  onClearSelection: () => void;
  onCloseModal?: () => void;
  target?: Document | null;
}

export interface UseHistoryShortcuts {
  handleKeydown: (event: KeyboardEvent) => void;
  unregister: () => void;
}

const getDocument = (target?: Document | null): Document | null => {
  if (target) {
    return target;
  }

  if (typeof document !== 'undefined') {
    return document;
  }

  return null;
};

export const useHistoryShortcuts = (options: UseHistoryShortcutsOptions): UseHistoryShortcuts => {
  const doc = getDocument(options.target);

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (options.isModalOpen.value) {
        options.onCloseModal?.();
        return;
      }

      if (options.selectedItems.value.length > 0) {
        options.onClearSelection();
      }

      return;
    }

    if (event.key === 'Delete' && options.selectedItems.value.length > 0) {
      options.onDeleteSelected();
      return;
    }

    if (event.key.toLowerCase() === 'a' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      const unique = new Set<Identifier>(options.selectableIds.value);
      options.selectedItems.value.forEach((item) => unique.add(item));
      options.selectedItems.value = Array.from(unique);
    }
  };

  const register = () => {
    if (!doc) {
      return;
    }

    doc.addEventListener('keydown', handleKeydown);
  };

  const unregister = () => {
    if (!doc) {
      return;
    }

    doc.removeEventListener('keydown', handleKeydown);
  };

  onMounted(register);
  onUnmounted(unregister);

  return {
    handleKeydown,
    unregister,
  };
};
