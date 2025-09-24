export const PERSISTENCE_KEYS = {
  historyViewMode: 'history-view-mode',
  reuseParameters: 'reuse-parameters',
  generationParams: 'generation_params',
  generationPresets: 'generationPresets',
  composerPrompt: 'composerPrompt',
  loraGalleryViewMode: 'loraViewMode',
} as const;

export type PersistenceKey = (typeof PERSISTENCE_KEYS)[keyof typeof PERSISTENCE_KEYS];

export interface PersistenceValueMap {
  [PERSISTENCE_KEYS.historyViewMode]: 'grid' | 'list';
  [PERSISTENCE_KEYS.reuseParameters]: Record<string, unknown>;
  [PERSISTENCE_KEYS.generationParams]: Record<string, unknown>;
  [PERSISTENCE_KEYS.generationPresets]: unknown[];
  [PERSISTENCE_KEYS.composerPrompt]: string | null;
  [PERSISTENCE_KEYS.loraGalleryViewMode]: string;
}
