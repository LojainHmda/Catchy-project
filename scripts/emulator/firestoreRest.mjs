// Minimal encoder from plain JS values to Firestore REST "Value" JSON.

export function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: value.length ? { values: value.map(toFirestoreValue) } : {} };
  switch (typeof value) {
    case 'boolean':
      return { booleanValue: value };
    case 'number':
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    case 'string':
      return { stringValue: value };
    case 'object':
      return { mapValue: { fields: toFirestoreFields(value) } };
    default:
      throw new Error(`Unsupported Firestore value type: ${typeof value}`);
  }
}

/** Object → REST `fields`. Undefined properties are omitted (like the SDK with ignoreUndefinedProperties). */
export function toFirestoreFields(object) {
  const fields = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined) continue;
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}
