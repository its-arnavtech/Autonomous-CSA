const PII_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, type: 'ssn' },
  { pattern: /\b(?:\d[ -]?){13,16}\b/, type: 'credit_card' },
  { pattern: /\b[A-Z]{1,2}\d{6,9}\b/, type: 'passport_number' },
];

export function detectPii(text: string): { detected: boolean; types: string[] } {
  const types = PII_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ type }) => type,
  );
  return { detected: types.length > 0, types };
}
