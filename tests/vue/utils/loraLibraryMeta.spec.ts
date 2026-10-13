import { describe, expect, it } from 'vitest';

import {
  buildCivitaiUrl,
  formatArchetypeLabel,
  getLoraLibraryMeta,
  htmlToPlainText,
  splitTriggers,
} from '@/features/lora/utils/libraryMeta';

describe('getLoraLibraryMeta', () => {
  const sidecarLora = {
    tags: [
      'anime',
      'archetype:Cool-Sharp-Rival',
      'series:Hunter x Hunter',
      'hair:white spiky',
      'male',
    ],
    trained_words: ['killua_zoldyck', ' ', 'killua_zoldyck'],
    activation_text: 'ignored when trained words exist',
    extra: { archetype_axes: { shape: 'angular', build: 'slim' } },
    archetype: null,
    civitai_model_id: 375513,
    civitai_version_id: 1153592,
    preview_image_url: 'https://image.civitai.com/k.jpeg',
  };

  it('reads archetype, series and traits from sidecar tags and extra', () => {
    const meta = getLoraLibraryMeta(sidecarLora);

    expect(meta.archetype).toBe('Cool-Sharp-Rival');
    expect(meta.series).toBe('Hunter x Hunter');
    expect(meta.traits).toEqual({ shape: 'angular', build: 'slim', hair: 'white spiky' });
    expect(meta.displayTags).toEqual(['anime', 'male']);
  });

  it('prefers the archetype column over tags', () => {
    expect(getLoraLibraryMeta({ ...sidecarLora, archetype: 'Spiky-Hothead' }).archetype).toBe(
      'Spiky-Hothead',
    );
  });

  it('dedupes trained words and falls back to activation text', () => {
    expect(getLoraLibraryMeta(sidecarLora).triggers).toEqual(['killua_zoldyck']);
    expect(
      getLoraLibraryMeta({ trained_words: [], activation_text: 'a, b ,, c' }).triggers,
    ).toEqual(['a', 'b', 'c']);
  });

  it('builds the preview and CivitAI link', () => {
    const meta = getLoraLibraryMeta(sidecarLora);
    expect(meta.previewImage).toBe('https://image.civitai.com/k.jpeg');
    expect(meta.civitaiUrl).toBe('https://civitai.com/models/375513?modelVersionId=1153592');
    // a client-side generated preview wins over the imported one
    expect(getLoraLibraryMeta({ ...sidecarLora, preview_image: 'data:x' }).previewImage).toBe('data:x');
  });

  it('copes with records that have no library metadata', () => {
    const meta = getLoraLibraryMeta({});
    expect(meta).toMatchObject({
      archetype: null,
      series: null,
      traits: {},
      triggers: [],
      displayTags: [],
      previewImage: null,
      civitaiUrl: null,
    });
  });

  it('keeps unrelated colon tags as normal tags', () => {
    expect(getLoraLibraryMeta({ tags: ['style:anime', 'hair:'] }).displayTags).toEqual([
      'style:anime',
      'hair:',
    ]);
  });
});

describe('htmlToPlainText', () => {
  it('strips markup, keeps paragraph breaks and decodes entities', () => {
    expect(htmlToPlainText('<p>Hello <b>world</b> &amp; friends</p><p>Second<br>line</p>')).toBe(
      'Hello world & friends\nSecond\nline',
    );
  });

  it('drops script and style contents instead of showing them', () => {
    const text = htmlToPlainText('<p>Safe</p><script>alert(1)</script><style>p{}</style><img src=x onerror="alert(2)">');
    expect(text).toBe('Safe');
  });

  it('passes plain text through with collapsed whitespace', () => {
    expect(htmlToPlainText('  just   text ')).toBe('just text');
    expect(htmlToPlainText(null)).toBe('');
  });
});

describe('small helpers', () => {
  it('formats archetype labels', () => {
    expect(formatArchetypeLabel('Iconic-Coat-Costume')).toBe('Iconic Coat Costume');
  });

  it('splits triggers and builds CivitAI URLs', () => {
    expect(splitTriggers(undefined)).toEqual([]);
    expect(buildCivitaiUrl(1, null)).toBe('https://civitai.com/models/1');
    expect(buildCivitaiUrl(null, 2)).toBeNull();
  });
});
