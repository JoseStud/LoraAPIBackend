/* eslint-disable @typescript-eslint/no-unused-vars -- Typescript-eslint crashes on DeepReadonly's recursive mapped type. */
/*
 * The utilities defined in this module intentionally rely on conditional
 * distributive types and helper aliases that appear unused at runtime. Once
 * the upstream parser handles this pattern without throwing we can re-enable
 * the rule. Until then we disable it locally so CI can run to completion.
 */

type Primitive = null | undefined | string | number | boolean | symbol | bigint;

type Builtin = Primitive | Date | RegExp | Error;

export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends (...args: any[]) => any
    ? T
    : T extends readonly (infer U)[]
      ? ReadonlyArray<DeepReadonly<U>>
      : T extends Map<infer K, infer V>
        ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : { readonly [K in keyof T]: DeepReadonly<T[K]> };

const cloneDeep = <T>(value: T, seen = new WeakMap<object, unknown>()): T => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return seen.get(value as object) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    const clonedArray = value.map((item) => cloneDeep(item, seen));
    seen.set(value as unknown as object, clonedArray);
    return clonedArray as unknown as T;
  }

  if (value instanceof Map) {
    const clonedMap = new Map();
    seen.set(value as unknown as object, clonedMap);
    value.forEach((mapValue, key) => {
      clonedMap.set(cloneDeep(key, seen), cloneDeep(mapValue, seen));
    });
    return clonedMap as unknown as T;
  }

  if (value instanceof Set) {
    const clonedSet = new Set();
    seen.set(value as unknown as object, clonedSet);
    value.forEach((setValue) => {
      clonedSet.add(cloneDeep(setValue, seen));
    });
    return clonedSet as unknown as T;
  }

  const clonedObject: Record<PropertyKey, unknown> = {};
  seen.set(value as unknown as object, clonedObject);
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
    if (!descriptor || !('value' in descriptor)) {
      continue;
    }
    clonedObject[key] = cloneDeep(descriptor.value, seen);
  }

  return clonedObject as unknown as T;
};

const freezeDeepInternal = <T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> => {
  if (value === null || typeof value !== 'object') {
    return value as DeepReadonly<T>;
  }

  if (seen.has(value as object)) {
    return value as DeepReadonly<T>;
  }

  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      (value as unknown as unknown[])[index] = freezeDeepInternal(value[index], seen);
    }
  } else if (value instanceof Map) {
    const nextEntries = Array.from(value.entries()).map(([key, mapValue]) => [
      freezeDeepInternal(key, seen),
      freezeDeepInternal(mapValue, seen),
    ] as const);
    value.clear();
    nextEntries.forEach(([key, mapValue]) => {
      value.set(key, mapValue);
    });
  } else if (value instanceof Set) {
    const entries = Array.from(value.values()).map((item) => freezeDeepInternal(item, seen));
    value.clear();
    entries.forEach((entry) => {
      value.add(entry);
    });
  } else {
    for (const key of Reflect.ownKeys(value as object)) {
      const descriptor = Object.getOwnPropertyDescriptor(value as object, key);
      if (!descriptor || !('value' in descriptor)) {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      (value as Record<PropertyKey, unknown>)[key] = freezeDeepInternal(descriptor.value, seen);
    }
  }

  return Object.freeze(value) as DeepReadonly<T>;
};

export const freezeDeep = <T>(value: T): DeepReadonly<T> => {
  if (value === null || typeof value !== 'object') {
    return value as DeepReadonly<T>;
  }

  const cloned = cloneDeep(value);
  const frozen = freezeDeepInternal(cloned);

  return frozen;
};
