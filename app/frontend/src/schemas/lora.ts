import { z, type ZodIssue } from 'zod';

import type {
  AdapterListQuery,
  AdapterListResponse,
  AdapterRead,
  AdapterStats,
  AdapterStatsMetric,
  LoraTagListResponse,
} from '@/types';

import { JsonObjectSchema } from './json';

export class LoraSchemaParseError extends Error {
  public readonly issues?: readonly ZodIssue[];

  constructor(message: string, options?: { cause?: unknown; issues?: readonly ZodIssue[] }) {
    super(message);
    this.name = 'LoraSchemaParseError';
    if (options?.cause !== undefined) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error Node 16 does not yet define ErrorOptions in lib.dom.d.ts
      this.cause = options.cause;
    }
    this.issues = options?.issues;
  }
}

const ADAPTER_STATS_KEYS: readonly AdapterStatsMetric[] = [
  'downloadCount',
  'favoriteCount',
  'commentCount',
  'thumbsUpCount',
  'rating',
  'ratingCount',
  'usage_count',
  'generations',
  'activations',
  'success_rate',
  'avg_time',
  'avg_generation_time',
];

const coerceFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const RequiredFiniteNumber = () =>
  z.union([z.number(), z.string()]).transform((value, ctx) => {
    const parsed = coerceFiniteNumber(value);
    if (parsed === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected a finite number' });
      return z.NEVER;
    }
    return parsed;
  });

const OptionalFiniteNumber = () =>
  z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((value, ctx) => {
    if (value == null) {
      return null;
    }
    const parsed = coerceFiniteNumber(value);
    if (parsed === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected a finite number' });
      return z.NEVER;
    }
    return parsed;
  });

const OptionalCount = () =>
  z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((value, ctx) => {
    if (value == null) {
      return undefined;
    }
    const parsed = coerceFiniteNumber(value);
    if (parsed === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Expected a numeric count' });
      return z.NEVER;
    }
    return Math.max(0, Math.trunc(parsed));
  });

const AdapterStatsSchema = z
  .union([z.record(z.unknown()), z.null(), z.undefined()])
  .transform((stats): AdapterStats | null => {
    if (!stats) {
      return null;
    }

    const normalized: AdapterStats = {};
    const record = stats as Record<string, unknown>;

    for (const metric of ADAPTER_STATS_KEYS) {
      const value = coerceFiniteNumber(record[metric]);
      if (value !== undefined) {
        normalized[metric] = value;
      }
    }

    return Object.keys(normalized).length > 0 ? normalized : {};
  });

const NullableString = z.union([z.string(), z.null()]).optional();

const OptionalStringArray = z.array(z.string()).optional().transform((value) => value ?? []);

const AdapterReadBaseSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((value) => String(value)),
    name: z.string(),
    version: NullableString,
    canonical_version_name: NullableString,
    description: NullableString,
    author_username: NullableString,
    visibility: z.string(),
    published_at: NullableString,
    tags: OptionalStringArray,
    trained_words: OptionalStringArray,
    triggers: OptionalStringArray,
    file_path: z.string(),
    weight: RequiredFiniteNumber(),
    active: z.boolean(),
    ordinal: OptionalFiniteNumber(),
    archetype: NullableString,
    archetype_confidence: OptionalFiniteNumber(),
    primary_file_name: NullableString,
    primary_file_size_kb: OptionalFiniteNumber(),
    primary_file_sha256: NullableString,
    primary_file_download_url: NullableString,
    primary_file_local_path: NullableString,
    supports_generation: z.boolean(),
    sd_version: NullableString,
    nsfw_level: RequiredFiniteNumber(),
    activation_text: NullableString,
    stats: AdapterStatsSchema,
    extra: z.union([JsonObjectSchema, z.record(z.unknown()), z.null(), z.undefined()]).transform((value) =>
      value == null ? null : (value as Record<string, unknown>),
    ),
    json_file_path: NullableString,
    json_file_mtime: NullableString,
    json_file_size: OptionalFiniteNumber(),
    last_ingested_at: NullableString,
    created_at: z.string(),
    updated_at: z.string(),
    last_updated: NullableString,
  })
  .passthrough();

export const AdapterReadSchema: z.ZodType<AdapterRead> = AdapterReadBaseSchema.transform((value) => ({
  ...value,
  ordinal: value.ordinal ?? null,
  archetype_confidence: value.archetype_confidence ?? null,
  primary_file_size_kb: value.primary_file_size_kb ?? null,
  nsfw_level: value.nsfw_level ?? 0,
  stats: value.stats ?? {},
  extra: value.extra ?? null,
  json_file_size: value.json_file_size ?? null,
  last_ingested_at: value.last_ingested_at ?? null,
  published_at: value.published_at ?? null,
  created_at: value.created_at ?? null,
  updated_at: value.updated_at ?? null,
  last_updated: value.last_updated ?? null,
}));

