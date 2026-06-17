'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type ApprovalReviewCardProps = {
  approval: {
    id: string;
    status: string;
    proposedResponse?: string | null;
    reviewerNote?: string | null;
    createdAt: string;
    updatedAt: string;
    outboundDraft?: {
      id: string;
      status: string;
    } | null;
  };
};

function approvalTone(status: string) {
  switch (status) {
    case 'APPROVED':
      return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30';
    case 'REJECTED':
      return 'bg-rose-500/15 text-rose-300 ring-rose-500/30';
    default:
      return 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
  }
}

export function ApprovalReviewCard({ approval }: ApprovalReviewCardProps) {
  const router = useRouter();
  const [reviewerNote, setReviewerNote] = useState(approval.reviewerNote ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submitDecision = (status: 'APPROVED' | 'REJECTED') => {
    setError(null);
    setSuccess(null);

    startTransition(() => {
      void (async () => {
        const res = await fetch(`/api/approvals/${encodeURIComponent(approval.id)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status,
            reviewerNote: reviewerNote.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const detail = await res.text();
          setError(detail || 'Failed to update approval.');
          return;
        }

        setSuccess(`Approval ${status.toLowerCase()}.`);
        router.refresh();
      })();
    });
  };

  return (
    <article className="rounded-2xl border border-white/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${approvalTone(approval.status)}`}
        >
          {approval.status}
        </span>
        <div className="text-right text-xs text-mist-500">
          <div>Created {new Date(approval.createdAt).toLocaleString()}</div>
          <div>Updated {new Date(approval.updatedAt).toLocaleString()}</div>
        </div>
      </div>

      {approval.proposedResponse ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-mist-200">
          {approval.proposedResponse}
        </p>
      ) : (
        <p className="mt-3 text-sm text-mist-400">No proposed response captured.</p>
      )}

      {approval.outboundDraft ? (
        <p className="mt-2 text-sm text-mist-400">
          Linked draft status: <span className="font-medium text-mist-200">{approval.outboundDraft.status}</span>
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        <label htmlFor={`reviewer-note-${approval.id}`} className="block text-sm font-medium text-mist-200">
          Reviewer Note
        </label>
        <textarea
          id={`reviewer-note-${approval.id}`}
          className="min-h-24 w-full rounded-2xl border border-white/15 px-3 py-2 text-sm text-mist-50"
          value={reviewerNote}
          onChange={(event) => setReviewerNote(event.target.value)}
          disabled={isPending || approval.status !== 'PENDING'}
          placeholder="Optional note for the approval record"
        />
      </div>

      {approval.status === 'PENDING' ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => submitDecision('APPROVED')}
            disabled={isPending}
            className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {isPending ? 'Saving...' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => submitDecision('REJECTED')}
            disabled={isPending}
            className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-rose-300"
          >
            {isPending ? 'Saving...' : 'Reject'}
          </button>
        </div>
      ) : null}

      {success ? <p className="mt-3 text-sm text-emerald-300">{success}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </article>
  );
}
