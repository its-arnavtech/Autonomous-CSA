const SECRET_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/, type: 'openai_key' },
  { pattern: /AKIA[0-9A-Z]{16}/, type: 'aws_access_key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, type: 'github_pat' },
  { pattern: /xox[baprs]-[0-9A-Za-z]{10,}/, type: 'slack_token' },
  { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, type: 'private_key' },
];

export function detectSecrets(text: string): {
  detected: boolean;
  types: string[];
} {
  const types = SECRET_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ type }) => type,
  );
  return { detected: types.length > 0, types };
}
