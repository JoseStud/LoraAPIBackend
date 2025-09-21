import type { AdapterRead } from './lora';

export interface AdapterSummary {
  id: AdapterRead['id'];
  name: AdapterRead['name'];
  description?: AdapterRead['description'];
  active: boolean;
}

export interface CompositionEntry {
  id: AdapterRead['id'];
  name: AdapterRead['name'];
  weight: number;
}

export interface SavedComposition {
  items: CompositionEntry[];
  base: string;
  neg: string;
}

