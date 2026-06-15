'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type OperationsActionsProps = {
  failureId: string;
  canManage: boolean;
};

export function OperationsActions({
  failureId,
  canManage,
}: OperationsActionsProps) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canManage) {
    return <span className="text-xs text-slate-400">Read-only</span>;
  }

  const handleReplay = () => {
    if (!window.confirm('Replay this failure as a new trusted job?')) {
      return;
    }

    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/operations/failures/${failureId}/replay`, {
        method: 'POST',
      });

      if (!response.ok) {
        setError('Replay failed');
        return;
      }

      router.refresh();
    });
  };

  const handleResolve = () => {
    if (!note.trim()) {
      setError('Add a short note before resolving.');
      return;
    }

    startTransition(async () => {
      setError(null);
      const response = await fetch(
        `/api/operations/failures/${failureId}/resolve`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ note }),
        },
      );

      if (!response.ok) {
        setError('Resolve failed');
        return;
      }

      setNote('');
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleReplay}
          disabled={isPending}
          className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 disabled:opacity-50"
        >
          Replay
        </button>
        <button
          type="button"
          onClick={handleResolve}
          disabled={isPending}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50"
        >
          Resolve
        </button>
      </div>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Resolution note"
        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none ring-0"
      />
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
