import type { CompositionEntry } from '@/types';

export const cloneCompositionEntries = (entries: CompositionEntry[]): CompositionEntry[] =>
  entries.map((entry) => ({ ...entry }));

export const countActiveLoras = (entries: CompositionEntry[]): number => entries.length;
