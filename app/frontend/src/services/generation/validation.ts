import { GenerationJobStatusSchema, GenerationResultSchema } from '@/schemas';
import type { GenerationJobStatus, GenerationResult } from '@/types';

export const ensureArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

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

const formatContext = (baseContext: string, index: number): string => `${baseContext} #${index}`;

export const parseGenerationJobStatuses = (
  value: unknown,
  context = 'generation job',
): GenerationJobStatus[] => {
  const entries = ensureArray<unknown>(value);
  const parsed: GenerationJobStatus[] = [];

  entries.forEach((entry, index) => {
    const result = GenerationJobStatusSchema.safeParse(entry);
    if (result.success) {
      parsed.push(result.data);
    } else {
      logValidationIssues(formatContext(context, index), result.error, entry);
    }
  });

  return parsed;
};

export const parseGenerationResults = (
  value: unknown,
  context = 'generation result',
): GenerationResult[] => {
  const entries = ensureArray<unknown>(value);
  const parsed: GenerationResult[] = [];

  entries.forEach((entry, index) => {
    const result = GenerationResultSchema.safeParse(entry);
    if (result.success) {
      parsed.push(result.data);
    } else {
      logValidationIssues(formatContext(context, index), result.error, entry);
    }
  });

  return parsed;
};
