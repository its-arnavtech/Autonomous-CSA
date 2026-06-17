type GuardrailCheck = {
  id: string;
  guardrailType: string;
  decision: string;
  reason?: string | null;
  metadata?: unknown;
  createdAt: string;
};

type GuardrailsPanelProps = {
  checks: GuardrailCheck[];
};

function decisionBadge(decision: string) {
  switch (decision) {
    case 'ALLOW':
      return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30';
    case 'REQUIRE_APPROVAL':
      return 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
    case 'BLOCK':
      return 'bg-rose-500/15 text-rose-300 ring-rose-500/30';
    default:
      return 'bg-white/[0.06] text-mist-200 ring-white/10';
  }
}

export function GuardrailsPanel({ checks }: GuardrailsPanelProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-ink-850/70 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-mist-50">Guardrail Checks</h2>
      {checks.length === 0 ? (
        <p className="mt-4 text-sm text-mist-400">No guardrail checks recorded.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {checks.map((check) => (
            <div
              key={check.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-mist-50">
                    {check.guardrailType.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${decisionBadge(check.decision)}`}
                  >
                    {check.decision.replace(/_/g, ' ')}
                  </span>
                </div>
                {check.reason ? (
                  <p className="mt-1 text-xs text-mist-400">{check.reason}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-mist-500">
                {new Date(check.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
