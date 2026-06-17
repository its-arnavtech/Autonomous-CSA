type LlmMeta = {
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostCents?: number;
  };
};

type AgentStep = {
  id: string;
  stepType: string;
  status: string;
  inputJson?: unknown;
  outputJson?: unknown;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  SUCCEEDED: 'bg-emerald-500/20 text-emerald-200',
  BLOCKED: 'bg-rose-500/20 text-rose-200',
  FAILED: 'bg-rose-500/20 text-rose-200',
  STARTED: 'bg-amber-500/20 text-amber-200',
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-green-500/20 text-green-200',
  anthropic: 'bg-violet-500/20 text-violet-200',
  deterministic: 'bg-white/[0.06] text-mist-300',
};

function ProviderBadge({
  provider,
  model,
  fallbackUsed,
}: {
  provider?: string | null;
  model?: string | null;
  fallbackUsed?: boolean;
}) {
  if (!provider) return null;
  const colorClass =
    PROVIDER_COLORS[provider] ?? 'bg-white/[0.06] text-mist-300';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      {provider}
      {model ? ` · ${model}` : ''}
      {fallbackUsed ? ' (fallback)' : ''}
    </span>
  );
}

export function AgentStepsPanel({ steps }: { steps: AgentStep[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-ink-850/70 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-mist-50">Agent Runtime</h2>
      <div className="mt-4 space-y-3">
        {steps.length === 0 ? (
          <p className="text-sm text-mist-400">
            No agent runtime steps recorded yet.
          </p>
        ) : (
          steps.map((step) => {
            const statusColor =
              STATUS_COLORS[step.status] ?? 'bg-white/[0.06] text-mist-200';
            const outputObj =
              typeof step.outputJson === 'object' && step.outputJson !== null
                ? (step.outputJson as Record<string, unknown>)
                : null;
            const llm = (outputObj?._llm ?? null) as LlmMeta | null;

            return (
              <article
                key={step.id}
                className="rounded-2xl border border-white/10 p-4"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-mist-50">
                      {step.stepType}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
                    >
                      {step.status}
                    </span>
                    {llm?.provider ? (
                      <ProviderBadge
                        provider={llm.provider}
                        model={llm.model}
                        fallbackUsed={llm.fallbackUsed}
                      />
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-mist-500">
                    <div>Started {new Date(step.startedAt).toLocaleString()}</div>
                    {step.finishedAt ? (
                      <div>
                        Finished {new Date(step.finishedAt).toLocaleString()}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* LLM usage row */}
                {llm?.usage ? (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-mist-400">
                    {llm.usage.inputTokens != null && (
                      <span>
                        {llm.usage.inputTokens} in / {llm.usage.outputTokens ?? 0} out tokens
                      </span>
                    )}
                    {llm.usage.estimatedCostCents != null && (
                      <span>~{llm.usage.estimatedCostCents}¢ est. cost</span>
                    )}
                  </div>
                ) : null}

                {step.errorMessage ? (
                  <p className="mt-3 text-sm text-rose-300">
                    {step.errorMessage}
                  </p>
                ) : null}

                <details className="mt-3 rounded-2xl bg-white/[0.03] p-3">
                  <summary className="cursor-pointer text-sm font-medium text-mist-200">
                    View step payload
                  </summary>
                  <pre className="mt-3 overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">
                    {JSON.stringify(
                      { input: step.inputJson, output: step.outputJson },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
