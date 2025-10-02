import type { DeepReadonly } from '@/utils/freezeDeep';

interface ImmutableSnapshotOptions {
  readonly depth?: number;
  readonly clone?: boolean;
}

const DEFAULT_DEPTH = 2;

const resolveBooleanFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0' || normalized === '') {
      return false;
    }
    return true;
  }

  return Boolean(value);
};

const isDevEnvironment = (): boolean => {
  try {
    const env = import.meta.env ?? {};
    if (resolveBooleanFlag(env.PROD ?? false)) {
      return false;
    }
    return resolveBooleanFlag(env.DEV ?? false);
  } catch (_error) {
    return false;
  }
};

const cloneValue = <T>(value: T, depth: number): T => {
  if (Array.isArray(value)) {
    const cloned = (value as unknown[]).map((item) =>
      depth > 0 ? cloneValue(item, depth - 1) : item,
    );
    return cloned as unknown as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const clonedObject: Record<PropertyKey, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      clonedObject[key] = depth > 0 ? cloneValue(entry, depth - 1) : entry;
    }
    return clonedObject as unknown as T;
  }

  return value;
};

const trapMutations = <T>(value: T, label: string, depth: number): T => {
  if (!isDevEnvironment()) {
    return value;
  }

  if (Array.isArray(value)) {
    const arrayValue = value as unknown as readonly unknown[];
    const clonedArray =
      depth > 0
        ? arrayValue.map((item, index) =>
            trapMutations(item, `${label}[${index}]`, depth - 1),
          )
        : Array.from(arrayValue);
    return Object.freeze(clonedArray) as unknown as T;
  }

  if (value instanceof Date || value === null || typeof value !== 'object') {
    return value;
  }

  const recordValue = value as Record<string, unknown>;
  const clonedRecord: Record<string, unknown> = depth > 0
    ? Object.fromEntries(
        Object.entries(recordValue).map(([key, entry]) => [
          key,
          trapMutations(entry, `${label}.${key}`, depth - 1),
        ]),
      )
    : { ...recordValue };

  return Object.freeze(clonedRecord) as unknown as T;
};

const createImmutableSnapshotInternal = <T>(
  value: T,
  label: string,
  { depth = DEFAULT_DEPTH, clone = false }: ImmutableSnapshotOptions = {},
): T => {
  const snapshotSource = clone ? cloneValue(value, depth) : value;
  return trapMutations(snapshotSource, label, depth);
};

export const createImmutableArraySnapshot = <T>(
  source: readonly T[],
  label: string,
  options?: ImmutableSnapshotOptions,
): readonly DeepReadonly<T>[] =>
  createImmutableSnapshotInternal(source, label, options) as readonly DeepReadonly<T>[];

export const createImmutableObjectSnapshot = <T extends Record<string, unknown>>(
  source: T,
  label: string,
  options?: ImmutableSnapshotOptions,
): DeepReadonly<T> =>
  createImmutableSnapshotInternal(source, label, options) as DeepReadonly<T>;

export const createImmutableValueSnapshot = <T>(
  value: T,
  label: string,
  options?: ImmutableSnapshotOptions,
): T => createImmutableSnapshotInternal(value, label, options);

