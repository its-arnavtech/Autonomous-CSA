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
      return 'badge-emerald';
    case 'WAITING_CUSTOMER':
      return 'badge-amber';
    case 'PENDING':
      return 'badge-cyan';
    default:
      return 'badge-neutral';
  }
}

function toneForPriority(priority: string) {
  switch (priority) {
    case 'URGENT':
      return 'badge-rose';
    case 'HIGH':
      return 'badge-amber';
    case 'NORMAL':
      return 'badge-iris';
    default:
      return 'badge-neutral';
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
      <main className="mx-auto max-w-6xl space-y-4 px-5 py-8 sm:px-8">
        <div className="surface rounded-2xl border-rose-glow/30 bg-rose-glow/5 p-5">
          <h2 className="text-lg font-semibold text-rose-glow">
            Failed to load tickets
          </h2>
          <pre className="mono mt-3 overflow-auto rounded-xl border border-white/10 bg-ink-950/60 p-3 text-xs text-mist-400">
            {detail}
          </pre>
        </div>
      </main>
    );
  } else {
    const tickets = (await response.json()) as TicketSummary[];
    content = (
      <main className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-mist-50">
              Ticket inbox
            </h2>
            <p className="mt-1.5 text-sm text-mist-400">
              Support requests for{' '}
              <span className="font-medium text-mist-200">
                {context.activeMembership.organizationName}
              </span>
            </p>
          </div>

          <div className="badge badge-iris !text-xs">
            {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
          </div>
        </div>

        {tickets.length === 0 ? (
          <section className="surface flex flex-col items-center rounded-3xl border-dashed p-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-iris-500/15 ring-1 ring-iris-500/30">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#b7a6ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v9a2 2 0 0 1-2 2h-6l-4 3v-3H6a2 2 0 0 1-2-2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-mist-50">Inbox is clear</h2>
            <p className="mt-2 max-w-sm text-sm text-mist-400">
              No open tickets right now. New support requests will appear here the
              moment they arrive.
            </p>
          </section>
        ) : (
          <div className="surface overflow-hidden rounded-3xl">
            <div className="hidden grid-cols-[2fr_1.4fr_0.9fr_0.9fr_1fr] gap-4 border-b border-white/10 bg-white/[0.02] px-5 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-mist-500 md:grid">
              <span>Ticket</span>
              <span>Customer</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Updated</span>
            </div>

            <ol className="divide-y divide-white/[0.06]">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    className="block px-5 py-4 transition hover:bg-white/[0.03]"
                    href={`/tickets/${ticket.id}`}
                  >
                    <div className="grid gap-4 md:grid-cols-[2fr_1.4fr_0.9fr_0.9fr_1fr] md:items-start">
                      <div className="space-y-1.5">
                        <div className="font-medium text-mist-50">
                          {ticket.subject}
                        </div>
                        <div className="line-clamp-2 text-sm text-mist-400">
                          {ticket.latestMessagePreview ??
                            'No message preview available.'}
                        </div>
                        {ticket.latestTimelineEvent ? (
                          <div className="text-xs text-mist-500">
                            {ticket.latestTimelineEvent.type} ·{' '}
                            {new Date(
                              ticket.latestTimelineEvent.createdAt,
                            ).toLocaleString()}
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-1 text-sm text-mist-300">
                        <div className="font-medium text-mist-200">
                          {ticket.customerName ?? ticket.customerEmail}
                        </div>
                        <div className="mono break-all text-xs text-mist-500">
                          {ticket.customerEmail}
                        </div>
                      </div>

                      <div>
                        <span className={`badge ${toneForStatus(ticket.status)}`}>
                          {ticket.status}
                        </span>
                      </div>

                      <div>
                        <span className={`badge ${toneForPriority(ticket.priority)}`}>
                          {ticket.priority}
                        </span>
                      </div>

                      <div className="text-sm text-mist-400">
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
