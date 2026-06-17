import { createHash } from 'node:crypto';

const REDACTED = '[REDACTED]';
const BODY_SUMMARY_KEYS = new Set([
  'body',
  'message',
  'prompt',
  'response',
  'content',
  'authorization',
  'cookie',
  'set-cookie',
]);

const SECRET_KEYS = new Set([
  'accesstoken',
  'access_token',
  'ai_api_key',
  'anthropic_api_key',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'cookies',
  'jwt_access_secret',
  'jwt_refresh_secret',
  'openai_api_key',
  'password',
  'passwordhash',
  'password_hash',
  'refreshtoken',
  'refresh_token',
  'set-cookie',
  'smtppassword',
  'smtpuser',
  'token',
  'tokenhash',
  'token_hash',
]);

const CONNECTION_STRING_PATTERN =
  /\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s]+/gi;

export type SanitizedBodySummary = {
  redacted: true;
  length: number;
  sha256Prefix: string;
};

function stableHash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function summarizeBody(value: string): SanitizedBodySummary {
  return {
    redacted: true,
    length: value.length,
    sha256Prefix: stableHash(value),
  };
}

function shouldRedactKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return SECRET_KEYS.has(normalized);
}

function shouldSummarizeKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return BODY_SUMMARY_KEYS.has(normalized);
}

function sanitizeString(value: string) {
  // Always replace: RegExp.test() with a global expression carries state across calls.
  return value.replace(CONNECTION_STRING_PATTERN, REDACTED);
}

export function sanitizeForLog(
  value: unknown,
  options?: { maxDepth?: number; parentKey?: string },
): unknown {
  const maxDepth = options?.maxDepth ?? 6;
  const parentKey = options?.parentKey;

  if (maxDepth < 0) {
    return '[Truncated]';
  }

  if (typeof value === 'string') {
    if (parentKey && shouldRedactKey(parentKey)) {
      return REDACTED;
    }

    if (parentKey && shouldSummarizeKey(parentKey)) {
      return summarizeBody(value);
    }

    return sanitizeString(value);
  }

  if (
    value == null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      sanitizeForLog(entry, { maxDepth: maxDepth - 1, parentKey }),
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const next: Record<string, unknown> = {};

    for (const [key, entryValue] of entries) {
      if (shouldRedactKey(key)) {
        next[key] = REDACTED;
        continue;
      }

      next[key] = sanitizeForLog(entryValue, {
        maxDepth: maxDepth - 1,
        parentKey: key,
      });
    }

    return next;
  }

  return String(value);
}

export function redactHeaders(headers: Record<string, string | undefined>) {
  return sanitizeForLog(headers) as Record<string, string | undefined>;
}

export function summarizeText(value?: string | null) {
  if (!value) {
    return null;
  }

  return summarizeBody(value);
}
