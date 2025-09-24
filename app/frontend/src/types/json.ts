/**
 * Shared JSON-compatible primitives reused across API payload types.
 */

/** Primitive JSON scalar values. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON object map keyed by strings. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/** Any JSON-compatible value (object, array, or primitive). */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
