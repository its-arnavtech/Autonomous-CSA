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
  orgId: string;
};

function draftTone(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'PENDING_APPROVAL':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'REJECTED':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'SENT':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
}

export function DraftCard({ draft, orgId }: DraftCardProps) {
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
          body: JSON.stringify({ orgId, body }),
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
          body: JSON.stringify({ orgId }),
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
    <article className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${draftTone(draft.status)}`}
          >
            {draft.status}
          </span>
          {draft.approvals?.[0] ? (
            <span className="text-xs text-slate-500">
              Approval: {draft.approvals[0].status}
            </span>
          ) : null}
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>Created {new Date(draft.createdAt).toLocaleString()}</div>
          <div>Updated {new Date(draft.updatedAt).toLocaleString()}</div>
          {draft.sentAt ? <div>Sent {new Date(draft.sentAt).toLocaleString()}</div> : null}
        </div>
      </div>

      <textarea
        className="mt-3 min-h-28 w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={isPending || !canEdit}
      />

      {draft.status === 'PENDING_APPROVAL' ? (
        <p className="mt-3 text-sm text-amber-700">Requires approval before sending.</p>
      ) : null}
      {draft.status === 'REJECTED' && draft.rejectedReason ? (
        <p className="mt-3 text-sm text-rose-700">Rejected: {draft.rejectedReason}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveDraft}
          disabled={isPending || !canEdit || body === draft.body}
          className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
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

      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </article>
  );
}
