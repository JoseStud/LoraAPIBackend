import { z } from 'zod';

import { sanitizeBackendBaseUrl } from '@/utils/backend/helpers';

const RawBackendConfigSchema = z
  .union([
    z
      .object({
        baseURL: z.unknown().optional(),
        backendUrl: z.unknown().optional(),
        apiKey: z.unknown().optional(),
        backendApiKey: z.unknown().optional(),
      })
      .passthrough(),
    z.null(),
    z.undefined(),
  ])
  .optional()
  .default({});

const NormalizedBackendConfigSchema = z.object({
  baseURL: z.string(),
  apiKey: z.string().nullable(),
});

const toNullableString = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizeBackendConfig = (
  raw: unknown,
): z.infer<typeof NormalizedBackendConfigSchema> => {
  const parsed = RawBackendConfigSchema.parse(raw) as {
    baseURL?: unknown;
    backendUrl?: unknown;
    apiKey?: unknown;
    backendApiKey?: unknown;
  };

  const baseCandidate = parsed.baseURL ?? parsed.backendUrl;
  const baseURL = sanitizeBackendBaseUrl(
    baseCandidate == null ? undefined : String(baseCandidate),
  );

  const apiKey = toNullableString(parsed.apiKey ?? parsed.backendApiKey ?? null);

  return NormalizedBackendConfigSchema.parse({
    baseURL,
    apiKey,
  });
};

export type NormalizedBackendConfig = z.infer<typeof NormalizedBackendConfigSchema>;
