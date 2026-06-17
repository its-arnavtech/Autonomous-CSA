'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type SettingsFormProps = {
  initialSettings: {
    autoRespond: boolean;
    requireHumanApproval: boolean;
    maxAgentCostCents: number;
    maxAutoSendCostCents: number;
    requireApprovalForLowConfidence: boolean;
    blockOnPiiDetection: boolean;
    minCriticCompletenessScore: number;
  };
};

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const [autoRespond, setAutoRespond] = useState(initialSettings.autoRespond);
  const [requireHumanApproval, setRequireHumanApproval] = useState(
    initialSettings.requireHumanApproval,
  );
  const [maxAgentCostCents, setMaxAgentCostCents] = useState(
    String(initialSettings.maxAgentCostCents),
  );
  const [maxAutoSendCostCents, setMaxAutoSendCostCents] = useState(
    String(initialSettings.maxAutoSendCostCents),
  );
  const [requireApprovalForLowConfidence, setRequireApprovalForLowConfidence] =
    useState(initialSettings.requireApprovalForLowConfidence);
  const [blockOnPiiDetection, setBlockOnPiiDetection] = useState(
    initialSettings.blockOnPiiDetection,
  );
  const [minCriticCompletenessScore, setMinCriticCompletenessScore] = useState(
    String(initialSettings.minCriticCompletenessScore),
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const saveSettings = () => {
    setSuccess(null);
    setError(null);

    startTransition(() => {
      void (async () => {
        const res = await fetch('/api/orgs/settings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            autoRespond,
            requireHumanApproval,
            maxAgentCostCents: Number(maxAgentCostCents),
            maxAutoSendCostCents: Number(maxAutoSendCostCents),
            requireApprovalForLowConfidence,
            blockOnPiiDetection,
            minCriticCompletenessScore: Number(minCriticCompletenessScore),
          }),
        });

        if (!res.ok) {
          const detail = await res.text();
          setError(detail || 'Failed to save organization settings.');
          return;
        }

        setSuccess('Settings saved.');
        router.refresh();
      })();
    });
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-ink-850/70 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-mist-50">Organization Settings</h2>

      <div className="mt-6 space-y-5">
        <label className="flex items-start gap-3 rounded-2xl border border-white/10 p-4">
          <input
            type="checkbox"
            className="mt-1 size-4 rounded border-white/15"
            checked={autoRespond}
            onChange={(event) => setAutoRespond(event.target.checked)}
            disabled={isPending}
          />
          <span>
            <span className="block text-sm font-medium text-mist-50">Auto respond</span>
            <span className="block text-sm text-mist-400">
              Keep this off until real outbound response behavior exists.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-2xl border border-white/10 p-4">
          <input
            type="checkbox"
            className="mt-1 size-4 rounded border-white/15"
            checked={requireHumanApproval}
            onChange={(event) => setRequireHumanApproval(event.target.checked)}
            disabled={isPending}
          />
          <span>
            <span className="block text-sm font-medium text-mist-50">
              Require human approval
            </span>
            <span className="block text-sm text-mist-400">
              When enabled, worker runs create pending approval records for review.
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <label htmlFor="max-agent-cost" className="block text-sm font-medium text-mist-200">
            Max agent cost (cents)
          </label>
          <input
            id="max-agent-cost"
            type="number"
            min={0}
            max={100000}
            className="w-full rounded-2xl border border-white/15 px-3 py-2 text-sm text-mist-50"
            value={maxAgentCostCents}
            onChange={(event) => setMaxAgentCostCents(event.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="rounded-2xl border border-white/10 p-4">
          <h3 className="text-sm font-semibold text-mist-100">Guardrail Policies</h3>
          <p className="mt-1 text-xs text-mist-400">
            Controls automatic safety checks before responses are auto-sent.
          </p>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="max-auto-send-cost"
                className="block text-sm font-medium text-mist-200"
              >
                Max auto-send cost (cents)
              </label>
              <p className="text-xs text-mist-400">
                Responses with estimated cost above this limit require approval.
              </p>
              <input
                id="max-auto-send-cost"
                type="number"
                min={0}
                max={100000}
                className="w-full rounded-2xl border border-white/15 px-3 py-2 text-sm text-mist-50"
                value={maxAutoSendCostCents}
                onChange={(event) => setMaxAutoSendCostCents(event.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="min-completeness"
                className="block text-sm font-medium text-mist-200"
              >
                Min critic completeness score (0–100)
              </label>
              <p className="text-xs text-mist-400">
                Responses scoring below this threshold are blocked automatically.
              </p>
              <input
                id="min-completeness"
                type="number"
                min={0}
                max={100}
                className="w-full rounded-2xl border border-white/15 px-3 py-2 text-sm text-mist-50"
                value={minCriticCompletenessScore}
                onChange={(event) =>
                  setMinCriticCompletenessScore(event.target.value)
                }
                disabled={isPending}
              />
            </div>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-white/15"
                checked={requireApprovalForLowConfidence}
                onChange={(event) =>
                  setRequireApprovalForLowConfidence(event.target.checked)
                }
                disabled={isPending}
              />
              <span>
                <span className="block text-sm font-medium text-mist-50">
                  Require approval for low confidence
                </span>
                <span className="block text-sm text-mist-400">
                  Responses where the resolver confidence is below 0.70 require human review.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 rounded border-white/15"
                checked={blockOnPiiDetection}
                onChange={(event) => setBlockOnPiiDetection(event.target.checked)}
                disabled={isPending}
              />
              <span>
                <span className="block text-sm font-medium text-mist-50">
                  Block on PII detection
                </span>
                <span className="block text-sm text-mist-400">
                  When enabled, responses containing detected PII are blocked outright.
                  When disabled, they require approval instead.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={isPending}
            className="rounded-2xl bg-iris-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-iris-600/40 disabled:text-white/50"
          >
            {isPending ? 'Saving...' : 'Save Settings'}
          </button>
          {success ? <span className="text-sm text-emerald-300">{success}</span> : null}
          {error ? <span className="text-sm text-rose-300">{error}</span> : null}
        </div>
      </div>
    </div>
  );
}
