export function safeParseJson<T>(
  rawText: string,
  validate: (raw: unknown) => T,
  schemaName: string,
): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText.trim());
  } catch {
    throw new Error(
      `[safe-json] Failed to parse JSON for schema "${schemaName}": ${rawText.slice(0, 300)}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `[safe-json] Expected object for schema "${schemaName}", got ${typeof parsed}`,
    );
  }

  try {
    return validate(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[safe-json] Validation failed for "${schemaName}": ${msg}`);
  }
}

export function truncateForLog(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}… [+${text.length - maxLength} chars]`;
}
