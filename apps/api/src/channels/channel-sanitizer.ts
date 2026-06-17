import { createHash } from 'node:crypto';

const MAX_SUBJECT_LENGTH = Number.parseInt(
  process.env.CHANNEL_MAX_SUBJECT_LENGTH?.trim() ?? '240',
  10,
);
const MAX_BODY_LENGTH = Number.parseInt(
  process.env.CHANNEL_MAX_BODY_LENGTH?.trim() ?? '20000',
  10,
);
const SAFE_FILENAME_PATTERN = /[^a-zA-Z0-9._ -]/g;
const DANGEROUS_PROTOCOL_PATTERN = /\b(?:javascript|data|vbscript):/gi;
const HTML_EVENT_HANDLER_PATTERN = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_BLOCK_PATTERN = /<script[\s\S]*?>[\s\S]*?<\/script>/gi;
const IFRAME_BLOCK_PATTERN = /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi;

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

export function sha256Hex(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeEmail(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)
    ? trimmed
    : null;
}

export function truncateText(value?: string | null, max = MAX_BODY_LENGTH) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\u0000/g, '').trim();
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

export function sanitizeSubject(value?: string | null) {
  return truncateText(value, MAX_SUBJECT_LENGTH) ?? '(no subject)';
}

export function sanitizeHtml(value?: string | null) {
  if (!value) {
    return null;
  }

  return truncateText(value, MAX_BODY_LENGTH)
    ?.replace(SCRIPT_BLOCK_PATTERN, '')
    .replace(IFRAME_BLOCK_PATTERN, '')
    .replace(HTML_EVENT_HANDLER_PATTERN, '')
    .replace(DANGEROUS_PROTOCOL_PATTERN, 'unsafe:');
}

export function sanitizeFilename(value?: string | null) {
  const fallback = 'attachment';
  const base = (value ?? fallback)
    .split(/[\\/]/)
    .pop()
    ?.replace(/\u0000/g, '')
    .replace(SAFE_FILENAME_PATTERN, '_')
    .trim();

  if (!base || base === '.' || base === '..') {
    return fallback;
  }

  return base.slice(0, 160);
}
