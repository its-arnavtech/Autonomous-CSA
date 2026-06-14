import { safeParseJson, truncateForLog } from './safe-json';

describe('safeParseJson', () => {
  function identity(raw: unknown): { value: string } {
    const r = raw as Record<string, unknown>;
    if (typeof r.value !== 'string') throw new Error('missing value');
    return { value: r.value };
  }

  it('parses valid JSON object and validates', () => {
    const result = safeParseJson('{"value":"hello"}', identity, 'TestSchema');
    expect(result).toEqual({ value: 'hello' });
  });

  it('throws on invalid JSON', () => {
    expect(() => safeParseJson('not json', identity, 'TestSchema')).toThrow(
      /Failed to parse JSON/,
    );
  });

  it('throws when JSON is a non-object', () => {
    expect(() => safeParseJson('"a string"', identity, 'TestSchema')).toThrow(
      /Expected object/,
    );
  });

  it('throws when JSON is an array', () => {
    expect(() => safeParseJson('[1, 2]', identity, 'TestSchema')).toThrow(
      /Expected object/,
    );
  });

  it('throws when validation fails', () => {
    expect(() => safeParseJson('{"wrong":1}', identity, 'TestSchema')).toThrow(
      /Validation failed/,
    );
  });

  it('strips whitespace before parsing', () => {
    const result = safeParseJson('  {"value":"trimmed"}  ', identity, 'S');
    expect(result.value).toBe('trimmed');
  });
});

describe('truncateForLog', () => {
  it('returns text unchanged when under limit', () => {
    expect(truncateForLog('short', 500)).toBe('short');
  });

  it('truncates and appends marker when over limit', () => {
    const longText = 'a'.repeat(600);
    const result = truncateForLog(longText, 500);
    expect(result).toHaveLength(500 + '… [+100 chars]'.length);
    expect(result).toContain('[+100 chars]');
  });
});
