'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

const ticketStatuses = [
  'OPEN',
  'PENDING',
  'WAITING_CUSTOMER',
  'RESOLVED',
  'CLOSED',
] as const;

const ticketPriorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

type TicketControlsProps = {
  ticketId: string;
  orgId: string;
  status: (typeof ticketStatuses)[number];
  priority: (typeof ticketPriorities)[number];
};

export function TicketControls({
  ticketId,
  orgId,
  status,
  priority,
}: TicketControlsProps) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedPriority, setSelectedPriority] = useState(priority);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [prioritySuccess, setPrioritySuccess] = useState<string | null>(null);
  const [isStatusPending, startStatusTransition] = useTransition();
  const [isPriorityPending, startPriorityTransition] = useTransition();

  const updateStatus = () => {
    setStatusError(null);
    setStatusSuccess(null);

    startStatusTransition(() => {
      void (async () => {
        const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/status`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orgId, status: selectedStatus }),
        });

        if (!res.ok) {
          const detail = await res.text();
          setStatusError(detail || 'Failed to update ticket status.');
          return;
        }

        setStatusSuccess('Status updated.');
        router.refresh();
      })();
    });
  };

  const updatePriority = () => {
    setPriorityError(null);
    setPrioritySuccess(null);

    startPriorityTransition(() => {
      void (async () => {
        const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/priority`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orgId, priority: selectedPriority }),
        });

        if (!res.ok) {
          const detail = await res.text();
          setPriorityError(detail || 'Failed to update ticket priority.');
          return;
        }

        setPrioritySuccess('Priority updated.');
        router.refresh();
      })();
    });
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Ticket Controls</h2>

      <div className="mt-4 space-y-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="ticket-status">
            Status
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              id="ticket-status"
              className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value as typeof selectedStatus)}
              disabled={isStatusPending}
            >
              {ticketStatuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={updateStatus}
              disabled={isStatusPending || selectedStatus === status}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isStatusPending ? 'Updating...' : 'Update Status'}
            </button>
          </div>
          {statusSuccess ? <p className="text-sm text-emerald-700">{statusSuccess}</p> : null}
          {statusError ? <p className="text-sm text-rose-700">{statusError}</p> : null}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="ticket-priority">
            Priority
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              id="ticket-priority"
              className="rounded-2xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedPriority}
              onChange={(event) =>
                setSelectedPriority(event.target.value as typeof selectedPriority)
              }
              disabled={isPriorityPending}
            >
              {ticketPriorities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={updatePriority}
              disabled={isPriorityPending || selectedPriority === priority}
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPriorityPending ? 'Updating...' : 'Update Priority'}
            </button>
          </div>
          {prioritySuccess ? (
            <p className="text-sm text-emerald-700">{prioritySuccess}</p>
          ) : null}
          {priorityError ? <p className="text-sm text-rose-700">{priorityError}</p> : null}
        </div>
      </div>
    </div>
  );
}
