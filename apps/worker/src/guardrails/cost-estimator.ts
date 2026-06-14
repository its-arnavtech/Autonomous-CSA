export function estimateCostCents(params: {
  subject: string;
  draftBody: string;
}): number {
  const totalChars = (params.subject?.length ?? 0) + (params.draftBody?.length ?? 0);
  return Math.ceil(totalChars * 0.005);
}
