// TypeScript string enums matching the Prisma schema GuardrailDecision and
// GuardrailType enums. Values are identical to what Prisma generates, so
// these are structurally compatible with the Prisma client types after
// `prisma generate` runs. Once regeneration succeeds these can be removed
// in favour of the Prisma-generated exports.

export enum GuardrailDecision {
  ALLOW = 'ALLOW',
  REQUIRE_APPROVAL = 'REQUIRE_APPROVAL',
  BLOCK = 'BLOCK',
}

export enum GuardrailType {
  COST_LIMIT = 'COST_LIMIT',
  SAFETY_POLICY = 'SAFETY_POLICY',
  KNOWLEDGE_GROUNDING = 'KNOWLEDGE_GROUNDING',
  PII_DETECTION = 'PII_DETECTION',
  SECRET_DETECTION = 'SECRET_DETECTION',
  AUTO_SEND_POLICY = 'AUTO_SEND_POLICY',
}
