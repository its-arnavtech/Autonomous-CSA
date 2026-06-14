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
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'REQUIRE_APPROVAL':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'BLOCK':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
}

export function GuardrailsPanel({ checks }: GuardrailsPanelProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Guardrail Checks</h2>
      {checks.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No guardrail checks recorded.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {checks.map((check) => (
            <div
              key={check.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">
                    {check.guardrailType.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${decisionBadge(check.decision)}`}
                  >
                    {check.decision.replace(/_/g, ' ')}
                  </span>
                </div>
                {check.reason ? (
                  <p className="mt-1 text-xs text-slate-500">{check.reason}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-slate-400">
                {new Date(check.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
