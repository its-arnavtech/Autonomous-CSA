import Link from 'next/link';
import { AppShell } from '../_auth/app-shell';
import { OrganizationSelection } from '../_auth/organization-selection';
import { requireSessionForPage } from '../_auth/server-auth';

type TicketSummary = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  customerEmail: string;
  customerName?: string | null;
  createdAt: string;
  updatedAt: string;
  latestMessagePreview?: string | null;
  latestTimelineEvent?: {
    type: string;
    createdAt: string;
  } | null;
};

function toneForStatus(status: string) {
  switch (status) {
    case 'RESOLVED':
    case 'CLOSED':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'WAITING_CUSTOMER':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    case 'PENDING':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200';
  }
}

function toneForPriority(priority: string) {
  switch (priority) {
    case 'URGENT':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'HIGH':
      return 'bg-orange-50 text-orange-700 ring-orange-200';
    case 'NORMAL':
      return 'bg-blue-50 text-blue-700 ring-blue-200';
    default:
      return 'bg-zinc-100 text-zinc-700 ring-zinc-200';
  }
}

export default async function TicketsPage() {
  const context = await requireSessionForPage();

  if (!context.activeMembership) {
    return (
      <AppShell
        session={context.session}
        activeMembership={context.activeMembership}
      >
        <OrganizationSelection session={context.session} />
      </AppShell>
    );
  }

  const response = await fetch(`${context.baseUrl}/api/tickets`, {
    cache: 'no-store',
    headers: { cookie: context.cookieHeader },
  });

  let content: React.ReactNode;
  if (!response.ok) {
    const detail = await response.text();
    content = (
      <main className="mx-auto max-w-6xl space-y-4 px-6 py-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="text-lg font-semibold text-rose-800">
            Failed to load tickets
          </h2>
          <pre className="mt-3 overflow-auto rounded-xl bg-white/80 p-3 text-xs text-slate-800">
            {detail}
          </pre>
        </div>
      </main>
    );
  } else {
    const tickets = (await response.json()) as TicketSummary[];
    content = (
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
              Ticket Inbox
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Support requests for{' '}
              <span className="font-medium text-slate-700">
                {context.activeMembership.organizationName}
              </span>
            </p>
          </div>

          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
            {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
          </div>
        </div>

        {tickets.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <h2 className="text-lg font-semibold text-slate-900">No tickets yet</h2>
            <p className="mt-2 text-sm text-slate-500">
              Create a ticket through the authenticated API and it will appear here.
            </p>
          </section>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="hidden grid-cols-[2fr_1.4fr_0.9fr_0.9fr_1fr] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 md:grid">
              <span>Ticket</span>
              <span>Customer</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Updated</span>
            </div>

            <ol className="divide-y divide-slate-200">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    className="block px-5 py-4 transition hover:bg-slate-50"
                    href={`/tickets/${ticket.id}`}
                  >
                    <div className="grid gap-4 md:grid-cols-[2fr_1.4fr_0.9fr_0.9fr_1fr] md:items-start">
                      <div className="space-y-2">
                        <div className="font-medium text-slate-900">
                          {ticket.subject}
                        </div>
                        <div className="text-sm text-slate-500">
                          {ticket.latestMessagePreview ??
                            'No message preview available.'}
                        </div>
                        {ticket.latestTimelineEvent ? (
                          <div className="text-xs text-slate-400">
                            Latest event: {ticket.latestTimelineEvent.type} at{' '}
                            {new Date(
                              ticket.latestTimelineEvent.createdAt,
                            ).toLocaleString()}
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-1 text-sm text-slate-600">
                        <div className="font-medium text-slate-800">
                          {ticket.customerName ?? ticket.customerEmail}
                        </div>
                        <div className="break-all">{ticket.customerEmail}</div>
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneForStatus(ticket.status)}`}
                        >
                          {ticket.status}
                        </span>
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${toneForPriority(ticket.priority)}`}
                        >
                          {ticket.priority}
                        </span>
                      </div>

                      <div className="text-sm text-slate-500">
                        {new Date(ticket.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
      </main>
    );
  }

  return (
    <AppShell
      session={context.session}
      activeMembership={context.activeMembership}
    >
      {content}
    </AppShell>
  );
}
