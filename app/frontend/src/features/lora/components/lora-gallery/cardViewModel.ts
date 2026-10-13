import type { LoraTraits } from '../../utils/libraryMeta';

/** Display data shared by the grid and list LoRA cards. */
export type LoraCardViewModel = {
  id: string;
  name: string;
  version?: string | null;
  type?: string | null;
  /** Plain-text description (HTML already stripped). */
  description?: string | null;
  previewImage?: string | null;
  /** Tags without the archetype/series/trait metadata tags. */
  tags: string[];
  detailsUrl: string;
  qualityScore: number | null;
  archetype: string | null;
  series: string | null;
  traits: LoraTraits;
  triggers: string[];
};
