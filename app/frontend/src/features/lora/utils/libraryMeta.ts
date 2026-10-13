import type { AdapterRead, LoraListItem } from '@/types';

/**
 * Presentation helpers for library metadata written by the importer sidecars:
 * archetype and series tags (`archetype:Spiky-Hothead`, `series:Naruto`),
 * fixed-vocabulary appearance facets (`hair-color:black`, `outfit:hero suit`),
 * descriptive traits in `extra.archetype_axes`, trigger words and CivitAI
 * identity.
 */

/** Descriptive, free-text appearance notes (shown on the detail page). */
export const TRAIT_KEYS = ['hair', 'build', 'palette', 'costume'] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];
export type LoraTraits = Partial<Record<TraitKey, string>>;

/** Filterable appearance facets, in display order. */
export const FACET_KEYS = ['hair-color', 'hair-style', 'build', 'color', 'outfit'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];
export type LoraFacets = Partial<Record<FacetKey, string[]>>;

export const FACET_LABELS: Record<FacetKey, string> = {
  'hair-color': 'Hair colour',
  'hair-style': 'Hair style',
  build: 'Build',
  color: 'Main colours',
  outfit: 'Outfit',
};

const FACET_KEY_SET = new Set<string>(FACET_KEYS);
// Metadata tags shown through chips/facets, plus the free-text trait tags older
// sidecars wrote (shape:, palette:, costume:, hair:).
const PREFIXED_TAG_KEYS = new Set<string>([
  'archetype',
  'series',
  ...FACET_KEYS,
  'shape',
  'palette',
  'costume',
  'hair',
]);

/** CivitAI tags that describe nearly every LoRA in a character library. */
const GENERIC_TAGS = new Set([
  'anime', 'character', 'characters', 'male', 'female', 'man', 'men', 'boy', 'boys', 'girl',
  'shonen', 'lora', 'illustrious', 'sdxl', 'pony', 'style', 'concept',
]);

const words = (text: string): string[] =>
  text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

type LoraLike = Partial<
  Pick<
    AdapterRead,
    | 'name'
    | 'tags'
    | 'trained_words'
    | 'activation_text'
    | 'extra'
    | 'archetype'
    | 'civitai_model_id'
    | 'civitai_version_id'
    | 'preview_image_url'
  >
> & { preview_image?: LoraListItem['preview_image'] };

export interface LoraLibraryMeta {
  archetype: string | null;
  series: string | null;
  traits: LoraTraits;
  facets: LoraFacets;
  triggers: string[];
  /**
   * CivitAI tags worth showing: metadata tags, generic tags and tags that
   * only repeat the character or series name are left out.
   */
  displayTags: string[];
  previewImage: string | null;
  civitaiUrl: string | null;
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const splitPrefixedTag = (tag: string): [string, string] | null => {
  const index = tag.indexOf(':');
  if (index <= 0) {
    return null;
  }
  const key = tag.slice(0, index).trim().toLowerCase();
  const value = tag.slice(index + 1).trim();
  return PREFIXED_TAG_KEYS.has(key) && value ? [key, value] : null;
};

/** Turn `Cool-Sharp-Rival` into `Cool Sharp Rival`. */
export const formatArchetypeLabel = (archetype: string): string =>
  archetype.replace(/[-_]+/g, ' ').trim();

/**
 * Convert an HTML description (CivitAI ships HTML) to readable plain text.
 * Parsing uses an inert document, so scripts and handlers never run.
 */
export const htmlToPlainText = (html: string | null | undefined): string => {
  if (!html) {
    return '';
  }
  if (!/[<&]/.test(html)) {
    return html.replace(/\s+/g, ' ').trim();
  }

  const withBreaks = html.replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n');

  let text: string;
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    doc.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
    text = doc.body?.textContent ?? '';
  } else {
    text = withBreaks
      .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ');
  }

  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
};

/** Split an activation text into individual trigger phrases. */
export const splitTriggers = (text: string | null | undefined): string[] =>
  (text ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

export const buildCivitaiUrl = (
  modelId: number | null | undefined,
  versionId: number | null | undefined,
): string | null => {
  if (typeof modelId !== 'number') {
    return null;
  }
  const base = `https://civitai.com/models/${modelId}`;
  return typeof versionId === 'number' ? `${base}?modelVersionId=${versionId}` : base;
};

export const getLoraLibraryMeta = (lora: LoraLike): LoraLibraryMeta => {
  const extra = (lora.extra ?? {}) as Record<string, unknown>;
  const fromTags: Record<string, string> = {};
  const facets: LoraFacets = {};
  const plainTags: string[] = [];

  for (const tag of lora.tags ?? []) {
    const parsed = splitPrefixedTag(tag);
    if (!parsed) {
      plainTags.push(tag);
    } else if (FACET_KEY_SET.has(parsed[0])) {
      const values = (facets[parsed[0] as FacetKey] ??= []);
      if (!values.includes(parsed[1])) {
        values.push(parsed[1]);
      }
    } else {
      fromTags[parsed[0]] ??= parsed[1];
    }
  }

  // Descriptive notes; legacy sidecars carried some of them as tags.
  const axes = (extra.archetype_axes ?? {}) as Record<string, unknown>;
  const traits: LoraTraits = {};
  for (const key of TRAIT_KEYS) {
    const value = asString(axes[key]) ?? (key === 'build' ? null : fromTags[key]) ?? null;
    if (value) {
      traits[key] = value;
    }
  }

  const series = asString(extra.series) ?? fromTags.series ?? null;
  const nameWords = new Set(words(`${lora.name ?? ''} ${series ?? ''}`));
  const seen = new Set<string>();
  const displayTags = plainTags.filter((tag) => {
    const key = tag.trim().toLowerCase();
    const tagWords = words(key);
    if (!key || seen.has(key) || GENERIC_TAGS.has(key)) {
      return false;
    }
    seen.add(key);
    // "bakugo katsuki", "katsuki bakugo", "my hero academia" just repeat the card title.
    return !(tagWords.length > 0 && tagWords.every((word) => nameWords.has(word)));
  });

  const trained = (lora.trained_words ?? []).map((word) => word.trim()).filter(Boolean);
  const triggers = trained.length > 0 ? trained : splitTriggers(lora.activation_text);

  return {
    archetype: asString(lora.archetype) ?? asString(extra.archetype) ?? fromTags.archetype ?? null,
    series,
    traits,
    facets,
    triggers: Array.from(new Set(triggers)),
    displayTags,
    previewImage: asString(lora.preview_image) ?? asString(lora.preview_image_url),
    civitaiUrl: buildCivitaiUrl(lora.civitai_model_id, lora.civitai_version_id),
  };
};
