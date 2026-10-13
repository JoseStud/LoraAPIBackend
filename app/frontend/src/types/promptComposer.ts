import type { AdapterRead } from './lora';

export interface AdapterSummary {
  id: AdapterRead['id'];
  name: AdapterRead['name'];
  description?: AdapterRead['description'];
  active: boolean;
  /** Name SD.Next resolves in <lora:…> tags (the file name without suffix). */
  promptName?: string;
}

export interface CompositionEntry {
  id: AdapterRead['id'];
  name: AdapterRead['name'];
  weight: number;
  /** Name used in the <lora:…> tag; falls back to `name` for older saves. */
  promptName?: string;
}

export interface SavedComposition {
  items: CompositionEntry[];
  base: string;
  neg: string;
}

