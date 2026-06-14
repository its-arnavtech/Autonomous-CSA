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

export function AgentStepsPanel({ steps }: { steps: AgentStep[] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Agent Runtime</h2>
      <div className="mt-4 space-y-3">
        {steps.length === 0 ? (
          <p className="text-sm text-slate-500">No agent runtime steps recorded yet.</p>
        ) : (
          steps.map((step) => (
            <article key={step.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-medium text-slate-900">{step.stepType}</div>
                  <div className="text-sm text-slate-500">Status: {step.status}</div>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div>Started {new Date(step.startedAt).toLocaleString()}</div>
                  {step.finishedAt ? (
                    <div>Finished {new Date(step.finishedAt).toLocaleString()}</div>
                  ) : null}
                </div>
              </div>
              {step.errorMessage ? (
                <p className="mt-3 text-sm text-rose-700">{step.errorMessage}</p>
              ) : null}
              <details className="mt-3 rounded-2xl bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  View step payload
                </summary>
                <pre className="mt-3 overflow-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">
                  {JSON.stringify(
                    {
                      input: step.inputJson,
                      output: step.outputJson,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
