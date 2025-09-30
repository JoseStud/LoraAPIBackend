import { GenerationJobStatusSchema, GenerationResultSchema } from '@/schemas';
import type { GenerationJobStatus, GenerationResult } from '@/types';

export const ensureArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

export const logValidationIssues = (
  context: string,
  error: unknown,
  payload: unknown,
): void => {
  if (error && typeof error === 'object' && 'issues' in error) {
    console.warn(`[generation] ${context} validation failed`, {
      issues: (error as { issues: unknown }).issues,
      payload,
    });
  } else {
    console.warn(`[generation] ${context} validation failed`, { payload, error });
  }
};

const parseCollection = <SchemaResult, Parsed>(
  value: unknown,
  context: string,
  schema: { safeParse: (input: unknown) => { success: true; data: Parsed } | { success: false; error: unknown } },
): Parsed[] => {
  const entries = ensureArray<SchemaResult>(value);
  const parsed: Parsed[] = [];
  let invalidCount = 0;

  entries.forEach((entry) => {
    const result = schema.safeParse(entry);
    if (result.success) {
      parsed.push(result.data);
    } else {
      invalidCount += 1;
      logValidationIssues(`${context} #${invalidCount}`, result.error, entry);
    }
  });

  return parsed;
};

export const parseGenerationJobStatuses = (
  value: unknown,
  context = 'generation job',
): GenerationJobStatus[] =>
  parseCollection<unknown, GenerationJobStatus>(value, context, GenerationJobStatusSchema);

export const parseGenerationResults = (
  value: unknown,
  context = 'generation result',
): GenerationResult[] =>
  parseCollection<unknown, GenerationResult>(value, context, GenerationResultSchema);

