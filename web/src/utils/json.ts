export function toPrettyJson(value: unknown, fallback = ''): string {
  try {
    const serialized = JSON.stringify(value, null, 2)
    return typeof serialized === 'string' ? serialized : fallback
  } catch {
    return fallback
  }
}
