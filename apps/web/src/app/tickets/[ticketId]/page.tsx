import { headers } from 'next/headers';

type TimelineEvent = {
  ts: string;
  type: string;
  payload: unknown;
};

type TicketPageProps = {
  params: { ticketId: string } | Promise<{ ticketId: string }>;
  searchParams: { orgId?: string } | Promise<{ orgId?: string }>;
};

function ErrorPanel({
  ticketId,
  orgId,
  status,
  statusText,
  url,
  detail,
}: {
  ticketId: string;
  orgId: string;
  status?: number;
  statusText?: string;
  url: string;
  detail: string;
}) {
  return (
    <div className="p-6 space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Ticket</h1>
        <p className="text-sm text-gray-500 break-all">{ticketId}</p>
        <p className="text-sm text-gray-500">Org: {orgId}</p>
      </div>

      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold text-red-700">Failed to load timeline</h2>
        {status ? (
          <p className="mt-1 text-sm text-gray-600">
            Status: {status} {statusText}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-gray-500 break-all">URL: {url}</p>
        <pre className="mt-3 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-black">
          {detail}
        </pre>
      </div>
    </div>
  );
}

export default async function TicketPage({
  params,
  searchParams,
}: TicketPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const ticketId = resolvedParams.ticketId;
  const orgId = resolvedSearchParams.orgId ?? 'org_demo';

  // Build an absolute URL so server-side fetch works reliably
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const base = `${proto}://${host}`;
  const timelineUrl = `${base}/api/tickets/${encodeURIComponent(ticketId)}/timeline?orgId=${encodeURIComponent(orgId)}`;

  let res: Response;

  try {
    res = await fetch(timelineUrl, { cache: 'no-store' });
  } catch (error) {
    return (
      <ErrorPanel
        ticketId={ticketId}
        orgId={orgId}
        url={timelineUrl}
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  if (!res.ok) {
    const text = await res.text();
    return (
      <ErrorPanel
        ticketId={ticketId}
        orgId={orgId}
        status={res.status}
        statusText={res.statusText}
        url={timelineUrl}
        detail={text}
      />
    );
  }

  let events: TimelineEvent[];

  try {
    const body = await res.json();
    if (!Array.isArray(body)) {
      return (
        <ErrorPanel
          ticketId={ticketId}
          orgId={orgId}
          url={timelineUrl}
          detail={JSON.stringify(body, null, 2)}
        />
      );
    }
    events = body as TimelineEvent[];
  } catch (error) {
    return (
      <ErrorPanel
        ticketId={ticketId}
        orgId={orgId}
        url={timelineUrl}
        detail={error instanceof Error ? error.message : String(error)}
      />
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Ticket</h1>
        <p className="text-sm text-gray-500 break-all">{ticketId}</p>
        <p className="text-sm text-gray-500">Org: {orgId}</p>
      </div>

      <div className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Agent Timeline</h2>

        {events.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No events yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {events.map((e, idx) => (
              <li key={idx} className="rounded-lg border p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">{e.type}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(e.ts).toLocaleString()}
                  </span>
                </div>
                <pre className="mt-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs text-black">
                  {JSON.stringify(e.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
