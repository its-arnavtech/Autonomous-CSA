'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type DraftComposerProps = {
  orgId: string;
  ticketId: string;
};

export function DraftComposer({ orgId, ticketId }: DraftComposerProps) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const createDraft = () => {
    setError(null);
    setSuccess(null);

    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/drafts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orgId, body }),
        });

        if (!res.ok) {
          const detail = await res.text();
          setError(detail || 'Failed to create draft.');
          return;
        }

        setBody('');
        setSuccess('Draft created.');
        router.refresh();
      })();
    });
  };

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Create Manual Draft</h3>
      <textarea
        className="mt-3 min-h-28 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={isPending}
        placeholder="Write a reply draft"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={createDraft}
          disabled={isPending || body.trim().length === 0}
          className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? 'Creating...' : 'Create Draft'}
        </button>
        {success ? <span className="text-sm text-emerald-700">{success}</span> : null}
        {error ? <span className="text-sm text-rose-700">{error}</span> : null}
      </div>
    </div>
  );
}
