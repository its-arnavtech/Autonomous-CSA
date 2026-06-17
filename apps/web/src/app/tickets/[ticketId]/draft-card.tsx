'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type DraftCardProps = {
  draft: {
    id: string;
    body: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    sentAt?: string | null;
    rejectedReason?: string | null;
    approvals?: Array<{ id: string; status: string }>;
  };
};

function draftTone(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30';
    case 'PENDING_APPROVAL':
      return 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
    case 'REJECTED':
      return 'bg-rose-500/15 text-rose-300 ring-rose-500/30';
    case 'SENT':
      return 'bg-sky-500/15 text-sky-300 ring-sky-500/30';
    default:
      return 'bg-white/[0.06] text-mist-200 ring-white/10';
  }
}

export function DraftCard({ draft }: DraftCardProps) {
  const router = useRouter();
  const [body, setBody] = useState(draft.body);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canEdit = draft.status !== 'SENT';
  const canSend = draft.status === 'APPROVED';

  const saveDraft = () => {
    setError(null);
    setSuccess(null);
    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/drafts/${encodeURIComponent(draft.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body }),
        });

        if (!res.ok) {
          const detail = await res.text();
          setError(detail || 'Failed to save draft.');
          return;
        }

        setSuccess('Draft saved.');
        router.refresh();
      })();
    });
  };

  const sendDraft = () => {
    setError(null);
    setSuccess(null);
    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/drafts/${encodeURIComponent(draft.id)}/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          const detail = await res.text();
          setError(detail || 'Failed to send draft.');
          return;
        }

        setSuccess('Draft sent.');
        router.refresh();
      })();
    });
  };

  return (
    <article className="rounded-2xl border border-white/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${draftTone(draft.status)}`}
          >
            {draft.status}
          </span>
          {draft.approvals?.[0] ? (
            <span className="text-xs text-mist-400">
              Approval: {draft.approvals[0].status}
            </span>
          ) : null}
        </div>
        <div className="text-right text-xs text-mist-500">
          <div>Created {new Date(draft.createdAt).toLocaleString()}</div>
          <div>Updated {new Date(draft.updatedAt).toLocaleString()}</div>
          {draft.sentAt ? <div>Sent {new Date(draft.sentAt).toLocaleString()}</div> : null}
        </div>
      </div>

      <textarea
        className="mt-3 min-h-28 w-full rounded-2xl border border-white/15 px-3 py-2 text-sm text-mist-50"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={isPending || !canEdit}
      />

      {draft.status === 'PENDING_APPROVAL' ? (
        <p className="mt-3 text-sm text-amber-300">Requires approval before sending.</p>
      ) : null}
      {draft.status === 'REJECTED' && draft.rejectedReason ? (
        <p className="mt-3 text-sm text-rose-300">Rejected: {draft.rejectedReason}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveDraft}
          disabled={isPending || !canEdit || body === draft.body}
          className="rounded-2xl bg-iris-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-iris-600/40 disabled:text-white/50"
        >
          {isPending ? 'Working...' : 'Save Draft'}
        </button>
        <button
          type="button"
          onClick={sendDraft}
          disabled={isPending || !canSend}
          className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {isPending ? 'Working...' : 'Send Draft'}
        </button>
      </div>

      {success ? <p className="mt-3 text-sm text-emerald-300">{success}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </article>
  );
}
