import type { AdapterRead, LoraListItem } from '@/types';

/**
 * Presentation helpers for library metadata written by the importer sidecars:
 * archetype, series and appearance traits (tags such as `archetype:Spiky-Hothead`,
 * `series:Naruto`, `hair:blond spiky`, mirrored in `extra`), trigger words and
 * CivitAI identity.
 */

export const TRAIT_KEYS = ['shape', 'palette', 'build', 'costume', 'hair'] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];
export type LoraTraits = Partial<Record<TraitKey, string>>;

const PREFIXED_TAG_KEYS = new Set<string>(['archetype', 'series', ...TRAIT_KEYS]);

type LoraLike = Partial<
  Pick<
    AdapterRead,
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
  triggers: string[];
  /** Tags without the `key:value` metadata tags shown elsewhere. */
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
  const displayTags: string[] = [];

  for (const tag of lora.tags ?? []) {
    const parsed = splitPrefixedTag(tag);
    if (parsed) {
      fromTags[parsed[0]] ??= parsed[1];
    } else {
      displayTags.push(tag);
    }
  }

  const axes = (extra.archetype_axes ?? {}) as Record<string, unknown>;
  const traits: LoraTraits = {};
  for (const key of TRAIT_KEYS) {
    const value = asString(axes[key]) ?? fromTags[key] ?? null;
    if (value) {
      traits[key] = value;
    }
  }

  const trained = (lora.trained_words ?? []).map((word) => word.trim()).filter(Boolean);
  const triggers = trained.length > 0 ? trained : splitTriggers(lora.activation_text);

  return {
    archetype: asString(lora.archetype) ?? asString(extra.archetype) ?? fromTags.archetype ?? null,
    series: asString(extra.series) ?? fromTags.series ?? null,
    traits,
    triggers: Array.from(new Set(triggers)),
    displayTags,
    previewImage: asString(lora.preview_image) ?? asString(lora.preview_image_url),
    civitaiUrl: buildCivitaiUrl(lora.civitai_model_id, lora.civitai_version_id),
  };
};
