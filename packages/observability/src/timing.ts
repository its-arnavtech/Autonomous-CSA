export function startTimer() {
  const startedAt = process.hrtime.bigint();

  return () => Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}
