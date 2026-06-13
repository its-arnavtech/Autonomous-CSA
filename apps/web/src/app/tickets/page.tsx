import Link from 'next/link';
import { headers } from 'next/headers';

type TicketSummary = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  customerEmail: string;
  customerName?: string | null;
  createdAt: string;
};

type TicketsPageProps = {
  searchParams: { orgId?: string } | Promise<{ orgId?: string }>;
};

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const resolvedSearchParams = await searchParams;
  const orgId = resolvedSearchParams.orgId ?? 'org_demo';
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const base = `${proto}://${host}`;
  const ticketsUrl = `${base}/api/tickets?orgId=${encodeURIComponent(orgId)}`;

  const res = await fetch(ticketsUrl, { cache: 'no-store' });

  if (!res.ok) {
    const detail = await res.text();

    return (
      <main className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <div className="rounded-xl border p-4">
          <h2 className="text-lg font-semibold text-red-700">Failed to load tickets</h2>
          <p className="mt-2 text-xs text-gray-500 break-all">URL: {ticketsUrl}</p>
          <pre className="mt-3 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-black">
            {detail}
          </pre>
        </div>
      </main>
    );
  }

  const tickets = (await res.json()) as TicketSummary[];

  return (
    <main className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-gray-500">Org: {orgId}</p>
      </div>

      {tickets.length === 0 ? (
        <p className="text-sm text-gray-500">No tickets yet.</p>
      ) : (
        <ol className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="rounded-lg border p-3">
              <Link
                className="font-medium underline"
                href={`/tickets/${ticket.id}?orgId=${encodeURIComponent(orgId)}`}
              >
                {ticket.subject}
              </Link>
              <div className="mt-2 grid gap-1 text-sm text-gray-500 sm:grid-cols-2">
                <span>Status: {ticket.status}</span>
                <span>Priority: {ticket.priority}</span>
                <span className="break-all">Customer: {ticket.customerName ?? ticket.customerEmail}</span>
                <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