const AdapterListResponseBaseSchema = z
  .object({
    items: z.array(AdapterReadSchema).optional().transform((value) => value ?? []),
    total: OptionalCount(),
    filtered: OptionalCount(),
    page: OptionalCount(),
    pages: OptionalCount(),
    per_page: OptionalCount(),
  })
  .passthrough();

const AdapterListPayloadSchema = z.union([
  z.null(),
  z.undefined(),
  z.array(AdapterReadSchema),
  AdapterListResponseBaseSchema,
]);

const LoraTagListSchema: z.ZodType<LoraTagListResponse> = z
  .object({ tags: z.array(z.string()).optional() })
  .passthrough();

const formatIssues = (issues: readonly ZodIssue[]): string =>
  issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

const createParseError = (context: string, error: unknown): LoraSchemaParseError => {
  if (error instanceof z.ZodError) {
    const message = `${context} validation failed: ${formatIssues(error.issues)}`;
    console.warn(`[lora] ${context} validation failed`, { issues: error.issues });
    return new LoraSchemaParseError(message, { cause: error, issues: error.issues });
  }

  console.warn(`[lora] ${context} validation failed`, { error });
  return new LoraSchemaParseError(`${context} validation failed`, { cause: error });
};

const finalizeListResponse = (
  base: z.infer<typeof AdapterListResponseBaseSchema>,
  fallbackPage: number,
  fallbackPerPage?: number,
): AdapterListResponse => {
  const items = base.items ?? [];
  const perPage = base.per_page ?? fallbackPerPage ?? items.length;
  const total = base.total ?? items.length;
  const filtered = base.filtered ?? total;
  const page = base.page ?? fallbackPage;
  const pages = base.pages ?? (perPage > 0 ? Math.max(1, Math.ceil(filtered / perPage)) : filtered > 0 ? 1 : 0);

  return {
    items,
    total,
    filtered,
    page,
    pages,
    per_page: perPage,
  } satisfies AdapterListResponse;
};

const resolveFallbackPage = (query: AdapterListQuery): number => {
  const page = query.page;
  if (typeof page === 'number' && Number.isFinite(page)) {
    return Math.max(1, Math.trunc(page));
  }
  return 1;
};

const resolveFallbackPerPage = (query: AdapterListQuery): number | undefined => {
  const perPage = query.perPage;
  if (typeof perPage === 'number' && Number.isFinite(perPage)) {
    return Math.max(0, Math.trunc(perPage));
  }
  return undefined;
};

export const parseAdapterRead = (value: unknown, context = 'adapter read'): AdapterRead => {
  const result = AdapterReadSchema.safeParse(value);
  if (!result.success) {
    throw createParseError(context, result.error);
  }
  return result.data;
};

export const parseAdapterListPayload = (
  value: unknown,
  query: AdapterListQuery = {},
  context = 'adapter list response',
): AdapterListResponse => {
  const result = AdapterListPayloadSchema.safeParse(value);
  if (!result.success) {
    throw createParseError(context, result.error);
  }

  const fallbackPage = resolveFallbackPage(query);
  const fallbackPerPage = resolveFallbackPerPage(query);

  const data = result.data;
  if (!data) {
    const perPage = fallbackPerPage ?? 0;
    return {
      items: [],
      total: 0,
      filtered: 0,
      page: fallbackPage,
      pages: 0,
      per_page: perPage,
    } satisfies AdapterListResponse;
  }

  if (Array.isArray(data)) {
    const items = data;
    const perPage = fallbackPerPage ?? items.length;
    const total = items.length;
    const filtered = total;
    const pages = perPage > 0 ? Math.max(1, Math.ceil(filtered / perPage)) : filtered > 0 ? 1 : 0;
    return {
      items,
      total,
      filtered,
      page: fallbackPage,
      pages,
      per_page: perPage,
    } satisfies AdapterListResponse;
  }

  return finalizeListResponse(data, fallbackPage, fallbackPerPage);
};

export const parseAdapterTags = (value: unknown, context = 'adapter tag list'): string[] => {
  const result = LoraTagListSchema.safeParse(value);
  if (!result.success) {
    throw createParseError(context, result.error);
  }

  return Array.isArray(result.data.tags) ? [...result.data.tags] : [];
};
