'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type SettingsFormProps = {
  orgId: string;
  initialSettings: {
    autoRespond: boolean;
    requireHumanApproval: boolean;
    maxAgentCostCents: number;
  };
};

export function SettingsForm({ orgId, initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const [autoRespond, setAutoRespond] = useState(initialSettings.autoRespond);
  const [requireHumanApproval, setRequireHumanApproval] = useState(
    initialSettings.requireHumanApproval,
  );
  const [maxAgentCostCents, setMaxAgentCostCents] = useState(
    String(initialSettings.maxAgentCostCents),
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const saveSettings = () => {
    setSuccess(null);
    setError(null);

    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/orgs/${encodeURIComponent(orgId)}/settings`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            autoRespond,
            requireHumanApproval,
            maxAgentCostCents: Number(maxAgentCostCents),
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
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Organization Settings</h2>
      <p className="mt-1 text-sm text-slate-500">Org: {orgId}</p>

      <div className="mt-6 space-y-5">
        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
          <input
            type="checkbox"
            className="mt-1 size-4 rounded border-slate-300"
            checked={autoRespond}
            onChange={(event) => setAutoRespond(event.target.checked)}
            disabled={isPending}
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">Auto respond</span>
            <span className="block text-sm text-slate-500">
              Keep this off until real outbound response behavior exists.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
          <input
            type="checkbox"
            className="mt-1 size-4 rounded border-slate-300"
            checked={requireHumanApproval}
            onChange={(event) => setRequireHumanApproval(event.target.checked)}
            disabled={isPending}
          />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              Require human approval
            </span>
            <span className="block text-sm text-slate-500">
              When enabled, worker runs create pending approval records for review.
            </span>
          </span>
        </label>

        <div className="space-y-2">
          <label htmlFor="max-agent-cost" className="block text-sm font-medium text-slate-700">
            Max agent cost (cents)
          </label>
          <input
            id="max-agent-cost"
            type="number"
            min={0}
            max={100000}
            className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            value={maxAgentCostCents}
            onChange={(event) => setMaxAgentCostCents(event.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveSettings}
            disabled={isPending}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPending ? 'Saving...' : 'Save Settings'}
          </button>
          {success ? <span className="text-sm text-emerald-700">{success}</span> : null}
          {error ? <span className="text-sm text-rose-700">{error}</span> : null}
        </div>
      </div>
    </div>
  );
}
