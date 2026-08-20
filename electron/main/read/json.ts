// oxlint-disable anti-slop/no-unknown-parameters
// oxlint-disable anti-slop/no-runtime-typeof
// oxlint-disable anti-slop/no-unsafe-dictionary-type
// oxlint-disable anti-slop/require-safety-comment-for-type-assertion
/**
 * The single JSON parse boundary.
 *
 * The anti-slop rules ask every module to accept domain types and to parse
 * external input once, at its boundary. This file is that boundary: it is the
 * only place that inspects unparsed values, so the readers above it work with
 * named types and never call `typeof` on CLI or lock-file output.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

/** Parse text that came from a file or from CLI output. Null when it is not JSON. */
export function parseJson(text: string): JsonValue | null {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }
}

export function asObject(value: JsonValue | null | undefined): JsonObject | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asArray(value: JsonValue | null | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

/** A non-empty string field, or null. Empty strings are treated as absent. */
export function asText(value: JsonValue | null | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function asNumber(value: JsonValue | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

/** Every string of an array field, ignoring entries of other types. */
export function asTextList(value: JsonValue | null | undefined): string[] {
  const list: string[] = [];
  for (const item of asArray(value)) {
    const text = asText(item);
    if (text !== null) list.push(text);
  }
  return list;
}

/** The named members of an object field, in file order. */
export function entriesOf(value: JsonValue | null | undefined): [string, JsonValue][] {
  const object = asObject(value);
  if (object === null) return [];
  const entries: [string, JsonValue][] = [];
  for (const [key, member] of Object.entries(object)) {
    if (member !== undefined) entries.push([key, member]);
  }
  return entries;
}
