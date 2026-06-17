'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type ChannelActionsProps = {
  connectionId: string;
  status: string;
  canManage: boolean;
};

export function CreateMockConnectionForm({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('Mock Email');
  const [inboundAddress, setInboundAddress] = useState('support@example.test');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canManage) {
    return null;
  }

  const createConnection = () => {
    startTransition(async () => {
      setError(null);
      const response = await fetch('/api/channel-connections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'MOCK_EMAIL',
          displayName,
          inboundAddress,
          isDefault: true,
        }),
      });

      if (!response.ok) {
        setError('Create failed');
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">
        Create mock channel
      </h3>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="space-y-1 text-sm text-slate-600">
          <span>Display name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="space-y-1 text-sm text-slate-600">
          <span>Inbound address</span>
          <input
            value={inboundAddress}
            onChange={(event) => setInboundAddress(event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <button
          type="button"
          onClick={createConnection}
          disabled={isPending}
          className="self-end rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Create
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}

export function ChannelActions({
  connectionId,
  status,
  canManage,
}: ChannelActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canManage) {
    return <span className="text-xs text-slate-400">Read-only</span>;
  }

  const post = (action: 'enable' | 'disable' | 'test') => {
    startTransition(async () => {
      setError(null);
      const response = await fetch(
        `/api/channel-connections/${connectionId}/${action}`,
        { method: 'POST' },
      );

      if (!response.ok) {
        setError(`${action} failed`);
        return;
      }

      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => post('test')}
          disabled={isPending}
          className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 disabled:opacity-50"
        >
          Test
        </button>
        {status === 'DISABLED' ? (
          <button
            type="button"
            onClick={() => post('enable')}
            disabled={isPending}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-50"
          >
            Enable
          </button>
        ) : (
          <button
            type="button"
            onClick={() => post('disable')}
            disabled={isPending}
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
          >
            Disable
          </button>
        )}
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
